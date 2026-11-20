/**
 * `@scholarspace/web` —— 主站前端。
 *
 * ⚠️ **入口只导出 App** —— 其他模块按需从具体路径导入。
 */

export { App } from './app/App';
export { AppShell } from './app/AppShell';
export { DashboardPage } from './app/pages';
export type { ApiResponse } from './core/api-client';
export { ApiError, request, unwrap } from './core/api-client';
export type {
  ColorMode,
  Density,
  PreferencesState,
  ThemePreset,
  UiLocale,
} from './core/preferences';
export { usePreferences } from './core/preferences';
