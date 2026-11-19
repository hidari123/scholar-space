/**
 * 护栏定义 —— G1~G23 的单一真相源。
 *
 * 每条护栏：
 *   - 有唯一 ID（G 编号）
 *   - 有名字与说明
 *   - 有实现（纯函数或命令）
 *   - 有严重级别（error 阻断 / warn 提醒）
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';

/** 严重级别。 */
export type Severity = 'error' | 'warn';

/** 护栏结果。 */
export interface GuardResult {
  id: string;
  name: string;
  severity: Severity;
  ok: boolean;
  /** 违规详情。 */
  violations: string[];
  /** 执行耗时（毫秒）。 */
  durationMs: number;
}

/** 护栏定义。 */
export interface Guard {
  id: string;
  name: string;
  description: string;
  severity: Severity;
  /** 检查根目录（相对主仓）。 */
  scope: string;
  /** 执行检查。 */
  run: (root: string) => string[];
}

/** 遍历目录下的文件（跳过 node_modules 等）。 */
export function walkFiles(dir: string, extensions: string[]): string[] {
  if (!existsSync(dir)) return [];

  const skip = new Set([
    'node_modules',
    'dist',
    '.git',
    '.venv',
    '__pycache__',
    'coverage',
    'build',
  ]);
  const results: string[] = [];

  for (const entry of readdirSync(dir)) {
    if (skip.has(entry)) continue;

    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...walkFiles(full, extensions));
    } else if (extensions.includes(extname(full))) {
      results.push(full);
    }
  }

  return results;
}

/** 读取文本文件（容错）。 */
function readText(path: string): string {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return '';
  }
}

// ══════════════════════════════════════════════════════════
// G7 —— 前端禁止直接 import antd
// ══════════════════════════════════════════════════════════
const g7: Guard = {
  id: 'G7',
  name: '前端禁止直接 import antd',
  description: '业务代码只能 import from @scholarspace/ui，唯一出口铁律',
  severity: 'error',
  scope: 'packages',
  run(root) {
    const violations: string[] = [];
    const importPattern = /from\s+['"]antd(?:['"]|\/)/;

    for (const file of walkFiles(join(root, 'packages'), ['.ts', '.tsx'])) {
      // ui 包本身是唯一允许的入口
      if (
        relative(root, file).includes('packages\\ui\\') ||
        relative(root, file).includes('packages/ui/')
      ) {
        continue;
      }

      const content = readText(file);
      if (importPattern.test(content)) {
        violations.push(`${relative(root, file)}: 直接 import 了 antd`);
      }
    }

    return violations;
  },
};

// ══════════════════════════════════════════════════════════
// G11 —— 组件级禁写颜色
// ══════════════════════════════════════════════════════════
const g11: Guard = {
  id: 'G11',
  name: '组件级禁写硬编码颜色',
  description: '组件级 theme 只调结构（高度/圆角/间距），颜色交给 AntD 算法派生',
  severity: 'error',
  scope: 'packages/ui',
  run(root) {
    const violations: string[] = [];
    const file = join(root, 'packages', 'ui', 'src', 'theme', 'provider.tsx');
    if (!existsSync(file)) return violations;

    const content = readText(file);

    // 找 components 段里的硬编码 hex
    const componentsStart = content.indexOf('components:');
    if (componentsStart === -1) return violations;

    const componentsSection = content.slice(componentsStart);
    const hexPattern = /['"]#[0-9a-fA-F]{3,8}['"]/g;
    const matches = componentsSection.match(hexPattern);

    if (matches) {
      violations.push(
        `packages/ui/src/theme/provider.tsx: components 段含硬编码颜色 ${matches.join(', ')}`,
      );
    }

    return violations;
  },
};

// ══════════════════════════════════════════════════════════
// G13 —— i18n key 命名规范
// ══════════════════════════════════════════════════════════
const g13: Guard = {
  id: 'G13',
  name: 'i18n key 命名规范',
  description: 'key 必须是 {domain}.{section}.{element}[.{state}]',
  severity: 'error',
  scope: 'packages',
  run(root) {
    const violations: string[] = [];
    const keyPattern = /^([a-z][a-zA-Z0-9]*)\.[a-zA-Z][a-zA-Z0-9]*(\.[a-zA-Z][a-zA-Z0-9]*)*$/;

    for (const file of walkFiles(join(root, 'packages'), ['.ts', '.tsx'])) {
      if (!file.includes('i18n')) continue;
      // ⚠️ 测试文件里的 key 是故意造的假数据，不该被拦
      if (file.includes('.test.') || file.includes('.spec.')) continue;

      const content = readText(file);
      violations.push(...checkKeysInFile(root, file, content, keyPattern));
    }

    return violations;
  },
};

/**
 * 允许的 i18n domain。
 *
 * 与 docs/03-语言体系.md 的 key 规范一致。
 */
const ALLOWED_I18N_DOMAINS = new Set([
  'auth',
  'paper',
  'slides',
  'orchestra',
  'community',
  'billing',
  'pdf',
  'common',
  'theme',
  'i18n',
  'error',
  'app',
]);

/**
 * 检查一个文件里的 i18n key。
 */
function checkKeysInFile(
  root: string,
  file: string,
  content: string,
  keyPattern: RegExp,
): string[] {
  const violations: string[] = [];
  // 匹配形如 'domain.section.element' 的字面量
  const literalPattern = /['"]([a-z][a-zA-Z0-9]*(?:\.[a-zA-Z][a-zA-Z0-9]*)+)['"]/g;

  for (const match of content.matchAll(literalPattern)) {
    const key = match[1];
    if (!key) continue;
    if (!keyPattern.test(key)) continue;

    const domain = key.split('.')[0];
    if (domain && !ALLOWED_I18N_DOMAINS.has(domain)) {
      violations.push(`${relative(root, file)}: key "${key}" 的 domain "${domain}" 不在允许列表`);
    }
  }

  return violations;
}

// ══════════════════════════════════════════════════════════
// G16 —— 密钥泄漏
// ══════════════════════════════════════════════════════════
const g16: Guard = {
  id: 'G16',
  name: '密钥泄漏',
  description: '源码里不得出现硬编码的密钥',
  severity: 'error',
  scope: 'packages',
  run(root) {
    const violations: string[] = [];
    // 常见密钥模式
    const patterns: RegExp[] = [
      /sk-[A-Za-z0-9]{20,}/, // OpenAI
      /ghp_[A-Za-z0-9]{30,}/, // GitHub token
      /AKIA[0-9A-Z]{16}/, // AWS access key
      /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    ];

    for (const file of walkFiles(join(root, 'packages'), [
      '.ts',
      '.tsx',
      '.py',
      '.toml',
      '.json',
    ])) {
      if (file.includes('.env')) continue;

      const content = readText(file);
      for (const pattern of patterns) {
        if (pattern.test(content)) {
          violations.push(`${relative(root, file)}: 疑似硬编码密钥（${pattern.source}）`);
        }
      }
    }

    return violations;
  },
};

// ══════════════════════════════════════════════════════════
// G17 —— License 白名单
// ══════════════════════════════════════════════════════════
const g17: Guard = {
  id: 'G17',
  name: 'License 合规',
  description: '禁止 AGPL / GPL-3.0 / SSPL 进入仓库',
  severity: 'error',
  scope: 'packages',
  run(root) {
    const violations: string[] = [];
    const forbidden = ['AGPL', 'GPL-3.0', 'SSPL', 'AGPL-3.0'];

    for (const file of walkFiles(join(root, 'packages'), ['.json'])) {
      if (file.includes('package-lock')) continue;

      const content = readText(file);
      for (const license of forbidden) {
        if (content.includes(license)) {
          violations.push(`${relative(root, file)}: 含被禁 license "${license}"`);
        }
      }
    }

    return violations;
  },
};

// ══════════════════════════════════════════════════════════
// G21 —— 包体积
// ══════════════════════════════════════════════════════════
const g21: Guard = {
  id: 'G21',
  name: '包体积上限',
  description: '@scholarspace/ui ≤ 80 kB gzip（不含 antd）',
  severity: 'warn',
  scope: 'packages/ui',
  run(root) {
    const violations: string[] = [];
    const distDir = join(root, 'packages', 'ui', 'dist');
    if (!existsSync(distDir)) return violations;

    const limitKb = 80;
    let total = 0;

    for (const entry of readdirSync(distDir)) {
      const path = join(distDir, entry);
      if (!statSync(path).isFile()) continue;
      if (!entry.endsWith('.js') && !entry.endsWith('.css')) continue;

      total += statSync(path).size;
    }

    const sizeKb = total / 1024;
    if (sizeKb > limitKb) {
      violations.push(`packages/ui/dist 体积 ${sizeKb.toFixed(1)} kB 超过上限 ${limitKb} kB`);
    }

    return violations;
  },
};

// ══════════════════════════════════════════════════════════
// G23 —— extends 引用有效性
// ══════════════════════════════════════════════════════════
const g23: Guard = {
  id: 'G23',
  name: 'extends 引用有效性',
  description: 'tsconfig / biome 的 extends 目标必须存在（biome 失效时是静默的）',
  severity: 'error',
  scope: 'packages',
  run(root) {
    const violations: string[] = [];

    const checkExtends = (file: string, pattern: RegExp): void => {
      if (!existsSync(file)) return;

      const content = readText(file);
      const match = content.match(pattern);
      const target = match?.[1] ?? match?.[2];
      if (!target) return;

      const targetPath = resolve(join(file, '..'), target);
      if (!existsSync(targetPath)) {
        violations.push(`${relative(root, file)}: extends "${target}" 目标不存在`);
      }
    };

    for (const dir of ['packages', 'tools', 'cli', 'examples']) {
      const base = join(root, dir);
      if (!existsSync(base)) continue;

      for (const file of walkFiles(base, ['.json'])) {
        const name = file.split('\\').pop() ?? file;
        if (name === 'tsconfig.json') {
          checkExtends(file, /"extends"\s*:\s*"([^"]+)"/);
        }
        if (name === 'biome.json') {
          checkExtends(file, /"extends"\s*:\s*(?:"([^"]+)"|\[\s*"([^"]+)")/);
        }
      }
    }

    return violations;
  },
};

// ══════════════════════════════════════════════════════════
// G24 —— 中文测试函数名
// ══════════════════════════════════════════════════════════
const g24: Guard = {
  id: 'G24',
  name: '测试函数名必须英文',
  description: '非 ASCII 函数名会被 ruff N802/PLC2401 拦截，且带空格会直接语法错误',
  severity: 'error',
  scope: 'packages',
  run(root) {
    const violations: string[] = [];
    // ⚠️ 只用正则抓函数名，非 ASCII 的判定放在代码里
    //    （正则里写 \u0000 会被 biome 的 noControlCharactersInRegex 拦）
    const pattern = /^\s*(?:async\s+)?def\s+(test_[^\s(]*)\s*\(/gm;

    for (const file of walkFiles(join(root, 'packages'), ['.py'])) {
      const content = readText(file);
      for (const match of content.matchAll(pattern)) {
        const name = match[1];
        if (!name) continue;
        if (!hasNonAscii(name)) continue;

        violations.push(`${relative(root, file)}: 测试函数名 "${name}" 含非 ASCII 字符`);
      }
    }

    return violations;
  },
};

/**
 * 字符串是否含非 ASCII 字符。
 */
function hasNonAscii(text: string): boolean {
  for (const char of text) {
    const code = char.codePointAt(0);
    if (code === undefined) continue;
    if (code > 127) return true;
  }
  return false;
}

// ══════════════════════════════════════════════════════════
// G25 —— 规范基座副本与源同步
// ══════════════════════════════════════════════════════════

/**
 * 基座文件清单：源 → 副本名。
 *
 * ⚠️ 与 `cli/src/core/sync.ts` 的 SYNC_ITEMS 保持一致。
 *    两边都要改 —— 这里漏了就会漏检。
 */
const BASE_SYNC_MAP: Array<{ source: string; copy: string }> = [
  // TypeScript
  {
    source: 'packages/conventions/typescript/tsconfig.base.json',
    copy: 'tsconfig.base.json',
  },
  {
    source: 'packages/conventions/typescript/biome.json',
    copy: 'biome.base.json',
  },
  // Python
  { source: 'packages/conventions/python/ruff.toml', copy: 'ruff.toml' },
  { source: 'packages/conventions/python/mypy.ini', copy: 'mypy.ini' },
];

/**
 * 允许的本地改动。
 *
 * ⚠️ 必须与 `cli/src/core/sync.ts` 的 SYNC_EXCEPTIONS 保持一致 ——
 *    两边算法不同就会「sync 说没问题，guard 说有问题」。
 *
 * ⚠️ `copy` 是**相对主仓的路径** —— 不是文件名。
 *    用文件名会误伤所有 mypy.ini（只有 core 需要 pydantic 插件）。
 */
const BASE_SYNC_EXCEPTIONS: Array<{ path: string; addition: string; reason: string }> = [
  {
    path: 'packages/core/mypy.ini',
    addition: 'plugins = pydantic.mypy',
    reason:
      'core 用 pydantic，需要启用 pydantic.mypy 插件；' +
      'base 不启用（纯领域包没装 pydantic，插件会加载失败）',
  },
];

/** 需要检查副本的目录（相对主仓）。 */
const BASE_SYNC_DIRS = ['packages', 'tools', 'cli', 'examples', 'apps'];

/**
 * 归一化内容以便比较。
 *
 * ⚠️ 要忽略：
 *   · 行尾（CRLF vs LF）—— Windows 与 Linux 会不一致
 *   · BOM —— PowerShell 的 Out-File 会加
 *   · 末尾空行
 */
function normalizeForCompare(content: string): string {
  return content
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\s+$/, '');
}

/**
 * 把允许的本地偏离应用到源内容上。
 *
 * ⚠️ 必须与 `cli/src/core/sync.ts` 的 `applyExceptions` **算法一致** ——
 *    两边不一致就会出现「sync 说没问题，guard 说有问题」。
 */
function applyExceptions(sourceContent: string, relPath: string): string {
  let result = sourceContent;

  for (const exception of BASE_SYNC_EXCEPTIONS) {
    if (exception.path !== relPath) continue;
    // ⚠️ 必须忽略注释行 —— 源文件里有 `#   plugins = pydantic.mypy`
    //    这样的说明注释，直接 includes 会误判「已经有了」。
    if (hasActiveOption(result, exception.addition)) continue;

    result = insertIntoSection(result, exception.addition);
  }

  return normalizeForCompare(result);
}

/**
 * 把一行配置插到**配置段内部**。
 *
 * ⚠️ 必须与 `cli/src/core/sync.ts` 的 `insertIntoSection` 一致。
 */
function insertIntoSection(content: string, option: string): string {
  const lines = content.split('\n');

  const sectionIndex = lines.findIndex((line) => line.trim().startsWith('['));
  if (sectionIndex < 0) {
    return `${content}\n${option}\n`;
  }

  let insertAt = sectionIndex + 1;
  for (let index = sectionIndex + 1; index < lines.length; index += 1) {
    const trimmed = (lines[index] ?? '').trim();
    if (trimmed === '') continue;
    if (trimmed.startsWith('#')) continue;
    if (trimmed.startsWith('[')) break;
    insertAt = index;
    break;
  }

  lines.splice(insertAt, 0, option);
  return lines.join('\n');
}

/**
 * 配置项是否已**真正生效**（不是注释里的说明）。
 *
 * ⚠️ 必须与 `cli/src/core/sync.ts` 的 `hasActiveOption` 一致。
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

const g25: Guard = {
  id: 'G25',
  name: '规范基座副本与源同步',
  description: '各仓的 base 副本必须与 packages/conventions 的源一致（改了源要重新 cli sync）',
  severity: 'error',
  scope: 'packages',
  run(root) {
    const violations: string[] = [];

    for (const dir of BASE_SYNC_DIRS) {
      const base = join(root, dir);
      if (!existsSync(base)) continue;

      for (const file of walkFiles(base, ['.json', '.toml', '.ini'])) {
        const violation = checkBaseCopy(root, file);
        if (violation) violations.push(violation);
      }
    }

    return violations;
  },
};

/**
 * 检查单个 base 副本是否与源一致。
 *
 * @returns 违规说明；一致则返回 null
 */
function checkBaseCopy(root: string, file: string): string | null {
  const name = file.split('\\').pop() ?? file;
  const entry = BASE_SYNC_MAP.find((item) => item.copy === name);
  if (!entry) return null;

  // 源文件本身跳过
  if (normalizeForCompare(file) === normalizeForCompare(join(root, entry.source))) {
    return null;
  }

  const sourcePath = join(root, entry.source);
  if (!existsSync(sourcePath)) return null;

  const relPath = relative(root, file).replace(/\\/g, '/');
  const sourceContent = normalizeForCompare(readText(sourcePath));
  const copyContent = normalizeForCompare(readText(file));

  // ⚠️ 允许的本地偏离 —— 与 cli 的 SYNC_EXCEPTIONS 同一套算法：
  //    「源 + 偏离」与副本比较。
  const expected = applyExceptions(sourceContent, relPath);
  if (expected === copyContent) return null;

  const kind = name.includes('toml') || name.includes('ini') ? 'python' : 'typescript';

  return `${relPath}: 与 ${entry.source} 不一致 —— ` + `请跑 \`cli sync --kind ${kind}\``;
}

/** 全部护栏。 */
export const GUARDS: Guard[] = [g7, g11, g13, g16, g17, g21, g23, g24, g25];

/**
 * 执行全部护栏。
 */
export function runGuards(root: string, only?: string[]): GuardResult[] {
  const selected = only ? GUARDS.filter((guard) => only.includes(guard.id)) : GUARDS;

  return selected.map((guard) => {
    const started = Date.now();

    let violations: string[] = [];
    try {
      violations = guard.run(root);
    } catch (error) {
      violations = [`执行失败：${error instanceof Error ? error.message : String(error)}`];
    }

    return {
      id: guard.id,
      name: guard.name,
      severity: guard.severity,
      ok: violations.length === 0,
      violations,
      durationMs: Date.now() - started,
    };
  });
}

/**
 * 执行一条外部命令并返回输出。
 */
export function runCommand(command: string, args: string[], cwd: string): string {
  return execFileSync(command, args, { cwd, encoding: 'utf8', stdio: 'pipe' });
}
