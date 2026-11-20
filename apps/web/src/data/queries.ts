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

/**
 * 独立站标识。
 *
 * ⚠️ **用字面量联合，不用 `string`** ——
 *    写错站名会编译期报错，而不是运行时才发现。
 */
export type SiteId = 'identity' | 'paper' | 'slides' | 'orchestra' | 'community';

/** 某个独立站的概况。 */
export interface SiteDefinition {
  /** 站点标识。 */
  id: SiteId;
  /**
   * 显示名的 i18n key。
   *
   * ⚠️ **不要用 `label: string`** ——
   *    硬编码文案会导致切英文时露出中文。
   *    文案必须在各站的 i18n 包里。
   */
  labelKey: string;
}

/** 独立站 + 运行时状态。 */
export interface SiteStatus extends SiteDefinition {
  /** 是否可用（健康检查通过）。 */
  available: boolean;
  /** 站点地址（独立部署的 URL）。 */
  url: string;
}

/**
 * 独立站清单。
 *
 * ⚠️ **只放结构，不放文案、不放 URL** ——
 *    文案走 i18n（`labelKey`），
 *    URL 走环境变量（部署环境不同，本地/生产不一样）。
 */
export const SITES: SiteDefinition[] = [
  { id: 'identity', labelKey: 'app.nav.identity' },
  { id: 'paper', labelKey: 'app.nav.papers' },
  { id: 'slides', labelKey: 'app.nav.slides' },
  { id: 'orchestra', labelKey: 'app.nav.orchestra' },
  { id: 'community', labelKey: 'app.nav.community' },
];

/**
 * 取某个站的基础 URL。
 *
 * ⚠️ **从环境变量读** ——
 *    本地开发是 `localhost:5272`，
 *    生产是 `paper.scholarspace.com`，
 *    写死在代码里两边都得改。
 *
 * ⚠️ **取不到返回空串** ——
 *    调用方要判断「没配置」和「配了但站挂了」，
 *    这两种情况显示不一样。
 */
export function siteUrl(id: SiteId): string {
  // ⚠️ **显式列出每个站的变量** ——
  //    `import.meta.env[key]` 动态索引在 `ImportMetaEnv` 上不合法
  //    （TS 不知道 key 是不是合法的 key）。
  const urls: Record<SiteId, string | undefined> = {
    identity: import.meta.env.VITE_SITE_IDENTITY_URL,
    paper: import.meta.env.VITE_SITE_PAPER_URL,
    slides: import.meta.env.VITE_SITE_SLIDES_URL,
    orchestra: import.meta.env.VITE_SITE_ORCHESTRA_URL,
    community: import.meta.env.VITE_SITE_COMMUNITY_URL,
  };

  const value = urls[id];

  // ⚠️ **去掉末尾斜杠** —— 拼接路径时避免出现 `//`。
  return typeof value === 'string' ? value.replace(/\/$/, '') : '';
}

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
          const url = siteUrl(site.id);

          // ⚠️ **没配 URL 就直接算离线** ——
          //    不发请求（不然会打到主站自己的路径上）。
          if (!url) return { ...site, available: false, url };

          try {
            await request<unknown>(`${url}/health`, { method: 'GET' });
            return { ...site, available: true, url };
          } catch {
            // ⚠️ **一个站挂掉不影响其他的** ——
            //    全部用 Promise.allSettled 更严谨，
            //    但这里已经逐个 catch 了。
            return { ...site, available: false, url };
          }
        }),
      );

      return results;
    },
  });
}
