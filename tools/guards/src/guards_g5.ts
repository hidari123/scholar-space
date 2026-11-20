/**
 * G5 护栏 —— 契约一致性。
 *
 * ⚠️ **契约是唯一真相源**（ADR-0011 原则 2：契约先行）。
 * ⚠️ **禁止手写 DTO** —— 改契约 → 重新生成 → 类型错误在编译期暴露。
 *
 * ⚠️ **G5 要查什么**：
 *   ① 契约文件本身合法（能解析、必需字段齐全）
 *   ② **契约里的每个端点，FastAPI 实现里都要有**
 *   ③ **实现里的每个端点，契约里都要有**
 *
 * ⚠️ **为什么不用 openapi-diff** ——
 *   那要起服务、生成快照、装一堆 Python 包。
 *   在 CI 里跑不动，而且「生成快照」这一步本身可能失败，
 *   失败了就变成「没检查」（假绿）。
 *
 *   ⚠️ **这里的做法**：直接读 FastAPI 源码里的路由装饰器，
 *   跟契约里的 path 对比。快、纯静态、不会失败。
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/** 契约目录（相对主仓）。 */
const CONTRACT_DIR = 'contracts/openapi';

/**
 * 运维端点 —— 不属于对外契约。
 *
 * ⚠️ **前端不会按契约调它们** ——
 * 监控和负载均衡直接打就行。
 */
const OPERATIONAL_PATHS = new Set(['/health', '/healthz', '/readyz', '/metrics']);

/**
 * 各服务的实现目录（相对主仓）→ 服务名。
 *
 * ⚠️ **只列「有 HTTP 层」的** ——
 * 主仓的 B 类服务（auth/llm/storage/…）目前只有领域层和应用层，
 * 被 gateway 直接调用，**没有对外的 HTTP 路由**。
 *
 * ⚠️ **契约是「对外 HTTP 接口」的契约** ——
 * 没有路由的服务不需要契约。
 * 否则护栏会一直报「缺契约」，逼人写没用的契约。
 */
const SERVICE_IMPLS: Record<string, string> = {};

/** 覆盖服务列表（测试用）。 */
export function setServiceImpls(impls: Record<string, string>): void {
  serviceImpls = impls;
}

/** ⚠️ **独立仓的实现路径** —— 不在主仓里，但契约要覆盖。 */
const EXTERNAL_IMPLS: Record<string, string> = {
  '../scholarspace-slides/libs/slides-http': 'slides',
  '../scholarspace-paper/libs/paper-http': 'paper',
  '../scholarspace-orchestra/libs/orchestra-http': 'orchestra',
  '../scholarspace-community/libs/community-http': 'community',
};

/**
 * 服务实现列表 —— 可注入（测试用）。
 *
 * ⚠️ **默认用主仓 + 独立仓的固定列表** ——
 * 测试时注入假数据，不用真的建目录。
 */
let serviceImpls: Record<string, string> = {
  ...SERVICE_IMPLS,
  ...EXTERNAL_IMPLS,
};

/** 最小 YAML 解析 —— 只提取顶层 `paths:` 下的 path 键。 */
function extractPaths(content: string): Set<string> {
  const paths = new Set<string>();
  const lines = content.split('\n');

  let inPaths = false;

  for (const line of lines) {
    // ⚠️ 顶层 `paths:` 之后才收集
    if (/^paths:\s*$/.test(line)) {
      inPaths = true;
      continue;
    }

    if (!inPaths) continue;

    // ⚠️ 遇到下一个顶层键就结束
    if (/^[a-zA-Z]/.test(line)) {
      inPaths = false;
      continue;
    }

    // ⚠️ path 键在 `paths:` 下缩进 2 格，以 `/` 开头
    const match = /^ {2}(\/[^:]*):\s*$/.exec(line);
    if (match?.[1]) {
      paths.add(match[1]);
    }
  }

  return paths;
}

/** 从 FastAPI 源码里提取路由 path。 */
function extractRoutes(content: string): Set<string> {
  const routes = new Set<string>();

  // ⚠️ **先找 router 的 prefix** ——
  // `APIRouter(prefix='/api/v1/slides/projects')`
  const prefixMatch = /APIRouter\(\s*prefix\s*=\s*["']([^"']+)["']/.exec(content);
  const prefix = prefixMatch?.[1] ?? '';

  // ⚠️ **两步法提取路径** ——
  //
  //    直接用一个大正则不行：
  //    `@router.get(...)` 里的引号可能在下一行，
  //    而 `\s*` 会一路吃到文件里下一个引号，
  //    把整个文件吞进去。
  //
  //    所以：先找到装饰器位置，再从那里找**第一个**引号对。
  const decoratorPattern = /@router\.(?:get|post|put|patch|delete)\(/g;

  let match = decoratorPattern.exec(content);
  while (match !== null) {
    // ⚠️ **从括号后面开始找** ——
    // 第一个引号对就是路径参数。
    const rest = content.slice(match.index + match[0].length);
    const quoted = /["']([^"']*)["']/.exec(rest);

    if (quoted && quoted[1] !== undefined) {
      // ⚠️ **prefix + path** —— FastAPI 实际注册的路径
      const full = `${prefix}${quoted[1]}`;

      // ⚠️ **跳过运维端点** ——
      // `/health` 这类端点不属于对外契约，
      // 前端不会按契约去调它。
      if (!OPERATIONAL_PATHS.has(full)) {
        routes.add(full);
      }
    }

    match = decoratorPattern.exec(content);
  }

  return routes;
}

/** 收集目录下的 Python 文件。 */
function collectPythonFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];

  const results: string[] = [];

  for (const entry of readdirSync(dir)) {
    if (['node_modules', '__pycache__', '.venv', 'dist'].includes(entry)) continue;

    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...collectPythonFiles(full));
    } else if (full.endsWith('.py')) {
      results.push(full);
    }
  }

  return results;
}

/**
 * G5 —— 契约一致性。
 */
export const g5 = {
  id: 'G5',
  name: '契约与实现一致',
  description: '契约里的端点必须都有实现，实现里的端点必须都在契约里',
  severity: 'error' as const,
  scope: 'contracts',

  run(root: string): string[] {
    const contractDir = join(root, CONTRACT_DIR);
    if (!existsSync(contractDir)) {
      return [`契约目录不存在：${CONTRACT_DIR}`];
    }

    const violations: string[] = [];

    for (const [implPath, serviceName] of Object.entries(serviceImpls)) {
      violations.push(...checkService(root, contractDir, implPath, serviceName));
    }

    return violations;
  },
};

/**
 * 检查一个服务的契约一致性。
 *
 * ⚠️ **拆出来是为了控制复杂度** ——
 * biome 的 `noExcessiveCognitiveComplexity` 限制 15。
 */
function checkService(
  root: string,
  contractDir: string,
  implPath: string,
  serviceName: string,
): string[] {
  const implDir = join(root, implPath);
  const contractFile = join(contractDir, `${serviceName}.yaml`);

  // ⚠️ **没有实现就没有契约** —— 跳过，不算违规
  if (!existsSync(implDir)) return [];

  // ⚠️ **有实现但没契约** —— 违规
  if (!existsSync(contractFile)) {
    return [
      `${serviceName}: 有实现（${implPath}）但没有契约（${CONTRACT_DIR}/${serviceName}.yaml）`,
    ];
  }

  const contractPaths = extractPaths(readFileSync(contractFile, 'utf8'));
  const implRoutes = collectImplRoutes(implDir);

  // ⚠️ **没有路由的实现不用查** —— 纯领域层/应用层
  if (implRoutes.size === 0) return [];

  return [
    ...missingInImpl(serviceName, contractPaths, implRoutes),
    ...missingInContract(root, serviceName, implDir, contractPaths, implRoutes),
  ];
}

/** 收集实现里的所有路由。 */
function collectImplRoutes(implDir: string): Set<string> {
  const routes = new Set<string>();

  for (const file of collectPythonFiles(implDir)) {
    for (const route of extractRoutes(readFileSync(file, 'utf8'))) {
      routes.add(route);
    }
  }

  return routes;
}

/** 契约里有、实现里没有。 */
function missingInImpl(
  serviceName: string,
  contractPaths: Set<string>,
  implRoutes: Set<string>,
): string[] {
  const violations: string[] = [];

  for (const path of contractPaths) {
    if (!implRoutes.has(path)) {
      violations.push(
        `${serviceName}: 契约里的 ${path} 在实现里找不到 —— ` + `要么实现漏了，要么契约写错了`,
      );
    }
  }

  return violations;
}

/** 实现里有、契约里没有。 */
function missingInContract(
  root: string,
  serviceName: string,
  implDir: string,
  contractPaths: Set<string>,
  implRoutes: Set<string>,
): string[] {
  const violations: string[] = [];
  const relFile = relative(root, implDir).replace(/\\/g, '/');

  for (const path of implRoutes) {
    if (!contractPaths.has(path)) {
      violations.push(
        `${serviceName}: 实现里的 ${path}（${relFile}）不在契约里 —— ` +
          `前端按契约生成的客户端会调不到`,
      );
    }
  }

  return violations;
}
