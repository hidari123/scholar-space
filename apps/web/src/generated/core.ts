/**
 * core 客户端 —— 由契约生成，不要手改。
 *
 * 契约：core.yaml
 *
 * ⚠️ **改了会被下次生成覆盖** —— 要定制行为，改生成器。
 */
import { type RequestOptions, request } from '../core/api-client';
/** HealthStatus —— 由契约生成，不要手改。 */
export type HealthStatus = unknown;
/** BrandingConfig —— 由契约生成，不要手改。 */
export type BrandingConfig = {
  colorPrimary: string;
  colors?: {
    success?: string;
    warning?: string;
    error?: string;
    info?: string;
  };
  borderRadius?: number;
  fontFamily?: string;
  density?: 'default' | 'compact';
  mode?: 'light' | 'dark' | 'auto';
  brandName?: string;
  logo?: {
    light: string;
    dark: string;
  };
  favicon?: string;
  messages?: Record<string, unknown>;
};
/** 健康检查 */
export async function getHealth(options?: RequestOptions): Promise<HealthStatus> {
  return request<HealthStatus>(`/v1/health`, {
    method: 'GET',
    ...options,
  });
}
/** 就绪检查（依赖是否可用） */
export async function getReady(options?: RequestOptions): Promise<HealthStatus> {
  return request<HealthStatus>(`/v1/ready`, {
    method: 'GET',
    ...options,
  });
}
/** 获取品牌配置 */
export async function getBranding(options?: RequestOptions): Promise<BrandingConfig> {
  return request<BrandingConfig>(`/v1/config/branding`, {
    method: 'GET',
    ...options,
  });
}
/** 获取错误码表 */
export async function getErrorCodes(options?: RequestOptions): Promise<{
  codes?: Record<string, unknown>;
}> {
  return request<{
  codes?: Record<string, unknown>;
}>(`/v1/config/error-codes`, {
    method: 'GET',
    ...options,
  });
}
