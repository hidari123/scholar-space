/**
 * TypeScript 客户端生成 —— 从 OpenAPI 契约生成 TS 类型 + 请求函数。
 *
 * ⚠️ **为什么自己写而不用 orval** ——
 *   orval 要起 Node 服务、装一堆依赖、配置一堆东西，
 *   而且生成的代码风格不受控。
 *
 *   我们的契约是自己写的（OpenAPI 3.1 子集），
 *   自己生成器反而更可控、更快、零额外依赖。
 *
 * ⚠️ **生成的代码不能手改** ——
 *   改了会被下次生成覆盖。
 *   要定制行为，改生成器，不改产物。
 */

import type { ContractDocument } from './loader';

/** 生成选项。 */
export interface GenerateOptions {
  /** 契约文件名（如 `slides.yaml`）。 */
  contractName: string;
  /** 生成的模块名（如 `slides`）。 */
  moduleName: string;
  /** API 基础路径。 */
  baseUrl: string;
}

/** 生成结果。 */
export interface GenerateResult {
  /** 生成的 TypeScript 源码。 */
  code: string;
  /** 生成的操作数。 */
  operationCount: number;
  /** 生成的类型数。 */
  typeCount: number;
}

/** OpenAPI 里的操作对象。 */
interface OperationObject {
  operationId?: string;
  summary?: string;
  tags?: string[];
  requestBody?: {
    content?: Record<string, { schema?: unknown }>;
  };
  responses?: Record<string, { content?: Record<string, { schema?: unknown }> }>;
  parameters?: ParameterObject[];
}

/** OpenAPI 里的参数对象。 */
interface ParameterObject {
  name?: string;
  in?: string;
  required?: boolean;
  schema?: unknown;
}

/** OpenAPI 里的 path item —— 操作 + path item 级别的参数。 */
interface PathItemObject {
  parameters?: ParameterObject[];
  get?: OperationObject;
  post?: OperationObject;
  put?: OperationObject;
  patch?: OperationObject;
  delete?: OperationObject;
}

/** 把 `camelCase` / `snake_case` 转成 `camelCase`。 */
export function toCamelCase(text: string): string {
  return text.replace(/_([a-z0-9])/g, (_, char: string) => char.toUpperCase());
}

/**
 * 提取 schema 的 TypeScript 类型。
 *
 * ⚠️ **只处理我们用到的 OpenAPI 子集** ——
 *   object / array / string / integer / number / boolean / enum / $ref。
 *   遇到不支持的，返回 `unknown`（而不是报错）——
 *   生成器不该因为一个奇怪的 schema 就整个挂掉。
 */
export function schemaToType(
  schema: unknown,
  schemaNames: Map<string, string>,
  indent = 0,
): string {
  if (schema === null || typeof schema !== 'object') return 'unknown';

  const record = schema as Record<string, unknown>;

  // ⚠️ **$ref** —— 指向另一个 schema
  const ref = record.$ref;
  if (typeof ref === 'string') {
    return schemaNames.get(ref) ?? 'unknown';
  }

  // ⚠️ **联合类型** —— `type: [string, 'null']`
  const type = record.type;
  if (Array.isArray(type)) {
    return type.map((item) => primitiveToType(item, record)).join(' | ');
  }

  if (type === 'array') {
    return arrayType(record, schemaNames, indent);
  }

  if (type === 'object') {
    return objectType(record, schemaNames, indent);
  }

  return primitiveToType(type, record);
}

/** 数组类型。 */
function arrayType(
  record: Record<string, unknown>,
  schemaNames: Map<string, string>,
  indent: number,
): string {
  const inner = schemaToType(record.items, schemaNames, indent);

  // ⚠️ **数组元素是对象时要有括号** ——
  // `string[]` 可以，`{ a: string }[]` 不行（要 `Array<{...}>`）
  if (inner.includes('|') || inner.includes('{')) return `Array<${inner}>`;

  return `${inner}[]`;
}

/** 对象类型。 */
function objectType(
  record: Record<string, unknown>,
  schemaNames: Map<string, string>,
  indent: number,
): string {
  const properties = record.properties;
  if (!properties || typeof properties !== 'object') {
    return 'Record<string, unknown>';
  }

  const required = new Set(Array.isArray(record.required) ? (record.required as string[]) : []);

  const pad = '  '.repeat(indent + 1);
  const closePad = '  '.repeat(indent);
  const lines: string[] = [];

  for (const [key, value] of Object.entries(properties as Record<string, unknown>)) {
    const propName = toCamelCase(key);
    // ⚠️ **可选属性显式加 `?`** ——
    // OpenAPI 的 `required` 数组决定。
    const optional = required.has(key) ? '' : '?';
    const propType = schemaToType(value, schemaNames, indent + 1);
    lines.push(`${pad}${propName}${optional}: ${propType};`);
  }

  if (lines.length === 0) return 'Record<string, unknown>';

  return `{\n${lines.join('\n')}\n${closePad}}`;
}

/** 基本类型 + enum。 */
function primitiveToType(type: unknown, record: Record<string, unknown>): string {
  // ⚠️ **enum 优先** ——
  // enum 的值可能都是 string，但语义上是字面量联合。
  const enumValues = record.enum;
  if (Array.isArray(enumValues) && enumValues.length > 0) {
    const parts = enumValues.map((value) =>
      typeof value === 'string' ? `'${value}'` : String(value),
    );
    return parts.join(' | ');
  }

  switch (type) {
    case 'string':
      return 'string';
    case 'integer':
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'null':
      return 'null';
    default:
      return 'unknown';
  }
}

/**
 * 去掉路径的 `/api` 前缀。
 *
 * ⚠️ **`api-client.ts` 已经拼了 `/api`** ——
 * 契约里的路径是 `/api/v1/papers/search`，
 * 直接用会变成 `/api/api/v1/...`。
 */
export function stripApiPrefix(path: string): string {
  return path.startsWith('/api/') ? path.slice(4) : path;
}

/**
 * 如果能映射到命名类型，就用名字。
 *
 * ⚠️ **数组也适用** ——
 * `{ type: 'array', items: { $ref: '.../PaperResponse' } }`
 * → `PaperResponse[]`
 *
 * ⚠️ **不这么做的话**，
 * 生成的代码会把整个对象内联进去，没法看。
 */
export function namedTypeIfPossible(schema: unknown, schemaNames: Map<string, string>): string {
  if (schema === null || typeof schema !== 'object') return 'unknown';

  const record = schema as Record<string, unknown>;

  // ⚠️ **直接是 $ref** ——
  const ref = record.$ref;
  if (typeof ref === 'string') {
    return schemaNames.get(ref) ?? 'unknown';
  }

  // ⚠️ **数组** ——
  if (record.type === 'array') {
    const inner = record.items;
    if (inner !== null && typeof inner === 'object') {
      const innerRef = (inner as Record<string, unknown>).$ref;
      if (typeof innerRef === 'string') {
        const name = schemaNames.get(innerRef);
        if (name) return `${name}[]`;
      }
    }
  }

  return schemaToType(schema, schemaNames);
}

/** 生成一个操作需要的上下文。 */
interface OperationContext {
  /** 路径。 */
  path: string;
  /** HTTP 方法。 */
  method: string;
  /** 操作对象（原始，保留 $ref）。 */
  operation: OperationObject;
  /** path item（解引用后）。 */
  derefPathItem: PathItemObject | undefined;
  /** schema 名映射。 */
  schemaNames: Map<string, string>;
}

/**
 * 生成一个操作的代码。
 *
 * ⚠️ **拆出来是为了控制复杂度** ——
 * biome 的 `noExcessiveCognitiveComplexity` 限制 15。
 */
function generateOperation(context: OperationContext): string[] {
  const { path, method, operation, derefPathItem, schemaNames } = context;

  const operationId = operation.operationId ?? `${method}_${path}`;
  const fnName = toCamelCase(operationId);

  // ⚠️ **路径参数** ——
  // ⚠️ **要合并 path item 级别和 operation 级别的 parameters** ——
  // OpenAPI 里路径参数可以写在两处：
  //   ① path item 级别（`/papers/{paper_id}:` 的兄弟）
  //   ② operation 级别（`get:` 里面）
  // 我们的契约写在 ①，但 operation 级别的也要认。
  //
  // ⚠️ **取解引用后的文档** —— ① 里写的是 `$ref`。
  const derefOperation = derefPathItem?.[method as keyof PathItemObject] as
    | OperationObject
    | undefined;

  const pathParams = [
    ...(derefPathItem?.parameters ?? []),
    ...(derefOperation?.parameters ?? []),
  ].filter((param) => param.in === 'path' && param.name);

  // ⚠️ **请求体类型** ——
  const bodySchema =
    operation.requestBody?.content?.['application/json']?.schema ??
    operation.requestBody?.content?.['application/json'];
  const bodyType = bodySchema ? schemaToType(bodySchema, schemaNames) : undefined;

  // ⚠️ **响应类型** ——
  const okResponse = operation.responses?.['200'] ?? operation.responses?.['201'];
  const responseSchema = okResponse?.content?.['application/json']?.schema;
  const responseType = responseSchema
    ? namedTypeIfPossible(responseSchema, schemaNames)
    : 'unknown';

  // ── 参数列表 ──────────────────────────────────────
  const params: string[] = [];
  for (const param of pathParams) {
    // ⚠️ **参数名一定存在** —— 上面的 filter 已经保证了
    params.push(`${toCamelCase(param.name ?? '')}: string`);
  }
  if (bodyType) {
    params.push(`body: ${bodyType}`);
  }
  params.push('options?: RequestOptions');

  // ── 路径拼接 ──────────────────────────────────────
  // ⚠️ **路径参数要 URL 编码** ——
  // 直接把用户输入拼进 URL 会有注入风险。
  let pathExpr = stripApiPrefix(path);
  for (const param of pathParams) {
    const name = param.name ?? '';
    const camel = toCamelCase(name);
    pathExpr = pathExpr.replace(`{${name}}`, `\${encodeURIComponent(${camel})}`);
  }

  return [
    `/** ${operation.summary ?? operationId} */`,
    `export async function ${fnName}(${params.join(', ')}): Promise<${responseType}> {`,
    `  return request<${responseType}>(\`${pathExpr}\`, {`,
    `    method: '${method.toUpperCase()}',`,
    bodyType ? `    body,` : '',
    `    ...options,`,
    `  });`,
    `}`,
    '',
  ];
}

/**
 * 从契约文档生成 TS 客户端。
 *
 * ⚠️ **两份文档各司其职** ——
 *   · `document`（原始）—— 保留 `$ref`，
 *     响应/请求体能生成**命名类型**（`PaperResponse[]`），
 *     而不是把整个对象内联进去。
 *   · `dereferenced`（解引用后）—— 路径参数要用，
 *     因为契约里写的是 `$ref: '#/components/parameters/PaperId'`。
 *
 * @param document 契约文档（原始，保留 $ref）
 * @param dereferenced 契约文档（已解引用）
 * @param options 生成选项
 */
export function generateTsClient(
  document: ContractDocument,
  dereferenced: ContractDocument,
  options: GenerateOptions,
): GenerateResult {
  const schemas = (document.components as Record<string, unknown> | undefined)?.schemas as
    | Record<string, Record<string, unknown>>
    | undefined;

  // ⚠️ **schema 名映射** ——
  // `$ref: '#/components/schemas/PaperResponse'` → `PaperResponse`
  const schemaNames = new Map<string, string>();
  for (const name of Object.keys(schemas ?? {})) {
    schemaNames.set(`#/components/schemas/${name}`, name);
  }

  // ── 类型 ──────────────────────────────────────────────
  const typeLines: string[] = [];
  for (const [name, schema] of Object.entries(schemas ?? {})) {
    const type = schemaToType(schema, schemaNames);
    typeLines.push(`/** ${name} —— 由契约生成，不要手改。 */`);
    typeLines.push(`export type ${name} = ${type};`);
    typeLines.push('');
  }

  // ── 操作 ──────────────────────────────────────────────
  // ⚠️ **操作取原始文档** —— 保留 `$ref`，
  //    这样响应类型能生成命名类型而不是内联对象。
  const paths = (document.paths as Record<string, PathItemObject> | undefined) ?? {};

  // ⚠️ **路径参数取解引用后的文档** ——
  //    契约里写的是 `$ref: '#/components/parameters/X'`，
  //    不解引用就读不到参数名。
  const derefPaths = (dereferenced.paths as Record<string, PathItemObject> | undefined) ?? {};

  const methodNames = ['get', 'post', 'put', 'patch', 'delete'] as const;
  const operationLines: string[] = [];
  let operationCount = 0;

  for (const [path, pathItem] of Object.entries(paths)) {
    for (const method of methodNames) {
      const operation = pathItem[method];
      if (!operation) continue;

      operationLines.push(
        ...generateOperation({
          path,
          method,
          operation,
          derefPathItem: derefPaths[path],
          schemaNames,
        }),
      );
      operationCount += 1;
    }
  }

  const code = [
    '/**',
    ` * ${options.moduleName} 客户端 —— 由契约生成，不要手改。`,
    ' *',
    ` * 契约：${options.contractName}`,
    ' *',
    ' * ⚠️ **改了会被下次生成覆盖** —— 要定制行为，改生成器。',
    ' */',
    '',
    "import { type RequestOptions, request } from '../core/api-client';",
    '',
    ...typeLines,
    ...operationLines,
  ]
    .filter((line) => line !== '')
    .join('\n');

  return {
    code: `${code}\n`,
    operationCount,
    typeCount: Object.keys(schemas ?? {}).length,
  };
}
