/**
 * 组合 Provider —— 主题 + 国际化 一体化。
 *
 * 关键：AntD locale 与业务 locale 用同一个值，
 * 否则会出现「分页是中文、按钮是英文」的割裂。
 */

import type { ReactNode } from 'react';
import { getLocaleDefinition } from './i18n/locales';
import { BUILTIN_MESSAGES } from './i18n/messages';
import { I18nProvider } from './i18n/provider';
import type { LocaleTable, PartialMessageTable } from './i18n/resolver';
import {
  applyPreferences,
  type BrandConfig,
  mergeBrand,
  type UserPreferences,
} from './theme/brand';
import { ScholarThemeProvider } from './theme/provider';

export interface ScholarSpaceProviderProps {
  /** 品牌配置。 */
  brand?: BrandConfig;
  /** 用户偏好（模式/密度由用户控制）。 */
  preferences?: UserPreferences;
  /** 界面语言。 */
  locale?: string;
  /** 运行时注册的语言表（自定义语言）。 */
  messages?: LocaleTable;
  /** 当前 locale 的运行时覆盖。 */
  overrides?: PartialMessageTable;
  /** 业务包命名空间（合并进内置文案）。 */
  namespaces?: Record<string, LocaleTable>;
  children: ReactNode;
}

/**
 * scholarspace 顶层 Provider。
 *
 * 用法：
 *   <ScholarSpaceProvider brand={brand} locale="zh-CN">
 *     <App />
 *   </ScholarSpaceProvider>
 */
export function ScholarSpaceProvider({
  brand,
  preferences,
  locale = 'zh-CN',
  messages,
  overrides,
  namespaces,
  children,
}: ScholarSpaceProviderProps) {
  const resolvedBrand = applyPreferences(mergeBrand(brand), preferences);
  const definition = getLocaleDefinition(locale, messages);

  const builtin = namespaces ? mergeNamespaces(BUILTIN_MESSAGES, namespaces) : BUILTIN_MESSAGES;

  return (
    <ScholarThemeProvider
      brand={resolvedBrand}
      antdLocale={definition.antd}
      direction={definition.dir}
    >
      <I18nProvider locale={locale} messages={messages} overrides={overrides} builtin={builtin}>
        {children}
      </I18nProvider>
    </ScholarThemeProvider>
  );
}

function mergeNamespaces(
  builtin: LocaleTable,
  namespaces: Record<string, LocaleTable>,
): LocaleTable {
  const merged: LocaleTable = { ...builtin };

  for (const table of Object.values(namespaces)) {
    for (const [locale, messages] of Object.entries(table)) {
      merged[locale] = { ...merged[locale], ...messages };
    }
  }

  return merged;
}
