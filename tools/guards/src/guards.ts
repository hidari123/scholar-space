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

/** 全部护栏。 */
export const GUARDS: Guard[] = [g7, g11, g13, g16, g17, g21, g23, g24];

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
