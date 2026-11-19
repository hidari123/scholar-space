/**
 * 主题 Provider —— 把品牌配置翻译成 AntD 的 ThemeConfig。
 *
 * 核心原则（ADR-0007）：
 *   ① 只设种子令牌（colorPrimary 等），AntD 自动派生全部状态色
 *   ② 组件级只调「结构」（高度/圆角/间距），绝不调「颜色」
 *   ③ 明暗与紧凑通过 algorithm 组合实现
 */

import type { ThemeConfig } from 'antd';
import { theme as antdTheme, ConfigProvider } from 'antd';
import type { Locale } from 'antd/es/locale';
import { type ReactNode, useEffect, useMemo, useState } from 'react';

import type { BrandConfig } from './brand';

/** 系统是否偏好暗色。 */
export function useSystemPrefersDark(): boolean {
  const [prefersDark, setPrefersDark] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;

    const query = window.matchMedia('(prefers-color-scheme: dark)');
    setPrefersDark(query.matches);

    const listener = (event: MediaQueryListEvent) => setPrefersDark(event.matches);
    query.addEventListener('change', listener);
    return () => query.removeEventListener('change', listener);
  }, []);

  return prefersDark;
}

/** 解析最终生效的明暗状态。 */
export function resolveMode(
  mode: BrandConfig['mode'],
  systemPrefersDark: boolean,
): 'light' | 'dark' {
  if (mode === 'dark') return 'dark';
  if (mode === 'light') return 'light';
  return systemPrefersDark ? 'dark' : 'light';
}

/**
 * 由品牌配置生成 AntD 主题。
 *
 * 导出以便测试与 `theme preview` 工具复用。
 *
 * @param brand 品牌配置
 * @param isDark 是否暗色模式
 */
export function buildAntdTheme(brand: BrandConfig, isDark: boolean): ThemeConfig {
  const radius = brand.borderRadius ?? 6;

  // ⚠️ exactOptionalPropertyTypes: true
  //    → 可选属性不能显式传 undefined，必须条件展开。
  const seed: ThemeConfig['token'] = {
    colorPrimary: brand.colorPrimary,
    colorLink: brand.colorPrimary,
    borderRadius: radius,
    fontSize: 14,
    sizeUnit: 4,
    sizeStep: 4,
    motionUnit: 0.1,
    motionBase: 0,
    wireframe: false,
  };

  if (brand.colors?.info !== undefined) seed.colorInfo = brand.colors.info;
  if (brand.colors?.success !== undefined) seed.colorSuccess = brand.colors.success;
  if (brand.colors?.warning !== undefined) seed.colorWarning = brand.colors.warning;
  if (brand.colors?.error !== undefined) seed.colorError = brand.colors.error;
  if (brand.fontFamily !== undefined) seed.fontFamily = brand.fontFamily;

  return {
    // ① 算法：暗色 + 可选紧凑（可组合）
    algorithm: [
      isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
      ...(brand.density === 'compact' ? [antdTheme.compactAlgorithm] : []),
    ],

    // ② 种子令牌
    token: seed,

    // ③ 组件级：只调「结构」，不调「颜色」
    components: {
      Button: {
        controlHeight: 36,
        fontWeight: 500,
        borderRadius: radius,
        paddingContentHorizontal: 16,
      },
      Input: {
        controlHeight: 36,
        borderRadius: radius,
      },
      Select: {
        controlHeight: 36,
      },
      Card: {
        borderRadiusLG: radius * 2,
      },
      Table: {
        headerBg: 'transparent',
        cellPaddingBlockSM: 8,
      },
      Layout: {
        headerHeight: 56,
        bodyBg: 'transparent',
      },
      Tabs: {
        horizontalItemGutter: 24,
      },
    },
  };
}

export interface ScholarThemeProviderProps {
  /** 品牌配置。 */
  brand: BrandConfig;
  /** AntD locale（用于组件自身文案）。 */
  antdLocale?: Locale | undefined;
  /** 书写方向。 */
  direction?: 'ltr' | 'rtl' | undefined;
  children: ReactNode;
}

/**
 * 主题 Provider。
 *
 * 用法：
 *   <ScholarThemeProvider brand={brand} antdLocale={locale} direction="ltr">
 *     <App />
 *   </ScholarThemeProvider>
 */
export function ScholarThemeProvider({
  brand,
  antdLocale,
  direction = 'ltr',
  children,
}: ScholarThemeProviderProps) {
  const systemPrefersDark = useSystemPrefersDark();
  const resolved = resolveMode(brand.mode, systemPrefersDark);
  const isDark = resolved === 'dark';

  const themeConfig = useMemo<ThemeConfig>(() => buildAntdTheme(brand, isDark), [brand, isDark]);

  // ⚠️ exactOptionalPropertyTypes: AntD 的 `locale?: Locale` 不接受显式 undefined
  //    → 条件展开，而不是 `locale={antdLocale}`
  const localeProps = antdLocale === undefined ? {} : { locale: antdLocale };

  return (
    <ConfigProvider theme={themeConfig} direction={direction} {...localeProps}>
      {children}
    </ConfigProvider>
  );
}
