/**
 * 契约加载 —— 读取 OpenAPI 文件并解析 $ref。
 *
 * 关键：跨文件 $ref（如 './common.yaml#/components/schemas/X'）
 * 必须能解析，否则 codegen 无法工作。
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { parse, stringify } from 'yaml';

/** 解析后的契约文档（任意 JSON 结构）。 */
export type ContractDocument = Record<string, unknown>;

/** $ref 指针。 */
interface RefPointer {
  file: string;
  path: string[];
}

/**
 * 解析 $ref 字符串。
 *
 * 例：`./common.yaml#/components/schemas/HealthStatus`
 *   → { file: './common.yaml', path: ['components', 'schemas', 'HealthStatus'] }
 */
export function parseRef(ref: string): RefPointer {
  const [filePart, ...pathParts] = ref.split('#');
  const path = pathParts.join('#');
  return {
    file: filePart ?? '',
    path: path ? path.split('/').filter(Boolean) : [],
  };
}

/** 契约集合。 */
export class ContractBundle {
  private readonly documents = new Map<string, ContractDocument>();

  constructor(root: string) {
    this.root = root;
  }

  /** 契约根目录。 */
  readonly root: string;

  /**
   * 加载目录下所有 YAML 契约。
   */
  loadAll(directory: string): this {
    for (const entry of readdirSync(directory)) {
      if (!entry.endsWith('.yaml') && !entry.endsWith('.yml')) continue;

      const filePath = join(directory, entry);
      if (!statSync(filePath).isFile()) continue;

      this.load(filePath);
    }
    return this;
  }

  /**
   * 加载单个契约文件。
   */
  load(filePath: string): this {
    const key = this.keyFor(filePath);
    const raw = readFileSync(filePath, 'utf8');
    const doc = parse(raw) as ContractDocument;
    this.documents.set(key, doc);
    return this;
  }

  /** 已加载的文档（按 key）。 */
  get documents_(): Map<string, ContractDocument> {
    return this.documents;
  }

  /**
   * 按文件名取文档。
   */
  get(fileName: string): ContractDocument | undefined {
    return this.documents.get(fileName);
  }

  /** 所有文档。 */
  all(): Array<{ name: string; doc: ContractDocument }> {
    return [...this.documents.entries()].map(([name, doc]) => ({ name, doc }));
  }

  /**
   * 解析 $ref 引用，返回目标节点。
   *
   * @param fromFile 引用来源文件（用于解析相对路径）
   * @param ref $ref 字符串
   */
  resolve(fromFile: string, ref: string): unknown {
    const { file, path } = parseRef(ref);

    // 同一文件内引用
    if (!file) {
      const doc = this.documents.get(fromFile);
      if (!doc) return undefined;
      return this.walk(doc, path);
    }

    // 跨文件引用 —— 文件名以 ./ 或 ../ 开头
    const targetName = this.keyFor(resolve(join(this.root, 'openapi', file)));
    const target = this.documents.get(targetName);
    if (!target) return undefined;

    return this.walk(target, path);
  }

  /**
   * 递归展开所有 $ref（生成扁平化契约用）。
   *
   * @param fromFile 引用来源文件
   * @param node 当前节点
   * @param seen 已展开过的引用（防循环）
   */
  dereference(fromFile: string, node: unknown, seen = new Set<string>()): unknown {
    if (Array.isArray(node)) {
      return node.map((item) => this.dereference(fromFile, item, seen));
    }

    if (node === null || typeof node !== 'object') return node;

    const record = node as Record<string, unknown>;

    // 纯 $ref 节点 → 展开
    const ref = record.$ref;
    if (typeof ref === 'string') {
      if (seen.has(ref)) return {}; // 循环引用
      const nextSeen = new Set(seen);
      nextSeen.add(ref);

      const resolved = this.resolve(fromFile, ref);
      if (resolved === undefined) return record;
      return this.dereference(fromFile, resolved, nextSeen);
    }

    // 普通对象 → 递归
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(record)) {
      result[key] = this.dereference(fromFile, value, seen);
    }
    return result;
  }

  /** 沿路径查找节点。 */
  private walk(node: unknown, path: string[]): unknown {
    let current = node;
    for (const segment of path) {
      if (current === null || typeof current !== 'object') return undefined;
      current = (current as Record<string, unknown>)[segment];
    }
    return current;
  }

  /** 路径 → 统一 key。 */
  private keyFor(filePath: string): string {
    return basename(filePath);
  }
}

/**
 * 导出为 YAML（用于契约快照）。
 */
export function toYaml(doc: unknown): string {
  return stringify(doc, { lineWidth: 100 });
}
