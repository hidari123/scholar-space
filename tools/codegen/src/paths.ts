/**
 * 契约路径解析 —— 单一真相源。
 *
 * 主项目根目录的定位方式（从工具包向上找）：
 *   1. 环境变量 SCHOLARSPACE_ROOT
 *   2. 向上查找含 contracts/ 与 packages/conventions/ 的目录
 */

import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** 当前模块目录。 */
const moduleDir = dirname(fileURLToPath(import.meta.url));

/**
 * 定位主项目根目录。
 *
 * @throws 找不到时抛错 —— 明确失败优于静默用错路径。
 */
export function findProjectRoot(): string {
  const fromEnv = process.env.SCHOLARSPACE_ROOT;
  if (fromEnv && existsSync(join(fromEnv, 'contracts'))) {
    return resolve(fromEnv);
  }

  let current = moduleDir;
  for (let depth = 0; depth < 10; depth += 1) {
    const candidate = current;
    if (
      existsSync(join(candidate, 'contracts', 'openapi')) &&
      existsSync(join(candidate, 'packages', 'conventions'))
    ) {
      return candidate;
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }

  throw new Error(
    '找不到 scholarspace 项目根目录。\n' +
      '请设置环境变量 SCHOLARSPACE_ROOT，或在项目内运行该工具。',
  );
}

/** 契约目录。 */
export function contractsDir(root = findProjectRoot()): string {
  return join(root, 'contracts');
}

/** OpenAPI 目录。 */
export function openapiDir(root = findProjectRoot()): string {
  return join(root, 'contracts', 'openapi');
}

/** 规范基座目录。 */
export function conventionsDir(root = findProjectRoot()): string {
  return join(root, 'packages', 'conventions');
}

/** 兼容矩阵文件。 */
export function compatibilityFile(root = findProjectRoot()): string {
  return join(root, 'versions', 'compatibility.yaml');
}
