/**
 * Vite 环境变量类型声明。
 *
 * ⚠️ **为什么要手写** ——
 *   `import.meta.env` 默认只有 `string` 类型的索引，
 *   但 `ImportMetaEnv` 需要显式声明才能让 TS 知道有哪些变量。
 *
 * ⚠️ **各独立站的 URL** ——
 *   本地开发是 `localhost:5272`，
 *   生产是 `paper.scholarspace.com`。
 *   写死在代码里两边都得改，所以走环境变量。
 *
 * ⚠️ **`.env.example` 是跨仓同步的** ——
 *   各站用同一份模板（由 `cli sync` 同步）。
 */

/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 登录注册站。 */
  readonly VITE_SITE_IDENTITY_URL?: string;
  /** 论文库站。 */
  readonly VITE_SITE_PAPER_URL?: string;
  /** 演示文稿站。 */
  readonly VITE_SITE_SLIDES_URL?: string;
  /** 编排站。 */
  readonly VITE_SITE_ORCHESTRA_URL?: string;
  /** 社区站。 */
  readonly VITE_SITE_COMMUNITY_URL?: string;

  /** 本站自己的 API 地址（默认同源）。 */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
