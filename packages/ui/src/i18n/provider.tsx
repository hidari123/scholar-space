/**
 * i18n Provider —— 界面语言上下文。
 *
 * 用法：
 *   <I18nProvider locale="zh-CN" messages={customMessages}>
 *     <App />
 *   </I18nProvider>
 *
 * ⚠️ 与 AntD 的 ConfigProvider 必须用同一个 locale，
 *    否则会出现「分页是中文、按钮是英文」的割裂。
 *    见 `ScholarSpaceProvider` 的组合用法。
 */

import {
  createContext,
  createElement,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
} from 'react';

import { DEFAULT_LOCALE, getLocaleDefinition } from './locales';
import { BUILTIN_MESSAGES } from './messages';
import {
  buildLocaleTable,
  type LocaleTable,
  type MessageVars,
  type PartialMessageTable,
  resolveMessage,
} from './resolver';

export interface I18nContextValue {
  /** 当前界面语言。 */
  locale: string;
  /** 当前语言的文案表（含回退链的 level 2-3）。 */
  table: LocaleTable;
  /** 解析文案。 */
  t: (key: string, vars?: MessageVars) => string;
  /** 当前语言的书写方向。 */
  dir: 'ltr' | 'rtl';
  /** 当前语言的 AntD locale。 */
  antdLocale: ReturnType<typeof getLocaleDefinition>['antd'];
}

const I18nContext = createContext<I18nContextValue | null>(null);

export interface I18nProviderProps {
  /** 当前界面语言。 */
  locale?: string | undefined;
  /** 运行时注册的语言表（自定义语言）。 */
  messages?: LocaleTable | undefined;
  /** 当前 locale 的运行时覆盖（最高优先级）。 */
  overrides?: PartialMessageTable | undefined;
  /** 额外的内置文案（业务包命名空间合并进来）。 */
  builtin?: LocaleTable | undefined;
  children: ReactNode;
}

/**
 * i18n Provider。
 */
export function I18nProvider({
  locale = DEFAULT_LOCALE,
  messages,
  overrides,
  builtin = BUILTIN_MESSAGES,
  children,
}: I18nProviderProps) {
  const definition = useMemo(() => getLocaleDefinition(locale, messages), [locale, messages]);
  const table = useMemo(() => buildLocaleTable(builtin, messages), [builtin, messages]);

  const t = useCallback(
    (key: string, vars?: MessageVars) =>
      resolveMessage(locale, key, table, overrides, messages, vars),
    [locale, table, overrides, messages],
  );

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      table,
      t,
      dir: definition.dir,
      antdLocale: definition.antd,
    }),
    [locale, table, t, definition],
  );

  return createElement(I18nContext.Provider, { value }, children);
}

/**
 * 获取 i18n 上下文。
 *
 * @throws 未包裹 I18nProvider 时抛错 —— 避免静默返回 undefined。
 */
export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
}

/**
 * 获取文案解析函数的简写。
 *
 * 用法：`const t = useTranslate(); t('common.action.confirm')`
 */
export function useTranslate(): I18nContextValue['t'] {
  return useI18n().t;
}
