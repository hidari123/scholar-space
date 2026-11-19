import { describe, expect, it } from 'vitest';

import { ContractBundle, parseRef } from './loader';
import { collectRefs, validateContracts } from './validator';

/** 构造一个内存契约包。 */
function makeBundle(files: Record<string, string>): ContractBundle {
  const bundle = new ContractBundle('/tmp');
  // 直接写入内部 Map（测试用）
  const docs = bundle.documents_ as Map<string, Record<string, unknown>>;
  for (const [name, content] of Object.entries(files)) {
    // 极简 YAML 解析：这里用 JSON 代替以避免引入解析依赖
    docs.set(name, JSON.parse(content) as Record<string, unknown>);
  }
  return bundle;
}

describe('parseRef', () => {
  it('解析跨文件引用', () => {
    const result = parseRef('./common.yaml#/components/schemas/HealthStatus');
    expect(result.file).toBe('./common.yaml');
    expect(result.path).toEqual(['components', 'schemas', 'HealthStatus']);
  });

  it('解析同文件引用', () => {
    const result = parseRef('#/components/schemas/X');
    expect(result.file).toBe('');
    expect(result.path).toEqual(['components', 'schemas', 'X']);
  });
});

describe('collectRefs', () => {
  it('收集嵌套的 $ref', () => {
    const doc = {
      a: { $ref: '#/x' },
      b: [{ $ref: '#/y' }, { $ref: '#/x' }],
      c: { d: { $ref: '#/z' } },
    };
    const refs = collectRefs(doc);
    expect(refs).toContain('#/x');
    expect(refs).toContain('#/y');
    expect(refs).toContain('#/z');
    expect(refs).toHaveLength(3); // 去重
  });
});

describe('validateContracts', () => {
  it('合法契约通过', () => {
    const bundle = makeBundle({
      'test.yaml': JSON.stringify({
        openapi: '3.1.0',
        paths: {
          '/api/v1/things': {
            get: {
              operationId: 'listThings',
              summary: '列出',
              responses: { '200': { description: 'ok' } },
            },
          },
        },
        components: { schemas: { Thing: { type: 'object' } } },
      }),
    });

    const result = validateContracts(bundle);
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.stats.operations).toBe(1);
    expect(result.stats.schemas).toBe(1);
  });

  it('路径缺少版本前缀 → 报错', () => {
    const bundle = makeBundle({
      'test.yaml': JSON.stringify({
        paths: {
          '/things': {
            get: {
              operationId: 'listThings',
              responses: { '200': { description: 'ok' } },
            },
          },
        },
      }),
    });

    const result = validateContracts(bundle);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('必须以'))).toBe(true);
  });

  it('operationId 缺失 → 报错', () => {
    const bundle = makeBundle({
      'test.yaml': JSON.stringify({
        paths: {
          '/api/v1/things': {
            get: { responses: { '200': { description: 'ok' } } },
          },
        },
      }),
    });

    const result = validateContracts(bundle);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('缺少 operationId'))).toBe(true);
  });

  it('operationId 重复 → 报错', () => {
    const bundle = makeBundle({
      'a.yaml': JSON.stringify({
        paths: {
          '/api/v1/a': {
            get: {
              operationId: 'dup',
              responses: { '200': { description: 'ok' } },
            },
          },
        },
      }),
      'b.yaml': JSON.stringify({
        paths: {
          '/api/v1/b': {
            get: {
              operationId: 'dup',
              responses: { '200': { description: 'ok' } },
            },
          },
        },
      }),
    });

    const result = validateContracts(bundle);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('重复'))).toBe(true);
  });

  it('responses 缺失 → 报错', () => {
    const bundle = makeBundle({
      'test.yaml': JSON.stringify({
        paths: {
          '/api/v1/things': {
            get: { operationId: 'listThings' },
          },
        },
      }),
    });

    const result = validateContracts(bundle);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('缺少 responses'))).toBe(true);
  });

  it('无法解析的 $ref → 报错', () => {
    const bundle = makeBundle({
      'test.yaml': JSON.stringify({
        paths: {
          '/api/v1/things': {
            get: {
              operationId: 'listThings',
              responses: {
                '200': {
                  description: 'ok',
                  content: {
                    'application/json': {
                      schema: { $ref: './missing.yaml#/components/schemas/X' },
                    },
                  },
                },
              },
            },
          },
        },
      }),
    });

    const result = validateContracts(bundle);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('无法解析'))).toBe(true);
  });

  it('缺少 summary → 警告但不阻断', () => {
    const bundle = makeBundle({
      'test.yaml': JSON.stringify({
        paths: {
          '/api/v1/things': {
            get: {
              operationId: 'listThings',
              responses: { '200': { description: 'ok' } },
            },
          },
        },
      }),
    });

    const result = validateContracts(bundle);
    expect(result.ok).toBe(true);
    expect(result.warnings.some((w) => w.includes('缺少 summary'))).toBe(true);
  });
});
