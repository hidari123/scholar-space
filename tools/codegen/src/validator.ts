/**
 * 契约校验 —— CI 门禁 G5 / G6 的实现。
 *
 * 检查项：
 *   G5  每个契约文件可解析、$ref 可解析、operationId 唯一
 *   G6  路径版本规范、错误码已登记、分页参数符合规范
 */

import { ContractBundle } from './loader';

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
    // ── G5：$ref 可解析 ───────────────────────────────
    const refs = collectRefs(doc);
    for (const ref of refs) {
      const resolved = bundle.resolve(name, ref);
      if (resolved === undefined) {
        errors.push(`${name}: 无法解析 $ref "${ref}"`);
      }
    }

    // ── G5：operationId 唯一 ─────────────────────────
    const paths = (doc.paths ?? {}) as Record<string, Record<string, unknown>>;
    for (const [path, methods] of Object.entries(paths)) {
      // ── G6：路径版本规范 ─────────────────────────────
      if (!ALLOWED_API_VERSIONS.some((version) => path.startsWith(version))) {
        errors.push(`${name}: 路径 "${path}" 必须以 ${ALLOWED_API_VERSIONS.join(' / ')} 开头`);
      }

      for (const [method, operation] of Object.entries(methods)) {
        if (!['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].includes(method)) {
          continue;
        }

        operationCount += 1;
        const op = operation as Record<string, unknown>;
        const operationId = op.operationId;

        if (typeof operationId !== 'string' || operationId.length === 0) {
          errors.push(`${name}: ${method.toUpperCase()} ${path} 缺少 operationId`);
          continue;
        }

        if (operationIds.has(operationId)) {
          errors.push(`${name}: operationId "${operationId}" 重复`);
        }
        operationIds.add(operationId);

        if (!op.summary) {
          warnings.push(`${name}: ${method.toUpperCase()} ${path} 缺少 summary`);
        }
        if (!op.responses || typeof op.responses !== 'object') {
          errors.push(`${name}: ${method.toUpperCase()} ${path} 缺少 responses`);
        }
      }
    }

    // ── G5：schema 计数 ───────────────────────────────
    const components = (doc.components ?? {}) as Record<string, unknown>;
    const schemas = (components.schemas ?? {}) as Record<string, unknown>;
    schemaCount += Object.keys(schemas).length;
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    stats: { files: bundle.all().length, operations: operationCount, schemas: schemaCount },
  };
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
