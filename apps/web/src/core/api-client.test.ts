/**
 * API 客户端测试。
 *
 * ⚠️ **重点验证「信封语义」**：
 *     · HTTP 200 但 code != 0 → 业务错误
 *     · code == 0 → 返回 data
 *     · 非 JSON 响应 → 明确报错
 */

import { describe, expect, it } from 'vitest';

import { ApiError, buildRequest, request, unwrap } from './api-client';

/** 造一个假的 fetch。 */
function fakeFetch(
  body: unknown,
  status = 200,
): { fetchImpl: typeof fetch; calls: { url: string; init: RequestInit }[] } {
  const calls: { url: string; init: RequestInit }[] = [];

  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as unknown as typeof fetch;

  return { fetchImpl, calls };
}

describe('buildRequest', () => {
  it('GET 不带 body', () => {
    const { url, init } = buildRequest('/v1/papers/search');

    expect(url).toBe('/api/v1/papers/search');
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
  });

  it('POST 带 body 会设 Content-Type', () => {
    const { init } = buildRequest('/v1/papers/search', {
      method: 'POST',
      body: { query: 'AI' },
    });

    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"query":"AI"}');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('自定义 header 会覆盖默认值', () => {
    const { init } = buildRequest('/x', {
      headers: { Accept: 'text/plain' },
    });

    expect((init.headers as Record<string, string>).Accept).toBe('text/plain');
  });
});

describe('unwrap', () => {
  it('code=0 返回 data', () => {
    const data = unwrap({
      code: 0,
      message: 'ok',
      data: { id: 1 },
      request_id: 'r1',
      timestamp: '2026-01-01T00:00:00Z',
    });

    expect(data).toEqual({ id: 1 });
  });

  it('⚠️ code!=0 抛 ApiError', () => {
    expect(() =>
      unwrap({
        code: 40401,
        message: 'common.error.notFound',
        data: null,
        request_id: 'r2',
        timestamp: '2026-01-01T00:00:00Z',
      }),
    ).toThrow(ApiError);
  });

  it('⚠️ code=0 但 data 为 null 也报错', () => {
    expect(() =>
      unwrap({
        code: 0,
        message: 'ok',
        data: null,
        request_id: 'r3',
        timestamp: '2026-01-01T00:00:00Z',
      }),
    ).toThrow(ApiError);
  });
});

describe('request', () => {
  it('成功返回 data', async () => {
    const { fetchImpl } = fakeFetch({
      code: 0,
      message: 'ok',
      data: { title: '论文' },
      request_id: 'r1',
      timestamp: '2026-01-01T00:00:00Z',
    });

    const result = await request<{ title: string }>('/v1/x', {}, fetchImpl);

    expect(result).toEqual({ title: '论文' });
  });

  it('⚠️ HTTP 200 但业务失败 → 抛错', async () => {
    const { fetchImpl } = fakeFetch({
      code: 42201,
      message: '参数错误',
      data: null,
      request_id: 'r4',
      timestamp: '2026-01-01T00:00:00Z',
    });

    await expect(request('/v1/x', {}, fetchImpl)).rejects.toThrow(ApiError);
  });

  it('⚠️ HTTP 500 → 抛错并带状态码', async () => {
    const { fetchImpl } = fakeFetch(
      {
        code: 50000,
        message: '服务器错误',
        data: null,
        request_id: 'r5',
        timestamp: '2026-01-01T00:00:00Z',
      },
      500,
    );

    try {
      await request('/v1/x', {}, fetchImpl);
      expect.unreachable('应该抛错');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(500);
    }
  });

  it('⚠️ 非 JSON 响应 → 明确报错', async () => {
    const fetchImpl = (async () =>
      new Response('<html>500</html>', {
        status: 502,
        headers: { 'Content-Type': 'text/html' },
      })) as unknown as typeof fetch;

    await expect(request('/v1/x', {}, fetchImpl)).rejects.toThrow('非 JSON');
  });
});
