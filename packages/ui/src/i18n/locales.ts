/**
 * 语言注册表 —— 12 种内置界面语言。
 *
 * 遵循 ADR-0006：
 *   - 界面语言与内容语言完全解耦
 *   - 支持任意自定义 locale（运行时注册）
 *   - AntD locale 必须与业务 locale 联动
 */

import type { Locale } from 'antd/es/locale';
import arEG from 'antd/locale/ar_EG.js';
import deDE from 'antd/locale/de_DE.js';
import enUS from 'antd/locale/en_US.js';
import esES from 'antd/locale/es_ES.js';
import frFR from 'antd/locale/fr_FR.js';
import jaJP from 'antd/locale/ja_JP.js';
import koKR from 'antd/locale/ko_KR.js';
import ptBR from 'antd/locale/pt_BR.js';
import ruRU from 'antd/locale/ru_RU.js';
import zhCN from 'antd/locale/zh_CN.js';
import zhHK from 'antd/locale/zh_HK.js';
import zhTW from 'antd/locale/zh_TW.js';

/** 语言定义。 */
export interface LocaleDefinition {
  /** BCP 47 语言标签。 */
  readonly code: string;
  /** 母语名称（永远用该语言自身显示，不翻译）。 */
  readonly label: string;
  /** 书写方向。 */
  readonly dir: 'ltr' | 'rtl';
  /** AntD 内置 locale（组件自身文案）。 */
  readonly antd?: Locale | undefined;
  /** 是否为平台内置。 */
  readonly builtin: boolean;
  /** 覆盖层级：L1 强制 100% 覆盖，L2 目标 80%。 */
  readonly tier?: 'L1' | 'L2' | undefined;
}

/**
 * 内置语言注册表。
 *
 * L1（100% 覆盖，CI 强制）：zh-CN / en-US
 * L2（目标 80%）：其余 10 种，含 1 个 RTL 验证实现
 */
export const LOCALES: Record<string, LocaleDefinition> = {
  'zh-CN': {
    code: 'zh-CN',
    label: '简体中文',
    dir: 'ltr',
    antd: zhCN,
    builtin: true,
    tier: 'L1',
  },
  'en-US': {
    code: 'en-US',
    label: 'English',
    dir: 'ltr',
    antd: enUS,
    builtin: true,
    tier: 'L1',
  },
  'zh-TW': {
    code: 'zh-TW',
    label: '繁體中文',
    dir: 'ltr',
    antd: zhTW,
    builtin: true,
    tier: 'L2',
  },
  'zh-HK': {
    code: 'zh-HK',
    label: '繁體中文（香港）',
    dir: 'ltr',
    antd: zhHK,
    builtin: true,
    tier: 'L2',
  },
  'ja-JP': {
    code: 'ja-JP',
    label: '日本語',
    dir: 'ltr',
    antd: jaJP,
    builtin: true,
    tier: 'L2',
  },
  'ko-KR': {
    code: 'ko-KR',
    label: '한국어',
    dir: 'ltr',
    antd: koKR,
    builtin: true,
    tier: 'L2',
  },
  'fr-FR': {
    code: 'fr-FR',
    label: 'Français',
    dir: 'ltr',
    antd: frFR,
    builtin: true,
    tier: 'L2',
  },
  'de-DE': {
    code: 'de-DE',
    label: 'Deutsch',
    dir: 'ltr',
    antd: deDE,
    builtin: true,
    tier: 'L2',
  },
  'es-ES': {
    code: 'es-ES',
    label: 'Español',
    dir: 'ltr',
    antd: esES,
    builtin: true,
    tier: 'L2',
  },
  'pt-BR': {
    code: 'pt-BR',
    label: 'Português (Brasil)',
    dir: 'ltr',
    antd: ptBR,
    builtin: true,
    tier: 'L2',
  },
  'ru-RU': {
    code: 'ru-RU',
    label: 'Русский',
    dir: 'ltr',
    antd: ruRU,
    builtin: true,
    tier: 'L2',
  },
  'ar-EG': {
    code: 'ar-EG',
    label: 'العربية',
    dir: 'rtl',
    antd: arEG,
    builtin: true,
    tier: 'L2',
  },
};

/** 全部内置语言代码。 */
export const BUILTIN_LOCALES = Object.keys(LOCALES);

/** L1 核心语言（CI 强制 100% 覆盖）。 */
export const L1_LOCALES = BUILTIN_LOCALES.filter((code) => LOCALES[code]?.tier === 'L1');

/** 默认界面语言。 */
export const DEFAULT_LOCALE = 'zh-CN';

/**
 * 判断某语言是否可用。
 *
 * @param locale 语言代码
 * @param customLocales 运行时注册的语言表
 */
export function isLocaleSupported(
  locale: string,
  customLocales?: Record<string, unknown>,
): boolean {
  if (locale in LOCALES) return true;
  return !!customLocales && locale in customLocales;
}

/**
 * 获取语言定义（内置或运行时注册的）。
 *
 * 运行时注册的语言没有 AntD locale → 组件文案回退到 en-US。
 */
export function getLocaleDefinition(
  locale: string,
  customLocales?: Record<string, unknown>,
): LocaleDefinition {
  const builtin = LOCALES[locale];
  if (builtin) return builtin;

  // 运行时注册的语言：标签未知则用 locale 本身；AntD locale 回退 en-US
  const label = customLocales?.[locale] ? locale : locale;

  return {
    code: locale,
    label,
    dir: 'ltr',
    antd: LOCALES['en-US']?.antd,
    builtin: false,
  };
}

/**
 * 从浏览器偏好推断初始语言。
 *
 * 匹配顺序：完全匹配 → 主语言匹配（如 zh-CN → zh）→ 默认。
 */
export function detectLocale(acceptLanguage?: string): string {
  if (!acceptLanguage) return DEFAULT_LOCALE;

  const candidates = acceptLanguage
    .split(',')
    .map((part) => part.split(';')[0]?.trim())
    .filter((part): part is string => !!part);

  for (const candidate of candidates) {
    if (candidate in LOCALES) return candidate;

    const primary = candidate.split('-')[0];
    if (primary) {
      const match = BUILTIN_LOCALES.find((code) => code.split('-')[0] === primary);
      if (match) return match;
    }
  }

  return DEFAULT_LOCALE;
}
