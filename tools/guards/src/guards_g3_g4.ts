/**
 * G3 / G4 护栏 —— 目录边界与跨包只走公开 API。
 *
 * ⚠️ **G3：TypeScript 目录边界**
 *     `core` 不得依赖 `components` / `hooks` / UI 包，
 *     也不得访问 DOM（`window` / `document` / `localStorage`）。
 *
 * ⚠️ **G4：跨包只走公开 API**
 *     业务代码不许 import 别的包的 `src/` 或 `dist/internal/`。
 *
 * ⚠️ **为什么自己写而不用 eslint-boundaries** ——
 *   那要装 ESLint 8 + 一堆插件，配置还跟 Biome 打架。
 *   我们已经有 Biome 了，再加一个 ESLint 只会让「两套规则」互相矛盾。
 *
 * ⚠️ **为什么不用 `eslint-plugin-boundaries`** ——
 *   同上 —— 少一个依赖，少一套配置冲突。
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { walkFiles } from './guards';

/** ⚠️ **core 层禁止的依赖** —— 这些是「上层」的。 */
const CORE_FORBIDDEN = [
  { pattern: /^@scholarspace\/ui(\/.*)?$/, reason: 'UI 组件包（core 层零 UI 依赖）' },
  { pattern: /^react(-dom)?(\/.*)?$/, reason: 'React（core 层零 React 依赖）' },
  { pattern: /^react-router-dom(\/.*)?$/, reason: '路由（core 层零路由依赖）' },
  { pattern: /^@tanstack\/react-query(\/.*)?$/, reason: '数据请求库（core 层不碰网络）' },
];

/** ⚠️ **core 层禁止的全局** —— 访问 DOM 就说明分层错了。 */
const CORE_FORBIDDEN_GLOBALS = [
  'window',
  'document',
  'localStorage',
  'sessionStorage',
  'navigator',
];

/** ⚠️ **core 层禁止依赖的目录** —— 上层目录。 */
const CORE_FORBIDDEN_DIRS = ['src/components', 'src/hooks', 'src/app'];

/** ⚠️ **禁止跨包 import 的路径特征**。 */
const CROSS_PACKAGE_FORBIDDEN = [
  // ⚠️ **node_modules 里的 @scholarspace 包** ——
  // 走 `src/` 意味着绕过了公开入口。
  {
    pattern: /node_modules\/@scholarspace\/[^/]+\/src\//,
    reason: '别的包的 src（要走公开入口）',
  },
  {
    pattern: /node_modules\/@scholarspace\/[^/]+\/dist\/internal\//,
    reason: '别的包的 internal（internal 不是公开 API）',
  },
  // ⚠️ **workspace 相对路径** ——
  // `../../packages/core/src/...`。
  {
    pattern: /\.\.\/\.\.\/packages\/[^/]+\/src\//,
    reason: '别的包的 src（要走公开入口）',
  },
  {
    pattern: /\.\.\/\.\.\/packages\/[^/]+\/dist\/internal\//,
    reason: '别的包的 internal（internal 不是公开 API）',
  },
];

/** 一个 import 语句。 */
interface ImportInfo {
  /** import 的模块名。 */
  module: string;
  /** 行号（1 基）。 */
  line: number;
}

/**
 * 是不是测试文件。
 *
 * ⚠️ **护栏要跳过测试** ——
 * 测试里会故意写违规的 import 来验证护栏能抓到，
 * 扫到它们就是「自己抓自己」。
 */
export function isTestFile(relPath: string): boolean {
  const name = relPath.split('/').pop() ?? relPath;

  return (
    name.endsWith('.test.ts') ||
    name.endsWith('.test.tsx') ||
    name.endsWith('.spec.ts') ||
    name.endsWith('.spec.tsx') ||
    relPath.includes('/__tests__/') ||
    relPath.includes('/fixtures/')
  );
}

/**
 * 提取文件里的 import。
 *
 * ⚠️ **要处理 `import type`** —— 类型导入也是依赖。
 */
export function extractImports(content: string): ImportInfo[] {
  const imports: ImportInfo[] = [];

  // ⚠️ **不要用 `(?:^|\s)` 打头** ——
  // 那个 `\s` 会吃掉前一个换行符，
  // 导致 `match.index` 偏前一行。
  const pattern = /(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?)\s*from\s*['"]([^'"]+)['"]/g;

  let match = pattern.exec(content);
  while (match !== null) {
    if (match[1]) {
      // ⚠️ **行号** —— 报违规时要能定位
      const line = content.slice(0, match.index).split('\n').length;
      imports.push({ module: match[1], line });
    }
    match = pattern.exec(content);
  }

  return imports;
}

/** 从一行代码里找出用到的全局。 */
function findGlobals(line: string): string[] {
  const found: string[] = [];

  for (const global of CORE_FORBIDDEN_GLOBALS) {
    // ⚠️ **用词边界** —— `myWindow` 不算 `window`
    const pattern = new RegExp(`\\b${global}\\b`);
    if (pattern.test(line)) found.push(global);
  }

  return found;
}

/**
 * G3 —— TypeScript 目录边界。
 */
export const g3 = {
  id: 'G3',
  name: 'TS 目录边界',
  description: 'core 层不得依赖 UI / React / 上层目录，也不得访问 DOM',
  severity: 'error' as const,
  scope: 'apps/web',

  run(root: string): string[] {
    const violations: string[] = [];

    // ⚠️ **扫所有有 src/core 的包** ——
    // 不只是主站，各独立仓的 TS 包也要守这条。
    const packages = findPackagesWithCore(root);

    for (const pkgDir of packages) {
      violations.push(...checkCoreLayer(root, pkgDir));
    }

    return violations;
  },
};

/**
 * G4 —— 跨包只走公开 API。
 */
export const g4 = {
  id: 'G4',
  name: '跨包只走公开 API',
  description: '业务代码不许 import 别的包的 src/ 或 dist/internal/',
  severity: 'error' as const,
  scope: 'packages',

  run(root: string): string[] {
    const violations: string[] = [];

    for (const file of walkFiles(root, ['.ts', '.tsx'])) {
      // ⚠️ **跳过 node_modules 和 dist 自身** ——
      // 那些不是「业务代码」。
      const normalized = file.replace(/\\/g, '/');
      if (normalized.includes('/node_modules/') || normalized.includes('/dist/')) continue;

      // ⚠️ **跳过测试文件** ——
      // 测试里会故意写违规的 import 来验证护栏，
      // 扫到它们就是「自己抓自己」。
      const relFile = relative(root, file).replace(/\\/g, '/');
      if (isTestFile(relFile)) continue;

      const content = readFileSync(file, 'utf8');

      for (const info of extractImports(content)) {
        for (const forbidden of CROSS_PACKAGE_FORBIDDEN) {
          if (forbidden.pattern.test(info.module)) {
            violations.push(
              `${relFile}:${info.line}: import '${info.module}' —— ${forbidden.reason}`,
            );
          }
        }
      }
    }

    return violations;
  },
};

/** 找到所有含 `src/core` 的包。 */
function findPackagesWithCore(root: string): string[] {
  const results: string[] = [];

  // ⚠️ **主仓 + 独立仓** ——
  // 独立仓不在主仓目录下，靠相对路径找。
  const searchRoots = [
    join(root, 'apps'),
    join(root, 'packages'),
    join(root, 'tools'),
    join(root, '..', 'scholarspace-slides'),
    join(root, '..', 'scholarspace-paper'),
    join(root, '..', 'scholarspace-orchestra'),
    join(root, '..', 'scholarspace-community'),
    join(root, '..', 'scholarspace-identity'),
  ];

  for (const searchRoot of searchRoots) {
    if (!existsSync(searchRoot)) continue;

    for (const dir of walkDirectories(searchRoot, 4)) {
      if (existsSync(join(dir, 'src', 'core'))) {
        results.push(dir);
      }
    }
  }

  return results;
}

/** 递归列目录（限深度）。 */
function walkDirectories(root: string, maxDepth: number): string[] {
  if (!existsSync(root)) return [];

  const skip = new Set(['node_modules', 'dist', '.git', '.venv', '__pycache__', 'coverage']);
  const results: string[] = [];

  const walk = (dir: string, depth: number): void => {
    if (depth > maxDepth) return;

    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      // ⚠️ **读不了就跳过** —— 不能因为一个坏目录就崩
      return;
    }

    for (const entry of entries) {
      if (skip.has(entry)) continue;

      const full = join(dir, entry);
      try {
        if (statSync(full).isDirectory()) {
          results.push(full);
          walk(full, depth + 1);
        }
      } catch {
        // ⚠️ **读不了就跳过**
      }
    }
  };

  walk(root, 0);

  return results;
}

/** 检查一个包的 core 层。 */
function checkCoreLayer(root: string, pkgDir: string): string[] {
  const violations: string[] = [];
  const coreDir = join(pkgDir, 'src', 'core');

  for (const file of walkFiles(coreDir, ['.ts', '.tsx'])) {
    const relFile = relative(root, file).replace(/\\/g, '/');

    // ⚠️ **跳过测试文件** ——
    // 测试里会故意写违规的 import 来验证护栏，
    // 扫到它们就是「自己抓自己」。
    if (isTestFile(relFile)) continue;

    const content = readFileSync(file, 'utf8');

    violations.push(...checkCoreImports(relFile, content));
    violations.push(...checkCoreGlobals(relFile, content));
  }

  return violations;
}

/** 检查 core 层的 import。 */
function checkCoreImports(relFile: string, content: string): string[] {
  const violations: string[] = [];

  for (const info of extractImports(content)) {
    violations.push(...checkForbiddenDependency(relFile, info));
    violations.push(...checkUpperDirectory(relFile, info));
  }

  return violations;
}

/** 检查禁止的依赖（UI 包 / React / 路由）。 */
function checkForbiddenDependency(relFile: string, info: ImportInfo): string[] {
  const violations: string[] = [];

  for (const forbidden of CORE_FORBIDDEN) {
    if (forbidden.pattern.test(info.module)) {
      violations.push(
        `${relFile}:${info.line}: core 层 import '${info.module}' —— ${forbidden.reason}`,
      );
    }
  }

  return violations;
}

/** 检查是否 import 了上层目录。 */
function checkUpperDirectory(relFile: string, info: ImportInfo): string[] {
  const violations: string[] = [];

  // ⚠️ **从 core 层往上走** ——
  // `../components/Button` → 命中 `src/components`。
  if (!info.module.startsWith('../')) return violations;

  for (const dir of CORE_FORBIDDEN_DIRS) {
    // ⚠️ **取目录名** —— `src/components` → `components`
    const dirName = dir.split('/').pop() ?? dir;

    if (info.module.includes(`../${dirName}`)) {
      violations.push(
        `${relFile}:${info.line}: core 层 import '${info.module}' —— 不得依赖上层目录（${dirName}）`,
      );
      break;
    }
  }

  return violations;
}

/** 检查 core 层用的 DOM 全局。 */
function checkCoreGlobals(relFile: string, content: string): string[] {
  const violations: string[] = [];

  const lines = content.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    // ⚠️ **跳过注释行** —— 注释里提到 window 不算
    const trimmed = line.trim();
    if (trimmed.startsWith('*') || trimmed.startsWith('//')) continue;

    for (const global of findGlobals(line)) {
      violations.push(
        `${relFile}:${index + 1}: core 层用了 '${global}' —— ` +
          `访问 DOM 说明分层错了，core 应该是纯逻辑`,
      );
    }
  }

  return violations;
}
