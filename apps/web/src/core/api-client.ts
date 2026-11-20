/**
 * API 客户端 —— 跟网关说话。
 *
 * ⚠️ **只跟网关说话** —— 前端不知道各个独立服务在哪。
 * 网关负责路由映射（前端零改动切流）。
 */

/** API 基础路径。 */
export const API_BASE = '/api';

/** 统一响应信封 —— 见 `contracts/openapi/common.yaml`。 */
export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T | null;
  request_id: string;
  timestamp: string;
}

/** 请求配置。 */
export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

/** API 错误 —— 带业务错误码。 */
export class ApiError extends Error {
  /** 业务错误码。 */
  readonly code: number;
  /** 请求追踪 ID —— 报障时给用户看。 */
  readonly requestId: string;
  /** HTTP 状态码。 */
  readonly status: number;

  constructor(message: string, code: number, requestId: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.requestId = requestId;
    this.status = status;
  }
}

/**
 * 解析响应信封。
 *
 * ⚠️ **业务错误码在信封里** —— HTTP 200 不代表成功。
 */
export function unwrap<T>(response: ApiResponse<T>): T {
  if (response.code === 0) {
    if (response.data === null) {
      throw new ApiError('响应没有数据', response.code, response.request_id, 200);
    }
    return response.data;
  }

  throw new ApiError(response.message, response.code, response.request_id, 200);
}

/**
 * 构造请求。
 *
 * ⚠️ **统一带 `X-Request-Id`** —— 日志、链路追踪靠它对齐。
 */
export function buildRequest(
  path: string,
  options: RequestOptions = {},
): { url: string; init: RequestInit } {
  const method = options.method ?? 'GET';
  const url = `${API_BASE}${path}`;

  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...options.headers,
  };

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const init: RequestInit = {
    method,
    headers,
  };

  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
  }

  if (options.signal) {
    init.signal = options.signal;
  }

  return { url, init };
}

/**
 * 发请求。
 *
 * ⚠️ **HTTP 层错误和业务层错误分开** ——
 * HTTP 5xx 是服务挂了，业务 code != 0 是业务拒绝。
 */
export async function request<T>(
  path: string,
  options: RequestOptions = {},
  fetchImpl: typeof fetch = fetch,
): Promise<T> {
  const { url, init } = buildRequest(path, options);

  const response = await fetchImpl(url, init);

  let payload: ApiResponse<T>;
  try {
    payload = (await response.json()) as ApiResponse<T>;
  } catch {
    // ⚠️ **响应不是 JSON** —— 服务可能崩了
    throw new ApiError(
      `服务返回了非 JSON 响应（HTTP ${response.status}）`,
      response.status * 100,
      '',
      response.status,
    );
  }

  if (!response.ok) {
    throw new ApiError(
      payload.message || `请求失败（HTTP ${response.status}）`,
      payload.code,
      payload.request_id,
      response.status,
    );
  }

  return unwrap(payload);
}
