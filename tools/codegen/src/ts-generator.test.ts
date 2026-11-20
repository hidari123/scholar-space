/**
 * TS 生成器测试。
 *
 * ⚠️ **重点验证「生成结果可用」**：
 *     · 命名类型（不是内联对象）
 *     · 路径参数替换 + URL 编码
 *     · snake_case → camelCase
 *     · enum → 字面量联合
 */

import { describe, expect, it } from 'vitest';

import {
  generateTsClient,
  namedTypeIfPossible,
  schemaToType,
  stripApiPrefix,
  toCamelCase,
} from './ts-generator';

describe('toCamelCase', () => {
  it('snake_case → camelCase', () => {
    expect(toCamelCase('paper_id')).toBe('paperId');
    expect(toCamelCase('source_type')).toBe('sourceType');
  });

  it('已经是 camelCase 就不动', () => {
    expect(toCamelCase('paperId')).toBe('paperId');
  });
});

describe('stripApiPrefix', () => {
  it('去掉 /api 前缀', () => {
    expect(stripApiPrefix('/api/v1/papers')).toBe('/v1/papers');
  });

  it('没有前缀就不动', () => {
    expect(stripApiPrefix('/v1/papers')).toBe('/v1/papers');
  });
});

describe('schemaToType', () => {
  it('基本类型', () => {
    expect(schemaToType({ type: 'string' }, new Map())).toBe('string');
    expect(schemaToType({ type: 'integer' }, new Map())).toBe('number');
    expect(schemaToType({ type: 'boolean' }, new Map())).toBe('boolean');
  });

  it('enum → 字面量联合', () => {
    const type = schemaToType({ type: 'string', enum: ['a', 'b'] }, new Map());

    expect(type).toBe("'a' | 'b'");
  });

  it('联合类型（含 null）', () => {
    const type = schemaToType({ type: ['string', 'null'] }, new Map());

    expect(type).toBe('string | null');
  });

  it('数组的项是对象时用 Array<>', () => {
    const type = schemaToType(
      { type: 'array', items: { type: 'object', properties: { a: { type: 'string' } } } },
      new Map(),
    );

    expect(type).toContain('Array<');
  });

  it('$ref → 命名类型', () => {
    const names = new Map([['#/components/schemas/Paper', 'Paper']]);

    expect(schemaToType({ $ref: '#/components/schemas/Paper' }, names)).toBe('Paper');
  });
});

describe('namedTypeIfPossible', () => {
  it('数组的项是命名类型 → 用名字', () => {
    const names = new Map([['#/components/schemas/Paper', 'Paper']]);

    const type = namedTypeIfPossible(
      { type: 'array', items: { $ref: '#/components/schemas/Paper' } },
      names,
    );

    // ⚠️ **不能内联整个对象** —— 生成的代码没法看
    expect(type).toBe('Paper[]');
  });

  it('直接是 $ref → 用名字', () => {
    const names = new Map([['#/components/schemas/Paper', 'Paper']]);

    expect(namedTypeIfPossible({ $ref: '#/components/schemas/Paper' }, names)).toBe('Paper');
  });
});

describe('generateTsClient', () => {
  /** 一份最小契约。 */
  const document = {
    components: {
      schemas: {
        Paper: {
          type: 'object',
          required: ['paper_id', 'title'],
          properties: {
            paper_id: { type: 'string' },
            title: { type: 'string' },
            year: { type: ['integer', 'null'] },
          },
        },
      },
    },
    paths: {
      '/api/v1/papers/{paper_id}': {
        parameters: [{ name: 'paper_id', in: 'path', required: true }],
        get: {
          operationId: 'getPaper',
          summary: '取论文',
          responses: {
            '200': {
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/Paper' } },
              },
            },
          },
        },
      },
    },
  };

  /** 解引用后的版本。 */
  const dereferenced = {
    ...document,
    paths: {
      '/api/v1/papers/{paper_id}': {
        parameters: [{ name: 'paper_id', in: 'path', required: true }],
        get: { ...document.paths['/api/v1/papers/{paper_id}'].get },
      },
    },
  };

  it('生成类型定义', () => {
    const result = generateTsClient(document, dereferenced, {
      contractName: 'paper.yaml',
      moduleName: 'paper',
      baseUrl: '/api',
    });

    expect(result.code).toContain('export type Paper = {');
    expect(result.typeCount).toBe(1);
  });

  it('snake_case 属性转 camelCase', () => {
    const result = generateTsClient(document, dereferenced, {
      contractName: 'paper.yaml',
      moduleName: 'paper',
      baseUrl: '/api',
    });

    expect(result.code).toContain('paperId: string;');
    expect(result.code).not.toContain('paper_id: string;');
  });

  it('⚠️ 路径参数被替换 + URL 编码', () => {
    const result = generateTsClient(document, dereferenced, {
      contractName: 'paper.yaml',
      moduleName: 'paper',
      baseUrl: '/api',
    });

    expect(result.code).toContain('paperId: string');
    // ⚠️ **URL 编码必须有** —— 直接拼用户输入会有注入风险
    // ⚠️ **用变量拼** —— 字符串字面量里的 `${` 会触发
    //    biome 的 `noTemplateCurlyInString`。
    const encoded = `\${encodeURIComponent(paperId)}`;
    expect(result.code).toContain(encoded);
    expect(result.code).not.toContain('{paper_id}');
  });

  it('⚠️ 响应类型用命名类型', () => {
    const result = generateTsClient(document, dereferenced, {
      contractName: 'paper.yaml',
      moduleName: 'paper',
      baseUrl: '/api',
    });

    expect(result.code).toContain('Promise<Paper>');
    expect(result.operationCount).toBe(1);
  });

  it('⚠️ /api 前缀被去掉（api-client 已经拼了）', () => {
    const result = generateTsClient(document, dereferenced, {
      contractName: 'paper.yaml',
      moduleName: 'paper',
      baseUrl: '/api',
    });

    expect(result.code).toContain('`/v1/papers/');
    expect(result.code).not.toContain('`/api/v1/papers/');
  });
});
