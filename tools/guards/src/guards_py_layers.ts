/**
 * G28 护栏 —— Python 四层架构边界。
 *
 * ⚠️ **为什么自己写而不用 import-linter** ——
 *   实测发现：**23 个 Python 包里有 21 个没有 import-linter 契约**，
 *   而且 import-linter 根本没装在任何服务的 venv 里。
 *   也就是说「四层架构」这条约束**一直是纸面上的**。
 *
 *   ⚠️ **装依赖不是好办法** ——
 *   每个包的 venv 都要装，CI 也要装，
 *   少装一个就「静默不检查」（比不检查更危险）。
 *
 *   ⚠️ **所以自己解析 AST** ——
 *   Python 标准库自带 `ast`，零依赖。
 *
 * ⚠️ **四层结构**（ADR-0001）：
 *
 *     interfaces → infrastructure → application → domain
 *
 *   规则：
 *     · `domain` 零外部依赖（只准标准库）
 *     · `application` 不碰 `infrastructure`
 *     · `interfaces` 不碰 `infrastructure` / `domain` 内部实现
 *     · `domain` 不碰 `application`（单向）
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/** 四层，从外到内。 */
const LAYERS = ['interfaces', 'infrastructure', 'application', 'domain'] as const;

/** 某层。 */
type Layer = (typeof LAYERS)[number];

/**
 * ⚠️ **domain 层禁止的外部依赖** ——
 * 这些都会把「纯逻辑」拖进「有副作用」。
 */
const DOMAIN_FORBIDDEN = new Set([
  'fastapi',
  'starlette',
  'flask',
  'sqlalchemy',
  'alembic',
  'requests',
  'httpx',
  'aiohttp',
  'redis',
  'minio',
  'boto3',
  'celery',
  'arq',
  'pydantic_settings',
  'dotenv',
  'psycopg',
  'psycopg2',
  'pymongo',
  'motor',
  'sqlmodel',
]);

/**
 * 解析 import 的 Python 脚本。
 *
 * ⚠️ **为什么用 Python 的 `ast` 而不是正则** ——
 *    正则分不清「真的 import」和「字符串里的 import」，
 *    也处理不了 `from x import (a, b)` 这种多行写法。
 *
 * ⚠️ **`ast` 是标准库** —— 零额外依赖，
 *    任何有 Python 的环境都能跑。
 */
const PARSE_IMPORTS_SCRIPT = `
import ast, json, sys

try:
    with open(sys.argv[1], encoding='utf-8') as handle:
        tree = ast.parse(handle.read(), filename=sys.argv[1])
except (SyntaxError, UnicodeDecodeError):
    sys.exit(0)

out = []
for node in ast.walk(tree):
    if isinstance(node, ast.Import):
        for alias in node.names:
            out.append({"module": alias.name, "line": node.lineno, "rel": False})
    elif isinstance(node, ast.ImportFrom):
        # ⚠️ **level > 0 是相对导入**
        out.append({
            "module": node.module or "",
            "line": node.lineno,
            "rel": node.level > 0,
        })

print(json.dumps(out))
`;

/** 一个 import 记录。 */
interface PyImport {
  /** 模块名（顶层）。 */
  module: string;
  /** 行号（1 基）。 */
  line: number;
  /** 是相对导入吗（`from .x import y`）。 */
  isRelative: boolean;
}

/**
 * 找出某个包里的 Python 源码。
 *
 * @param packageDir 包目录
 */
export function findPyFiles(packageDir: string): string[] {
  if (!existsSync(packageDir)) return [];

  const skip = new Set([
    '__pycache__',
    '.venv',
    'node_modules',
    '.git',
    '.pytest_cache',
    '.mypy_cache',
    '.ruff_cache',
    'dist',
    'build',
    '.eggs',
  ]);

  return walkPyFiles(packageDir, skip);
}

/**
 * 递归找 Python 文件。
 *
 * ⚠️ **拆出来是为了控制复杂度** ——
 * biome 的 `noExcessiveCognitiveComplexity` 限制 15。
 */
function walkPyFiles(dir: string, skip: Set<string>): string[] {
  const results: string[] = [];

  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (skip.has(entry)) continue;

    const full = join(dir, entry);
    try {
      if (statSync(full).isDirectory()) {
        results.push(...walkPyFiles(full, skip));
      } else if (full.endsWith('.py')) {
        results.push(full);
      }
    } catch {
      // ⚠️ **读不了就跳过**
    }
  }

  return results;
}

/**
 * 用 Python 的 `ast` 解析 import。
 *
 * ⚠️ **为什么用 Python 而不是正则** ——
 *   正则分不清「真的 import」和「字符串里的 import」，
 *   也处理不了 `from x import (a, b)` 这种多行写法。
 *
 * @param file Python 文件
 * @param python Python 可执行文件
 */
export function parseImports(file: string, python: string): PyImport[] {
  try {
    const output = execFileSync(python, ['-c', PARSE_IMPORTS_SCRIPT, file], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return JSON.parse(output) as PyImport[];
  } catch {
    // ⚠️ **解析不了就返回空** —— 不能因为一个坏文件就崩
    return [];
  }
}

/**
 * 判断一个文件属于哪一层。
 *
 * ⚠️ **按路径里的层名判断** ——
 * 路径里有 `domain` / `application` / … 就算对应层。
 */
export function layerOf(file: string, packageRoot: string): Layer | null {
  const rel = relative(packageRoot, file).replace(/\\/g, '/');

  for (const layer of LAYERS) {
    // ⚠️ **按路径段匹配** ——
    // `my_domain_utils.py` 不算 domain 层。
    const segments = rel.split('/');
    if (segments.includes(layer)) return layer;
  }

  return null;
}

/**
 * 检查一个 Python 包的四层边界。
 *
 * @param packageDir 包目录
 * @param python Python 可执行文件
 * @param root 主仓根目录（用于算相对路径）
 */
export function checkPythonLayers(packageDir: string, python: string, root: string): string[] {
  const violations: string[] = [];

  const files = findPyFiles(packageDir);
  if (files.length === 0) return violations;

  // ⚠️ **包名 = 包目录名** ——
  // `packageDir` 已经是 `.../src/<pkg>` 这一层了，
  // 所以包名就是它的目录名。
  const packageName = packageDir.split(/[\\/]/).pop() ?? '';

  for (const file of files) {
    const layer = layerOf(file, packageDir);
    if (layer === null) continue;

    const relFile = relative(root, file).replace(/\\/g, '/');
    const imports = parseImports(file, python);

    for (const item of imports) {
      violations.push(...checkImport(layer, packageName, relFile, item));
    }
  }

  return violations;
}

/**
 * 检查一个 import 违反了哪条层间规则。
 *
 * ⚠️ **拆出来是为了控制复杂度** ——
 * biome 的 `noExcessiveCognitiveComplexity` 限制 15。
 *
 * @param layer 源文件所在的层
 * @param packageName 包名（`packageDir` 的目录名）
 * @param relFile 源文件的相对路径（用于报错）
 * @param item  import 记录
 */
function checkImport(layer: Layer, packageName: string, relFile: string, item: PyImport): string[] {
  // ⚠️ **相对导入不管** —— 它们不会跨层
  if (item.isRelative) return [];

  const top = item.module.split('.')[0] ?? '';
  if (!top) return [];

  // ① domain 层零外部依赖
  if (layer === 'domain' && DOMAIN_FORBIDDEN.has(top)) {
    return [
      `${relFile}:${item.line}: domain 层 import '${item.module}' —— ` +
        `领域层必须零外部依赖（纯逻辑）`,
    ];
  }

  // ⚠️ **同包内的层间引用才管** ——
  // 跨包的约束是另一条规则。
  if (packageName === '' || top !== packageName) return [];

  const targetLayer = item.module.split('.')[1] ?? '';

  // ② application 不碰 infrastructure
  if (layer === 'application' && targetLayer === 'infrastructure') {
    return [
      `${relFile}:${item.line}: application 层 import '${item.module}' —— ` +
        `应用层不得依赖基础设施（依赖要反转）`,
    ];
  }

  // ③ interfaces 不碰 infrastructure
  if (layer === 'interfaces' && targetLayer === 'infrastructure') {
    return [
      `${relFile}:${item.line}: interfaces 层 import '${item.module}' —— ` +
        `接口层不得直接依赖基础设施`,
    ];
  }

  // ④ domain 不碰 application（单向依赖）
  if (layer === 'domain' && (targetLayer === 'application' || targetLayer === 'interfaces')) {
    return [
      `${relFile}:${item.line}: domain 层 import '${item.module}' —— ` +
        `领域层不得依赖上层（单向依赖）`,
    ];
  }

  return [];
}

/**
 * G28 —— Python 四层架构边界。
 */
export const g28 = {
  id: 'G28',
  name: 'Python 四层架构边界',
  description: 'domain 零外部依赖；application/interfaces 不碰 infrastructure；domain 不碰上层',
  severity: 'error' as const,
  scope: 'packages',

  run(root: string): string[] {
    const violations: string[] = [];

    // ⚠️ **Python 可执行文件** ——
    // 优先用主仓的 venv，没有就退回系统 python。
    const python = findPython(root);
    if (!python) {
      return ['找不到 Python 可执行文件 —— 无法检查四层架构'];
    }

    for (const packageDir of findPythonPackages(root)) {
      violations.push(...checkPythonLayers(packageDir, python, root));
    }

    return violations;
  },
};

/**
 * 找 Python 可执行文件。
 *
 * ⚠️ **优先用 venv** —— 系统的 python 可能没有标准库以外的东西，
 * 但 `ast` 是标准库，所以系统的也行。
 */
export function findPython(root: string): string | null {
  const candidates = [
    join(root, 'packages', 'core', '.venv', 'Scripts', 'python.exe'),
    join(root, 'packages', 'core', '.venv', 'bin', 'python'),
    join(root, 'packages', 'services', 'auth', '.venv', 'Scripts', 'python.exe'),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  // ⚠️ **退回系统 python** ——
  // `ast` 是标准库，够用了。
  for (const name of ['python', 'python3']) {
    try {
      execFileSync(name, ['--version'], { stdio: 'ignore' });
      return name;
    } catch {
      // ⚠️ 试下一个
    }
  }

  return null;
}

/**
 * 找出所有「有分层结构」的 Python 包。
 */
export function findPythonPackages(root: string): string[] {
  const results: string[] = [];

  const searchRoots = [
    join(root, 'packages'),
    join(root, 'apps'),
    join(root, 'libs'),
    join(root, '..', 'scholarspace-identity', 'libs'),
    join(root, '..', 'scholarspace-orchestra', 'libs'),
    join(root, '..', 'scholarspace-slides', 'libs'),
    join(root, '..', 'scholarspace-paper', 'libs'),
    join(root, '..', 'scholarspace-community', 'libs'),
  ];

  for (const searchRoot of searchRoots) {
    if (!existsSync(searchRoot)) continue;

    // ⚠️ **递归找 `src/<pkg>/<layer>`** ——
    //    包的位置不固定：
    //      · `packages/core/src/scholar_core/`
    //      · `packages/services/auth/src/scholar_auth/`（**多一层**）
    //      · `libs/slides-core/src/slides_core/`
    //
    //    只查 `packages/<x>/src/<pkg>` 会漏掉 services 下的全部包。
    results.push(...findLayeredPackages(searchRoot, 3));
  }

  return results;
}

/**
 * 递归找出有分层结构的包。
 *
 * @param dir 当前目录
 * @param depth 还能往下找几层
 */
function findLayeredPackages(dir: string, depth: number): string[] {
  if (depth < 0) return [];

  const results: string[] = [];

  for (const full of subDirectories(dir)) {
    // ⚠️ **`src/<pkg>/<layer>` 命中**
    results.push(...layeredPackagesUnder(full));

    // ⚠️ **继续往下找** —— `services/auth/src/...` 这类
    results.push(...findLayeredPackages(full, depth - 1));
  }

  return results;
}

/**
 * 列出子目录（跳过隐藏目录和缓存目录）。
 */
function subDirectories(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }

  const results: string[] = [];

  for (const entry of entries) {
    if (entry.startsWith('.') || entry === 'node_modules' || entry === '__pycache__') {
      continue;
    }

    const full = join(dir, entry);
    try {
      if (statSync(full).isDirectory()) results.push(full);
    } catch {
      // ⚠️ 读不了就跳过
    }
  }

  return results;
}

/**
 * 找出 `<dir>/src/<pkg>/` 下有分层目录的包。
 */
function layeredPackagesUnder(dir: string): string[] {
  const srcDir = join(dir, 'src');
  if (!existsSync(srcDir)) return [];

  const results: string[] = [];

  for (const pkgDir of subDirectories(srcDir)) {
    const hasLayer = LAYERS.some((layer) => existsSync(join(pkgDir, layer)));
    if (hasLayer) results.push(pkgDir);
  }

  return results;
}
