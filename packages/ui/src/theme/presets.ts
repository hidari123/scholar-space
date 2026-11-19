/**
 * 品牌预设 —— 5 套学术风格。
 *
 * 数据来源：packages/conventions/theme/presets.json
 * labelKey 走 i18n，不硬编码文案。
 */

import type { BrandConfig } from './brand';

/** 预设定义。 */
export interface BrandPreset {
  /** 预设 ID。 */
  readonly id: string;
  /** 预设名（i18n key）。 */
  readonly labelKey: string;
  /** 预设描述（i18n key）。 */
  readonly descriptionKey: string;
  /** 品牌配置片段。 */
  readonly brand: Partial<BrandConfig>;
}

/** 5 套学术风格预设。 */
export const BRAND_PRESETS: Record<string, BrandPreset> = {
  scholar: {
    id: 'scholar',
    labelKey: 'theme.preset.scholar.label',
    descriptionKey: 'theme.preset.scholar.description',
    brand: {
      colorPrimary: '#611F6A',
      colors: { info: '#6389B5' },
    },
  },
  academic: {
    id: 'academic',
    labelKey: 'theme.preset.academic.label',
    descriptionKey: 'theme.preset.academic.description',
    brand: {
      colorPrimary: '#1D4ED8',
      colors: { info: '#0EA5E9' },
    },
  },
  emerald: {
    id: 'emerald',
    labelKey: 'theme.preset.emerald.label',
    descriptionKey: 'theme.preset.emerald.description',
    brand: {
      colorPrimary: '#047857',
      colors: { info: '#10B981' },
    },
  },
  graphite: {
    id: 'graphite',
    labelKey: 'theme.preset.graphite.label',
    descriptionKey: 'theme.preset.graphite.description',
    brand: {
      colorPrimary: '#334155',
      colors: { info: '#64748B' },
    },
  },
  lab: {
    id: 'lab',
    labelKey: 'theme.preset.lab.label',
    descriptionKey: 'theme.preset.lab.description',
    brand: {
      colorPrimary: '#EA580C',
      colors: { info: '#F59E0B' },
    },
  },
};

/** 默认预设 ID。 */
export const DEFAULT_PRESET_ID = 'scholar';

/** 全部预设 ID。 */
export const PRESET_IDS = Object.keys(BRAND_PRESETS);
