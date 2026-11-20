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
import { dirname, extname, join, relative, resolve } from 'node:path';

import { g3, g4 } from './guards_g3_g4';
import { g5 } from './guards_g5';

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

/**
 * 按**精确文件名**找文件（不带扩展名的也要能找）。
 *
 * ⚠️ **为什么需要这个** ——
 *   `walkFiles` 按扩展名过滤，
 *   但 `.importlinter` 的 `extname()` 返回空串 ——
 *   它是纯文件名，没有扩展名。
 *
 * @param dir 起始目录
 * @param names 要找的文件名（精确匹配）
 */
export function walkFilesByName(dir: string, names: string[]): string[] {
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
      results.push(...walkFilesByName(full, names));
    } else if (names.includes(entry)) {
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
 * 护栏扫描的目录（相对仓根）。
 *
 * ⚠️ **两种布局** ——
 *   · 主仓：`packages/` `tools/` `cli/` `examples/` `apps/`
 *   · 独立仓：`libs/`
 *
 *   ⚠️ 之前 G27 只扫 `BASE_SYNC_DIRS`，
 *      结果**独立仓一个文件都没扫到** ——
 *      护栏「通过了」，但其实什么都没检查。
 *
 *      ⚠️ **「假装检查过」比「不检查」更危险** ——
 *      绿勾给人虚假的安全感。
 */
const GUARD_SCAN_DIRS = [...BASE_SYNC_DIRS, 'libs'];

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

// ══════════════════════════════════════════════════════════
// G26 —— 新建包必须带齐「必需文件」
// ══════════════════════════════════════════════════════════
/**
 * 各语言类型的必需文件。
 *
 * ⚠️ **每一条都对应一个实测踩过的坑**：
 *
 *   · `biome.json` —— 缺了 Biome 退回默认（tab 缩进），
 *     与 conventions 的 space×2 冲突 → lint 一堆格式错
 *   · `py.typed` —— 缺了下游包 mypy 报 `import-untyped`
 *   · `mypy.ini` —— mypy **没有配置继承**，必须本地有一份
 */
const REQUIRED_FILES: Array<{
  /** 判定这个包是不是该类型的依据文件。 */
  marker: string;
  /** 标记文件所在目录要有的文件。 */
  required: string[];
  /** 类型说明。 */
  kind: string;
}> = [
  {
    marker: 'package.json',
    required: ['biome.json', 'tsconfig.json'],
    kind: 'TypeScript 包',
  },
  {
    marker: 'pyproject.toml',
    required: ['py.typed'],
    kind: 'Python 包',
  },
];

/**
 * 找某个必需文件的所有可能位置。
 *
 * ⚠️ `py.typed` 的位置很特殊 —— 它在 `src/<包名>/py.typed`，
 * 不是包根。所以要**遍历 src 下的一级子目录**。
 */
function findRequiredFileCandidates(packageDir: string, required: string): string[] {
  const candidates = [join(packageDir, required), join(packageDir, 'src', required)];

  if (required !== 'py.typed') return candidates;

  const srcDir = join(packageDir, 'src');
  if (!existsSync(srcDir)) return candidates;

  for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      candidates.push(join(srcDir, entry.name, 'py.typed'));
    }
  }

  return candidates;
}

/**
 * 检查单个包是否缺必需文件。
 *
 * @returns 违规说明；齐全则返回 null
 */
function checkPackageRequiredFiles(
  root: string,
  packageDir: string,
  rule: (typeof REQUIRED_FILES)[number],
): string | null {
  const relPackage = relative(root, packageDir).replace(/\\/g, '/');

  // ⚠️ 排除「配置源」目录本身 —— packages/conventions 是模板不是包
  if (relPackage.includes('conventions')) return null;

  for (const required of rule.required) {
    const candidates = findRequiredFileCandidates(packageDir, required);
    if (candidates.some((candidate) => existsSync(candidate))) continue;

    // ⚠️ 报错要说明「缺了会怎样」—— 只说「缺文件」没人知道影响
    const impact =
      required === 'biome.json'
        ? 'lint 缩进规则会退回 Biome 默认'
        : '下游包 mypy 会报 import-untyped';

    return `${relPackage}: ${rule.kind}缺少 ${required} —— 没有它，${impact}`;
  }

  return null;
}

const g26: Guard = {
  id: 'G26',
  name: '新建包必需文件齐全',
  description: 'TS 包要有 biome.json，Python 包要有 py.typed（否则 lint/类型检查静默失效）',
  severity: 'error',
  scope: 'packages',
  run(root) {
    const violations: string[] = [];

    for (const dir of GUARD_SCAN_DIRS) {
      const base = join(root, dir);
      if (!existsSync(base)) continue;

      for (const file of walkFiles(base, ['.json', '.toml'])) {
        const name = file.split('\\').pop() ?? file;
        const rule = REQUIRED_FILES.find((item) => item.marker === name);
        if (!rule) continue;

        const violation = checkPackageRequiredFiles(root, dirname(file), rule);
        if (violation) violations.push(violation);
      }
    }

    return violations;
  },
};

/**
 * G27 —— 配置文件必须纯 ASCII。
 *
 * ⚠️ **为什么这条护栏存在**：
 *
 *   mypy / import-linter 用**系统 locale** 读 .ini 文件。
 *   Windows 中文环境的 locale 是 GBK ——
 *   .ini 里只要有一个中文注释，mypy 就直接崩：
 *
 *     UnicodeDecodeError: 'gbk' codec can't decode byte 0x80
 *
 *   不是「类型检查不生效」，是**工具直接挂掉**。
 *
 * ⚠️ **这个坑踩过两次**：
 *   · 主仓的 `packages/conventions/mypy.ini` —— 已修
 *   · 独立仓 `scholarspace-slides` —— **又踩了一次**
 *
 *   独立仓当时没有护栏，所以「修好了」不等于「不会再犯」。
 *   这就是护栏存在的意义。
 *
 * ⚠️ **只查「用 configparser 读」的文件** ——
 *   实测（Windows 中文环境）：
 *
 *   | 文件            | 解析器                 | 中文会崩吗 |
 *   |-----------------|------------------------|-----------|
 *   | `mypy.ini`      | configparser (locale)  | ✅ 崩     |
 *   | `setup.cfg`     | configparser (locale)  | ✅ 崩     |
 *   | `.importlinter` | configparser (locale)  | ✅ 崩     |
 *   | `pytest.ini`    | pytest 自己（UTF-8）  | ❌ 不崩   |
 *   | `pyproject.toml`| tomllib (UTF-8)       | ❌ 不崩   |
 *
 *   ⚠️ **不能「宁可错杀」** ——
 *   护栏一旦误报，人就会开始习惯性忽略它，
 *   那时候它就真的没用了。
 */
const ASCII_SAFE_CONFIGS = ['mypy.ini', 'setup.cfg', '.importlinter'];

/**
 * 找出文件里的非 ASCII 字符。
 *
 * @returns 非 ASCII 字符列表；纯 ASCII 返回空数组
 */
function findNonAscii(content: string): string[] {
  const found: string[] = [];
  for (const char of content) {
    const code = char.codePointAt(0) ?? 0;
    // ⚠️ BOM（U+FEFF）也算 —— 它同样会让 GBK 解码失败
    if (code > 127) found.push(char);
  }
  return found;
}

const g27: Guard = {
  id: 'G27',
  name: '配置文件必须纯 ASCII',
  description: 'mypy.ini / setup.cfg 等配置文件用系统 locale 读取，中文注释会导致 GBK 解码失败',
  severity: 'error',
  scope: 'packages',
  run(root) {
    const violations: string[] = [];

    for (const dir of GUARD_SCAN_DIRS) {
      const base = join(root, dir);
      if (!existsSync(base)) continue;

      // ⚠️ 两种找法：
      //   · 带扩展名的（mypy.ini / setup.cfg）
      //   · 纯文件名的（.importlinter —— extname() 返回空串）
      const candidates = [
        ...walkFiles(base, ['.ini', '.cfg']),
        ...walkFilesByName(base, ['.importlinter']),
      ];

      for (const file of candidates) {
        const name = file.split('\\').pop() ?? file;

        // ⚠️ 只查「用 locale 读」的配置文件
        if (!ASCII_SAFE_CONFIGS.includes(name)) continue;

        const content = readFileSync(file, 'utf8');
        const nonAscii = findNonAscii(content);

        if (nonAscii.length === 0) continue;

        const relFile = relative(root, file).replace(/\\/g, '/');
        const sample = [...new Set(nonAscii)].slice(0, 3).join('');

        violations.push(
          `${relFile}: 含 ${nonAscii.length} 个非 ASCII 字符（如 "${sample}"）—— ` +
            `mypy 用系统 locale（GBK）读 .ini，会抛 UnicodeDecodeError 直接崩；` +
            `配置文件的注释请用英文`,
        );
      }
    }

    return violations;
  },
};

/** 全部护栏。 */
export const GUARDS: Guard[] = [g3, g4, g5, g7, g11, g13, g16, g17, g21, g23, g24, g25, g26, g27];

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
