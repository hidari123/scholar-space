/**
 * @scholarspace/ui — 共享设计系统。
 *
 * ⚠️ 铁律：这是**唯一**允许 import 'antd' 的地方。
 *    业务代码只能 `import { X } from '@scholarspace/ui'`。
 *    见 docs/adr/0002-antd-foundation.md
 */

export type { LocaleDefinition } from './i18n/locales';
// ── 国际化 ────────────────────────────────────────────
export {
  BUILTIN_LOCALES,
  DEFAULT_LOCALE,
  detectLocale,
  getLocaleDefinition,
  isLocaleSupported,
  L1_LOCALES,
  LOCALES,
} from './i18n/locales';
export type { CommonMessageKey, NamespaceMessages } from './i18n/messages';
export { BUILTIN_MESSAGES, enUS, mergeMessages, zhCN } from './i18n/messages';
export type { I18nContextValue, I18nProviderProps } from './i18n/provider';
export { I18nProvider, useI18n, useTranslate } from './i18n/provider';
export type {
  LocaleTable,
  MessageTable,
  MessageVars,
  PartialMessageTable,
} from './i18n/resolver';
export {
  buildLocaleTable,
  findPlaceholderMismatches,
  interpolate,
  measureCoverage,
  resolveMessage,
} from './i18n/resolver';
export type { ScholarSpaceProviderProps } from './provider';
// ── 组合 Provider ──────────────────────────────────────
export { ScholarSpaceProvider } from './provider';
export type { BrandConfig, UserPreferences } from './theme/brand';
// ── 主题 ──────────────────────────────────────────────
export {
  applyPreferences,
  brandFromSearchParams,
  DEFAULT_BRAND,
  mergeBrand,
} from './theme/brand';
export type { BrandPreset } from './theme/presets';
export { BRAND_PRESETS, DEFAULT_PRESET_ID, PRESET_IDS } from './theme/presets';
export type { ScholarThemeProviderProps } from './theme/provider';
export {
  buildAntdTheme,
  resolveMode,
  ScholarThemeProvider,
  useSystemPrefersDark,
} from './theme/provider';
