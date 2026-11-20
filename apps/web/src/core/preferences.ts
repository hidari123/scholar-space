/**
 * 用户偏好 —— 界面语言 + 主题 + 品牌色。
 *
 * ⚠️ **偏好要持久化** ——
 * 用户切了语言，刷新页面不该弹回默认。
 *
 * ⚠️ **只存「用户选了啥」，不存「算出来的结果」** ——
 * 比如不存 AntD 的 locale 对象，只存 `'zh-CN'`。
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** 界面语言。 */
export type UiLocale =
  | 'zh-CN'
  | 'en-US'
  | 'ja-JP'
  | 'ko-KR'
  | 'fr-FR'
  | 'de-DE'
  | 'es-ES'
  | 'ar-EG';

/** 主题预设。 */
export type ThemePreset = 'scholar' | 'academic' | 'emerald' | 'graphite' | 'lab';

/** 颜色模式。 */
export type ColorMode = 'light' | 'dark' | 'system';

/** 界面密度。 */
export type Density = 'comfortable' | 'compact';

/** 偏好状态。 */
export interface PreferencesState {
  /** 界面语言。 */
  locale: UiLocale;
  /** 主题预设。 */
  preset: ThemePreset;
  /** 品牌主色（十六进制）。 */
  brandColor: string | null;
  /** 颜色模式。 */
  colorMode: ColorMode;
  /** 界面密度。 */
  density: Density;

  /** 切语言。 */
  setLocale: (locale: UiLocale) => void;
  /** 切主题预设。 */
  setPreset: (preset: ThemePreset) => void;
  /** 改品牌色。 */
  setBrandColor: (color: string | null) => void;
  /** 改颜色模式。 */
  setColorMode: (mode: ColorMode) => void;
  /** 改密度。 */
  setDensity: (density: Density) => void;
}

/**
 * 偏好 store。
 *
 * ⚠️ **localStorage 存不下就当没存** ——
 * 隐私模式下 `localStorage` 会抛异常，
 * 不能让整个应用崩掉。
 */
export const usePreferences = create<PreferencesState>()(
  persist(
    (set) => ({
      locale: 'zh-CN',
      preset: 'scholar',
      brandColor: null,
      colorMode: 'system',
      density: 'comfortable',

      setLocale: (locale) => set({ locale }),
      setPreset: (preset) => set({ preset }),
      setBrandColor: (brandColor) => set({ brandColor }),
      setColorMode: (colorMode) => set({ colorMode }),
      setDensity: (density) => set({ density }),
    }),
    {
      name: 'scholarspace-preferences',
      // ⚠️ **存哪些字段** —— 函数不要存
      partialize: (state) => ({
        locale: state.locale,
        preset: state.preset,
        brandColor: state.brandColor,
        colorMode: state.colorMode,
        density: state.density,
      }),
    },
  ),
);
