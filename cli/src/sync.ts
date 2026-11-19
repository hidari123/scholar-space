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

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

/** 同步策略。 */
export type SyncStrategy = 'copy' | 'link' | 'check';

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
function syncFile(sourceRoot: string, targetRoot: string, item: SyncItem): boolean {
  const sourcePath = join(sourceRoot, item.source);
  const targetPath = join(targetRoot, item.destination);

  if (!existsSync(sourcePath)) {
    throw new Error(`源文件不存在：${item.source}`);
  }

  const sourceContent = readFileSync(sourcePath, 'utf8');
  const targetExists = existsSync(targetPath);

  if (targetExists && readFileSync(targetPath, 'utf8') === sourceContent) {
    return false;
  }

  mkdirSync(dirname(targetPath), { recursive: true });
  copyFileSync(sourcePath, targetPath);
  return true;
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
): SyncResult {
  const items = kind === 'python' ? PYTHON_SYNC_ITEMS : TYPESCRIPT_SYNC_ITEMS;
  const copied: string[] = [];
  const failed: string[] = [];
  let changed = false;

  for (const item of items) {
    try {
      const didChange = syncFile(sourceRoot, targetRoot, item);
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
