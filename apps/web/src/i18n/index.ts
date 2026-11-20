/**
 * 主仓文案 —— 集成壳专用。
 *
 * ⚠️ **主仓只有集成壳** ——
 *    论文库 / 演示文稿 / 编排 / 社区的文案
 *    在各自的独立仓里（各自独立部署，各自打包）。
 *
 * ⚠️ **只有 zh-CN 和 en-US 两套** ——
 *    其余 10 种界面语言靠 ui 包的 5 级回退链兜底
 *    （overrides → locales[locale] → BUILTIN[locale] → BUILTIN['en-US'] → key）。
 *    ⚠️ **不写 12 套** —— 那是假本地化，比只支持两种更糟。
 */

import type { LocaleTable } from '@scholarspace/ui';

const zhCN = {
  'app.name': 'ScholarSpace',
  'app.tagline': '学术工作空间',

  'app.nav.dashboard': '工作台',
  'app.nav.papers': '论文库',
  'app.nav.slides': '演示文稿',
  'app.nav.orchestra': '编排',
  'app.nav.community': '社区',
  'app.nav.identity': '登录注册',

  'app.page.dashboard.title': '工作台',
  'app.page.dashboard.description': '各子项目独立部署、独立运行，这里是统一入口。',

  'app.dashboard.site.online': '在线',
  'app.dashboard.site.offline': '离线',
  'app.dashboard.site.open': '打开',
  'app.dashboard.site.description': '{label} —— 独立部署的子项目。',

  'app.state.loading': '加载中…',
  'app.state.empty': '暂无数据',
  'app.state.error': '出错了',
  'app.state.retry': '重试',
} as const;

const enUS = {
  'app.name': 'ScholarSpace',
  'app.tagline': 'Academic workspace',

  'app.nav.dashboard': 'Dashboard',
  'app.nav.papers': 'Papers',
  'app.nav.slides': 'Slides',
  'app.nav.orchestra': 'Orchestra',
  'app.nav.community': 'Community',
  'app.nav.identity': 'Sign in',

  'app.page.dashboard.title': 'Dashboard',
  'app.page.dashboard.description':
    'Each sub-project deploys and runs independently — this is the unified entry.',

  'app.dashboard.site.online': 'Online',
  'app.dashboard.site.offline': 'Offline',
  'app.dashboard.site.open': 'Open',
  'app.dashboard.site.description': '{label} — an independently deployed sub-project.',

  'app.state.loading': 'Loading…',
  'app.state.empty': 'No data',
  'app.state.error': 'Something went wrong',
  'app.state.retry': 'Retry',
} as const;

export { enUS, zhCN };

/** 主仓文案 key。 */
export type AppMessageKey = keyof typeof zhCN;

/**
 * 主仓文案表。
 *
 * ⚠️ **通过 `namespaces` 传给 Provider** ——
 *    Provider 内部会和 `BUILTIN_MESSAGES` 合并，
 *    这样 `common.*` 那些公共文案不会丢。
 */
export const APP_MESSAGES: LocaleTable = {
  'zh-CN': zhCN,
  'en-US': enUS,
};
