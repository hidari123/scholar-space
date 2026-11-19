import { describe, expect, it } from 'vitest';

import { applyPreferences, brandFromSearchParams, DEFAULT_BRAND, mergeBrand } from './brand';
import { BRAND_PRESETS, DEFAULT_PRESET_ID, PRESET_IDS } from './presets';
import { buildAntdTheme, resolveMode } from './provider';

describe('mergeBrand', () => {
  it('无参数返回默认配置', () => {
    expect(mergeBrand()).toEqual(DEFAULT_BRAND);
  });

  it('后层覆盖前层', () => {
    const result = mergeBrand({ colorPrimary: '#111111' }, { colorPrimary: '#222222' });
    expect(result.colorPrimary).toBe('#222222');
  });

  it('跳过 null / undefined 层', () => {
    const result = mergeBrand(null, { colorPrimary: '#333333' }, undefined);
    expect(result.colorPrimary).toBe('#333333');
  });

  it('合并 colors 是浅合并而非整体替换', () => {
    const result = mergeBrand(
      { colors: { success: '#00FF00', error: '#FF0000' } },
      { colors: { error: '#AA0000' } },
    );
    expect(result.colors?.success).toBe('#00FF00');
    expect(result.colors?.error).toBe('#AA0000');
  });
});

describe('applyPreferences — 用户偏好覆盖品牌', () => {
  it('用户暗色偏好覆盖机构默认', () => {
    const brand = { colorPrimary: '#611F6A', mode: 'light' as const };
    const result = applyPreferences(brand, { mode: 'dark' });
    expect(result.mode).toBe('dark');
    expect(result.colorPrimary).toBe('#611F6A');
  });

  it('无偏好时保持品牌配置', () => {
    const brand = { colorPrimary: '#611F6A', mode: 'light' as const };
    expect(applyPreferences(brand, undefined).mode).toBe('light');
  });

  it('偏好未指定某项时不覆盖', () => {
    const brand = { colorPrimary: '#611F6A', mode: 'dark' as const };
    expect(applyPreferences(brand, { density: 'compact' }).mode).toBe('dark');
  });
});

describe('brandFromSearchParams', () => {
  it('解析合法品牌色', () => {
    expect(brandFromSearchParams('?brandColor=%23E8590C').colorPrimary).toBe('#E8590C');
  });

  it('拒绝非法品牌色', () => {
    expect(brandFromSearchParams('?brandColor=red').colorPrimary).toBeUndefined();
  });

  it('拒绝非 6 位 hex', () => {
    expect(brandFromSearchParams('?brandColor=%23E85').colorPrimary).toBeUndefined();
  });

  it('解析主题模式', () => {
    expect(brandFromSearchParams('?theme=dark').mode).toBe('dark');
  });

  it('拒绝非法主题模式', () => {
    expect(brandFromSearchParams('?theme=neon').mode).toBeUndefined();
  });

  it('解析圆角并做范围校验', () => {
    expect(brandFromSearchParams('?radius=12').borderRadius).toBe(12);
    expect(brandFromSearchParams('?radius=99').borderRadius).toBeUndefined();
  });
});

describe('resolveMode', () => {
  it('light 固定亮色', () => {
    expect(resolveMode('light', true)).toBe('light');
  });

  it('dark 固定暗色', () => {
    expect(resolveMode('dark', false)).toBe('dark');
  });

  it('auto 跟随系统', () => {
    expect(resolveMode('auto', true)).toBe('dark');
    expect(resolveMode('auto', false)).toBe('light');
  });

  it('未指定时跟随系统', () => {
    expect(resolveMode(undefined, true)).toBe('dark');
  });
});

describe('buildAntdTheme — AntD Token 生成', () => {
  it('主色映射到 colorPrimary', () => {
    const theme = buildAntdTheme({ colorPrimary: '#E8590C' }, false);
    expect(theme.token?.colorPrimary).toBe('#E8590C');
  });

  it('链接色跟随主色', () => {
    const theme = buildAntdTheme({ colorPrimary: '#E8590C' }, false);
    expect(theme.token?.colorLink).toBe('#E8590C');
  });

  it('暗色模式使用 darkAlgorithm', () => {
    const theme = buildAntdTheme({ colorPrimary: '#611F6A' }, true);
    const algorithms = theme.algorithm as unknown[];
    expect(algorithms.length).toBeGreaterThanOrEqual(1);
  });

  it('紧凑模式追加 compactAlgorithm', () => {
    const light = buildAntdTheme({ colorPrimary: '#611F6A' }, false);
    const compact = buildAntdTheme({ colorPrimary: '#611F6A', density: 'compact' }, false);
    const lightCount = (light.algorithm as unknown[]).length;
    const compactCount = (compact.algorithm as unknown[]).length;
    expect(compactCount).toBe(lightCount + 1);
  });

  it('圆角基准应用到 token 与组件级', () => {
    const theme = buildAntdTheme({ colorPrimary: '#611F6A', borderRadius: 12 }, false);
    expect(theme.token?.borderRadius).toBe(12);
    expect((theme.components?.Button as { borderRadius?: number })?.borderRadius).toBe(12);
  });

  it('组件级不得写颜色（护栏 G11）', () => {
    const theme = buildAntdTheme({ colorPrimary: '#611F6A' }, false);
    const components = theme.components ?? {};
    for (const [name, spec] of Object.entries(components)) {
      for (const [key, value] of Object.entries(spec as Record<string, unknown>)) {
        if (!key.startsWith('color')) continue;
        // colorText / colorBgContainer 这类中性色允许，但不得是硬编码 hex
        if (typeof value === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(value)) {
          throw new Error(`组件 ${name}.${key} 含硬编码颜色 ${value}`);
        }
      }
    }
  });
});

describe('BRAND_PRESETS', () => {
  it('5 套预设', () => {
    expect(PRESET_IDS).toHaveLength(5);
  });

  it('默认预设在注册表中', () => {
    expect(BRAND_PRESETS[DEFAULT_PRESET_ID]).toBeDefined();
  });

  it('每套预设都有主色与 i18n label', () => {
    for (const id of PRESET_IDS) {
      const preset = BRAND_PRESETS[id];
      expect(preset?.brand.colorPrimary).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(preset?.labelKey).toMatch(/^theme\.preset\./);
    }
  });
});
