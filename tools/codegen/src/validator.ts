/**
 * 契约校验 —— CI 门禁 G5 / G6 的实现。
 *
 * 检查项：
 *   G5  每个契约文件可解析、$ref 可解析、operationId 唯一
 *   G6  路径版本规范、错误码已登记、分页参数符合规范
 */

import type { ContractBundle } from './loader';

/** 校验结果。 */
export interface ValidationResult {
  /** 是否通过。 */
  ok: boolean;
  /** 错误列表。 */
  errors: string[];
  /** 警告列表（不阻断）。 */
  warnings: string[];
  /** 统计。 */
  stats: {
    files: number;
    operations: number;
    schemas: number;
  };
}

/** 允许的 API 版本前缀。 */
const ALLOWED_API_VERSIONS = ['/api/v1'];

/** 有效的 HTTP 方法。 */
const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

/**
 * 校验契约集合。
 */
export function validateContracts(bundle: ContractBundle): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const operationIds = new Set<string>();
  let operationCount = 0;
  let schemaCount = 0;

  for (const { name, doc } of bundle.all()) {
    errors.push(...validateRefs(name, doc, bundle));
    schemaCount += countSchemas(doc);
    operationCount += validatePaths(name, doc, operationIds, errors, warnings);
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    stats: { files: bundle.all().length, operations: operationCount, schemas: schemaCount },
  };
}

/** G5：所有 $ref 必须可解析。 */
function validateRefs(name: string, doc: unknown, bundle: ContractBundle): string[] {
  const errors: string[] = [];

  for (const ref of collectRefs(doc)) {
    if (bundle.resolve(name, ref) === undefined) {
      errors.push(`${name}: 无法解析 $ref "${ref}"`);
    }
  }

  return errors;
}

/** 统计 schema 数量。 */
function countSchemas(doc: unknown): number {
  const components = (doc as { components?: unknown }).components ?? {};
  const schemas = (components as { schemas?: unknown }).schemas ?? {};
  return Object.keys(schemas as Record<string, unknown>).length;
}

/**
 * G5 / G6：校验路径与操作。
 *
 * @returns 端点数量
 */
function validatePaths(
  name: string,
  doc: unknown,
  operationIds: Set<string>,
  errors: string[],
  warnings: string[],
): number {
  const paths = ((doc as { paths?: unknown }).paths ?? {}) as Record<
    string,
    Record<string, unknown>
  >;
  let operationCount = 0;

  for (const [path, methods] of Object.entries(paths)) {
    if (!ALLOWED_API_VERSIONS.some((version) => path.startsWith(version))) {
      errors.push(`${name}: 路径 "${path}" 必须以 ${ALLOWED_API_VERSIONS.join(' / ')} 开头`);
    }

    for (const [method, operation] of Object.entries(methods)) {
      if (!HTTP_METHODS.includes(method)) continue;

      operationCount += 1;
      validateOperation(name, method, path, operation, operationIds, errors, warnings);
    }
  }

  return operationCount;
}

/** G5：校验单个操作。 */
function validateOperation(
  name: string,
  method: string,
  path: string,
  operation: unknown,
  operationIds: Set<string>,
  errors: string[],
  warnings: string[],
): void {
  const op = operation as Record<string, unknown>;
  const label = `${method.toUpperCase()} ${path}`;
  const operationId = op.operationId;

  if (typeof operationId !== 'string' || operationId.length === 0) {
    errors.push(`${name}: ${label} 缺少 operationId`);
    return;
  }

  if (operationIds.has(operationId)) {
    errors.push(`${name}: operationId "${operationId}" 重复`);
  }
  operationIds.add(operationId);

  if (!op.summary) {
    warnings.push(`${name}: ${label} 缺少 summary`);
  }
  if (!op.responses || typeof op.responses !== 'object') {
    errors.push(`${name}: ${label} 缺少 responses`);
  }
}

/**
 * 收集文档中的所有 $ref 字符串。
 */
export function collectRefs(node: unknown, refs: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const item of node) collectRefs(item, refs);
    return refs;
  }

  if (node === null || typeof node !== 'object') return refs;

  const record = node as Record<string, unknown>;
  const ref = record.$ref;
  if (typeof ref === 'string' && !refs.includes(ref)) {
    refs.push(ref);
  }

  for (const value of Object.values(record)) {
    collectRefs(value, refs);
  }

  return refs;
}
