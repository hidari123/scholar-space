/**
 * `cli sync` —— 跨仓规范同步。
 *
 * ⚠️ 为什么必须有这个命令（解决 polyrepo 的头号隐患）：
 *
 * 子仓的 CI 是**独立 checkout** 的，仓库里没有 `../../packages/conventions/`。
 * 此时 `extends = "../../packages/conventions/python/ruff.toml"` 会：
 *   - ruff：直接报错「Failed to load extended configuration」（可见）
 *   - mypy：报「Unrecognized option: extends」（可见）
 *   - ⚠️ **biome**：extends 数组里的路径不存在时**静默失效**（不可见！）
 *
 * 所以规范同步必须是**显式、可版本化**的动作：
 *   把 base 配置**复制**进子仓，让 CI 不依赖主仓在场。
 *
 * 两种策略：
 *   A. copy  —— 复制 base 文件进子仓（推荐：CI 无外部依赖）
 *   B. link  —— 子仓写相对路径，依赖主仓在场（仅本地开发）
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

/** 同步策略。 */
export type SyncStrategy = 'copy' | 'link' | 'check';

/**
 * 允许的本地偏离。
 *
 * ⚠️ 每条都要写**为什么** —— 无理由的偏离等于没有护栏。
 *
 * ⚠️ `path` 是**相对目标仓的路径** —— 不是文件名。
 *    用文件名会误伤所有 mypy.ini（只有 core 需要 pydantic 插件）。
 *
 * ⚠️ 这些偏离**由调用方按需启用**（`options.applyExceptions`）——
 *    CLI 同步到哪个仓不知道该仓是否用 pydantic，
 *    所以由知道答案的一方（人 / CI 配置）决定。
 */
export const SYNC_EXCEPTIONS: Array<{ path: string; addition: string; reason: string }> = [
  {
    path: 'mypy.ini',
    addition: 'plugins = pydantic.mypy',
    reason:
      '用 pydantic 的包需要启用 pydantic.mypy 插件；' +
      'base 不启用（纯领域包没装 pydantic，插件会加载失败）',
  },
];

/** 同步结果。 */
export interface SyncResult {
  /** 目标根目录。 */
  target: string;
  /** 复制的文件。 */
  copied: string[];
  /** 出错的文件。 */
  failed: string[];
  /** 策略。 */
  strategy: SyncStrategy;
  /** 是否有变更。 */
  changed: boolean;
}

/**
 * 归一化内容以便比较。
 *
 * ⚠️ 要忽略行尾（CRLF vs LF）与 BOM —— Windows 与 Linux 的正常差异。
 */
function normalize(content: string): string {
  return content
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .trimEnd();
}

/**
 * 把允许的本地偏离应用到源内容上。
 *
 * ⚠️ 为什么要「应用」而不是「忽略」——
 *    偏离是**真实需要**的（core 需要 pydantic 插件）。
 *    同步时把它加上，源更新时它也保留 —— 不会丢。
 *
 * ⚠️ 插入位置必须是**配置段内部**，不能是文件头的注释区 ——
 *    否则插到注释里，mypy 根本不会读它。
 */
function applyExceptions(sourceContent: string, destination: string, enabled: boolean): string {
  // ⚠️ 不启用偏离 → 原样返回
  if (!enabled) return sourceContent;

  let result = sourceContent;

  for (const exception of SYNC_EXCEPTIONS) {
    if (exception.path !== destination) continue;

    // ⚠️ 已经有这个偏离了 → 不重复加。
    //    ⚠️ 必须**忽略注释行** —— 源文件里有
    //    `#   plugins = pydantic.mypy` 这样的说明注释，
    //    直接 includes 会误判「已经有了」而永远不加真正的配置行。
    if (hasActiveOption(result, exception.addition)) continue;

    result = insertIntoSection(result, exception.addition);
  }

  return result;
}

/**
 * 把一行配置插到**配置段内部**。
 *
 * ⚠️ 插入位置必须是段内 —— 不能是文件头的注释区，
 *    否则插到注释里，mypy 根本不会读它。
 */
function insertIntoSection(content: string, option: string): string {
  const lines = content.split('\n');

  // 找配置段的段首（如 `[mypy]`）
  const sectionIndex = lines.findIndex((line) => line.trim().startsWith('['));
  if (sectionIndex < 0) {
    return `${content}\n${option}\n`;
  }

  // 在段内找第一个非注释、非空的行 → 插在它前面
  const insertAt = findFirstConfigLine(lines, sectionIndex);

  lines.splice(insertAt, 0, option);
  return lines.join('\n');
}

/**
 * 段内第一个「真实配置行」的索引。
 *
 * 找不到就返回段首之后一行。
 */
function findFirstConfigLine(lines: string[], sectionIndex: number): number {
  for (let index = sectionIndex + 1; index < lines.length; index += 1) {
    const trimmed = (lines[index] ?? '').trim();
    if (trimmed === '') continue;
    if (trimmed.startsWith('#')) continue;
    if (trimmed.startsWith('[')) break; // 下一个段
    return index;
  }

  // 段内全是注释 → 插在段首之后
  return sectionIndex + 1;
}

/**
 * 配置项是否已**真正生效**（不是注释里的说明）。
 *
 * ⚠️ 必须忽略注释行 —— 否则
 * `#   plugins = pydantic.mypy` 会让检查误判「已经有了」。
 */
function hasActiveOption(content: string, option: string): boolean {
  const key = option.split('=')[0]?.trim() ?? option;

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    if (trimmed.startsWith('#') || trimmed.startsWith(';')) continue;
    if (trimmed.startsWith(key)) return true;
  }

  return false;
}

/**
 * 需要同步到子仓的 base 配置。
 *
 * ⚠️ 关键：**只同步"工具会 extends 的文件"**，不包括 schema/json 契约
 *    （那些是"运行时读取"，不复制）。
 */
export interface SyncItem {
  /** base 文件（相对主仓根）。 */
  source: string;
  /** 目标文件（相对子仓根）。 */
  destination: string;
  /** 说明。 */
  note: string;
}

/**
 * Python 侧的同步清单。
 *
 * ⚠️ mypy 不支持 include/extends → 必须**复制**。
 * ⚠️ import-linter 只认 setup.cfg / .importlinter / pyproject.toml → 复制成 setup.cfg。
 * ⚠️ ruff 的 extends 支持相对路径，但子仓 CI 独立 checkout 时该路径不存在 →
 *    **必须复制**成本地副本，pyproject.toml 指向它。
 */
export const PYTHON_SYNC_ITEMS: SyncItem[] = [
  {
    source: 'packages/conventions/python/ruff.toml',
    destination: 'ruff.toml',
    note: 'ruff extends 需要本地副本',
  },
  {
    source: 'packages/conventions/python/mypy.ini',
    destination: 'mypy.ini',
    note: 'mypy 无继承机制，必须复制',
  },
];

/**
 * TypeScript 侧的同步清单。
 *
 * ⚠️ tsconfig / biome 都支持 extends，但**路径是相对的** ——
 *    子仓里 `../../packages/conventions/...` 不存在。
 *    复制进子仓后，子仓的 tsconfig.json extends 本地副本。
 */
export const TYPESCRIPT_SYNC_ITEMS: SyncItem[] = [
  {
    source: 'packages/conventions/typescript/tsconfig.base.json',
    destination: 'tsconfig.base.json',
    note: 'tsconfig extends 需要本地副本',
  },
  {
    source: 'packages/conventions/typescript/biome.json',
    destination: 'biome.base.json',
    note: 'biome extends 需要本地副本',
  },
];

/**
 * 同步一个文件。
 *
 * @param sourceRoot 主仓根
 * @param targetRoot 子仓根
 * @param item 同步项
 * @returns 是否发生变化
 */
function syncFile(
  sourceRoot: string,
  targetRoot: string,
  item: SyncItem,
  strategy: SyncStrategy = 'copy',
  applyLocalExceptions = false,
): boolean {
  const sourcePath = join(sourceRoot, item.source);
  const targetPath = join(targetRoot, item.destination);

  if (!existsSync(sourcePath)) {
    throw new Error(`源文件不存在：${item.source}`);
  }

  const sourceContent = readFileSync(sourcePath, 'utf8');

  const targetExists = existsSync(targetPath);
  const current = targetExists ? readFileSync(targetPath, 'utf8') : '';

  // ⚠️ 期望内容 = 源 + 本地偏离。
  //
  //    ⚠️ **默认保留目标里已有的偏离** —— 同步不该「顺手删掉」
  //    本地有意加的配置（比如 core 的 pydantic 插件）。
  //    只有显式 `--with-exceptions` 才主动补齐偏离。
  const expected = applyLocalExceptions
    ? applyExceptions(sourceContent, item.destination, true)
    : preserveLocalAdditions(sourceContent, current, item.destination);

  if (normalize(current) === normalize(expected)) {
    return false;
  }

  // ⚠️ check 策略 —— **只检查不改**。
  //    CI 用它来判断「副本是否过期」，改了会污染工作区。
  if (strategy === 'check') {
    return true;
  }

  mkdirSync(dirname(targetPath), { recursive: true });

  // ⚠️ 写期望内容而不是整体 copyFileSync ——
  //    直接覆盖会把本地偏离抹掉。
  writeFileSync(targetPath, expected, 'utf8');

  return true;
}

/**
 * 保留目标里「源没有、目标有」的配置行。
 *
 * ⚠️ 只保留**配置行**（`key = value`），不保留注释 ——
 *    注释是给人看的，跟着源更新更合适。
 */
function preserveLocalAdditions(
  sourceContent: string,
  currentContent: string,
  destination: string,
): string {
  let result = sourceContent;

  for (const exception of SYNC_EXCEPTIONS) {
    if (exception.path !== destination) continue;
    // ⚠️ 源里已经有了 → 不用补
    if (hasActiveOption(result, exception.addition)) continue;
    // ⚠️ 目标里没有 → 不用保留
    if (!hasActiveOption(currentContent, exception.addition)) continue;

    result = applyExceptions(result, destination, true);
  }

  return result;
}

/**
 * 把 base 配置同步到目标仓。
 *
 * @param sourceRoot 主仓根目录
 * @param targetRoot 目标仓根目录
 * @param kind 目标类型
 * @param strategy 策略
 */
export function syncConventions(
  sourceRoot: string,
  targetRoot: string,
  kind: 'python' | 'typescript',
  strategy: SyncStrategy = 'copy',
  applyLocalExceptions = false,
): SyncResult {
  const items = kind === 'python' ? PYTHON_SYNC_ITEMS : TYPESCRIPT_SYNC_ITEMS;
  const copied: string[] = [];
  const failed: string[] = [];
  let changed = false;

  for (const item of items) {
    try {
      const didChange = syncFile(sourceRoot, targetRoot, item, strategy, applyLocalExceptions);
      if (didChange) {
        copied.push(item.destination);
        changed = true;
      }
    } catch (error) {
      failed.push(`${item.destination}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { target: targetRoot, copied, failed, strategy, changed };
}

/**
 * 写出「子仓应该怎么引用本地副本」的说明文件。
 *
 * 让子仓的 tsconfig.json 指向同步过来的本地副本，
 * 而不是主仓的相对路径。
 */
export function writeLocalExtendsGuide(targetRoot: string, kind: 'python' | 'typescript'): string {
  const guidePath = join(targetRoot, 'SYNC.md');
  const content =
    kind === 'python'
      ? `# 规范同步说明\n\n本目录的 \`ruff.toml\` 与 \`mypy.ini\` 是从主仓 \`packages/conventions/python/\` **复制**而来。\n\n⚠️ 子仓 CI 独立 checkout，没有主仓在场：\n   - ruff 的 \`extends = "./ruff.toml"\` 需要本地副本\n   - mypy 不支持配置继承（\`extends\` / \`include\` 都不行），只能复制\n\n更新方式：\n\n\`\`\`bash\nnpx @scholarspace/cli sync --kind python\n\`\`\`\n\n⚠️ 复制后请勿手改 —— 下次同步会覆盖。\n`
      : `# 规范同步说明\n\n本目录的 \`tsconfig.base.json\` / \`biome.base.json\` 是从主仓 **复制**而来。\n\n⚠️ 子仓 CI 独立 checkout，没有主仓在场，相对路径 extends 会**静默失效**（biome 尤其危险）。\n\n本仓的 \`tsconfig.json\` 应指向本地副本：\n\n\`\`\`json\n{\n  "extends": "./tsconfig.base.json"\n}\n\`\`\`\n\n\`\`\`json\n{\n  "extends": ["./biome.base.json"]\n}\n\`\`\`\n\n更新方式：\n\n\`\`\`bash\nnpx @scholarspace/cli sync --kind typescript\n\`\`\`\n\n⚠️ 复制后请勿手改 —— 下次同步会覆盖。\n`;

  mkdirSync(dirname(guidePath), { recursive: true });
  writeFileSync(guidePath, content, 'utf8');
  return guidePath;
}

/**
 * 检测子仓的 extends 是否指向了不存在的路径。
 *
 * 这是"静默失效"的探针 —— CI 里应该跑它。
 */
export function detectBrokenExtends(targetRoot: string): string[] {
  const problems: string[] = [];

  const tsconfigPath = join(targetRoot, 'tsconfig.json');
  if (existsSync(tsconfigPath)) {
    const content = readFileSync(tsconfigPath, 'utf8');
    const match = content.match(/"extends"\s*:\s*"([^"]+)"/);
    if (match?.[1]) {
      const extendsPath = resolve(targetRoot, match[1]);
      if (!existsSync(extendsPath)) {
        problems.push(
          `tsconfig.json extends "${match[1]}" —— 目标不存在：${relative(targetRoot, extendsPath)}`,
        );
      }
    }
  }

  const biomePath = join(targetRoot, 'biome.json');
  if (existsSync(biomePath)) {
    const content = readFileSync(biomePath, 'utf8');
    const match = content.match(/"extends"\s*:\s*(?:"([^"]+)"|\[\s*"([^"]+)")/);
    const target = match?.[1] ?? match?.[2];
    if (target) {
      const extendsPath = resolve(targetRoot, target);
      if (!existsSync(extendsPath)) {
        problems.push(
          `biome.json extends "${target}" —— 目标不存在：${relative(targetRoot, extendsPath)}`,
        );
      }
    }
  }

  return problems;
}
