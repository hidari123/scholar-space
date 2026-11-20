/**
 * 数据查询 hooks —— 主仓（集成壳）用的。
 *
 * ⚠️ **为什么在 `data/` 而不是 `core/`** ——
 *    护栏 G3 规定：`core` 层零 React 依赖、零数据请求库。
 *    `core` 是纯逻辑（API 客户端、偏好 store），
 *    `data` 是「用 React Query 包一层」的胶水层。
 *
 * ⚠️ **主仓只有集成壳** ——
 *    论文 / 演示文稿 / 编排 / 社区的数据查询，
 *    都在各自的独立仓的前端里（各自独立部署）。
 *
 * ⚠️ **主仓只查「各站状态」** ——
 *    用来在工作台聚合展示各独立站的状态。
 */

import { useQuery } from '@tanstack/react-query';

import { request } from '../core/api-client';

/** 某个独立站的概况。 */
export interface SiteStatus {
  /** 站点标识（`paper` / `slides` / …）。 */
  site: string;
  /** 显示名。 */
  label: string;
  /** 是否可用。 */
  available: boolean;
  /** 站点地址（独立部署的 URL）。 */
  url: string;
}

/**
 * 独立站清单。
 *
 * ⚠️ **配置放这里，不放代码里** ——
 *    各站的 URL 随部署环境变（本地 / 测试 / 生产），
 *    应该是环境变量或运行时配置，不是硬编码。
 */
export const SITES: SiteStatus[] = [
  { site: 'identity', label: '登录注册', available: false, url: '' },
  { site: 'paper', label: '论文库', available: false, url: '' },
  { site: 'slides', label: '演示文稿', available: false, url: '' },
  { site: 'orchestra', label: '编排', available: false, url: '' },
  { site: 'community', label: '社区', available: false, url: '' },
];

/** 查询 key。 */
export const queryKeys = {
  sites: () => ['sites'] as const,
};

/**
 * 查各独立站的状态。
 *
 * ⚠️ **各站都要暴露 `/health`** ——
 *    主站并发问一遍，就知道谁在线。
 */
export function useSiteStatus() {
  return useQuery({
    queryKey: queryKeys.sites(),
    queryFn: async () => {
      const results = await Promise.all(
        SITES.map(async (site) => {
          if (!site.url) return { ...site, available: false };

          try {
            await request<unknown>(`${site.url}/health`, { method: 'GET' });
            return { ...site, available: true };
          } catch {
            // ⚠️ **一个站挂掉不影响其他的** ——
            //    全部用 Promise.allSettled 更严谨，
            //    但这里已经逐个 catch 了。
            return { ...site, available: false };
          }
        }),
      );

      return results;
    },
  });
}
