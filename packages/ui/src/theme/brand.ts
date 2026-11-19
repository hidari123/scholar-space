/**
 * 品牌配置 —— 主题体系的第一层。
 *
 * 遵循 ADR-0007「品牌主题机制」：
 *   改 1 处 colorPrimary → 全站生效。
 *   组件级 theme 只调结构（高度/圆角），绝不调颜色。
 */

/**
 * 品牌配置。
 *
 * 契约来源：packages/conventions/theme/brand.schema.json
 *
 * ⚠️ 所有可选属性显式声明 `| undefined` —— 因为 tsconfig 开启了
 *    `exactOptionalPropertyTypes`，可选属性不能隐式接受 undefined。
 */
export interface BrandConfig {
  /** 品牌主色 → AntD `token.colorPrimary`。改这一个值全站生效。 */
  colorPrimary: string;

  /** 语义色覆盖。不传则用 AntD 默认派生。 */
  colors?:
    | {
        success?: string | undefined;
        warning?: string | undefined;
        error?: string | undefined;
        info?: string | undefined;
      }
    | undefined;

  /** 圆角基准（px）→ AntD `token.borderRadius` + 组件级结构。 */
  borderRadius?: number | undefined;

  /** 字体族 → AntD `token.fontFamily`。 */
  fontFamily?: string | undefined;

  /** 布局密度 → 决定 algorithm 组合。 */
  density?: 'default' | 'compact' | undefined;

  /** 主题模式。`auto` 跟随系统。 */
  mode?: 'light' | 'dark' | 'auto' | undefined;

  /** 品牌展示名。 */
  brandName?: string | undefined;

  /** Logo（明/暗两套）。 */
  logo?:
    | {
        light: string;
        dark: string;
      }
    | undefined;

  /** 站点图标。 */
  favicon?: string | undefined;
}

/** 用户偏好 —— 与品牌配置分离（模式/密度由用户控制，品牌色由机构控制）。 */
export interface UserPreferences {
  mode?: 'light' | 'dark' | 'auto' | undefined;
  density?: 'default' | 'compact' | undefined;
  locale?: string | undefined;
}

/** 默认品牌配置。 */
export const DEFAULT_BRAND: BrandConfig = {
  colorPrimary: '#611F6A',
  borderRadius: 6,
  density: 'default',
  mode: 'auto',
};

/**
 * 合并品牌配置 —— 按优先级从低到高。
 *
 * 优先级（高 → 低）：
 *   ① /api/v1/config/branding   机构/租户级
 *   ② URL 参数                   预览/嵌入
 *   ③ localStorage               用户偏好
 *   ④ VITE_BRAND_*               构建期
 *   ⑤ 内置预设
 *
 * ⚠️ 注意：`mode` 与 `density` 来自用户偏好，应覆盖品牌配置。
 *    实现见 `mergeBrand` 的 `preferences` 参数。
 */
export function mergeBrand(
  ...layers: Array<BrandConfig | Partial<BrandConfig> | undefined | null>
): BrandConfig {
  const merged: BrandConfig = { ...DEFAULT_BRAND };

  for (const layer of layers) {
    if (!layer) continue;

    assignScalarFields(merged, layer);
    assignColors(merged, layer);
  }

  return merged;
}

/** 拷贝标量字段（undefined 不覆盖）。 */
function assignScalarFields(target: BrandConfig, source: Partial<BrandConfig>): void {
  if (source.colorPrimary !== undefined) target.colorPrimary = source.colorPrimary;
  if (source.borderRadius !== undefined) target.borderRadius = source.borderRadius;
  if (source.fontFamily !== undefined) target.fontFamily = source.fontFamily;
  if (source.density !== undefined) target.density = source.density;
  if (source.mode !== undefined) target.mode = source.mode;
  if (source.brandName !== undefined) target.brandName = source.brandName;
  if (source.logo !== undefined) target.logo = source.logo;
  if (source.favicon !== undefined) target.favicon = source.favicon;
}

/** 浅合并语义色。 */
function assignColors(target: BrandConfig, source: Partial<BrandConfig>): void {
  if (!source.colors) return;
  target.colors = { ...target.colors, ...source.colors };
}

/**
 * 合并用户偏好到品牌配置。
 *
 * 用户切暗色是个人偏好，不该被机构配置覆盖。
 */
export function applyPreferences(
  brand: BrandConfig,
  preferences: UserPreferences | undefined,
): BrandConfig {
  if (!preferences) return brand;

  return {
    ...brand,
    mode: preferences.mode ?? brand.mode,
    density: preferences.density ?? brand.density,
  };
}

/**
 * 从 URL 查询参数读取品牌覆盖。
 *
 * 例：`?brandColor=%23E8590C&theme=dark`
 */
export function brandFromSearchParams(search: string): Partial<BrandConfig> {
  const params = new URLSearchParams(search);
  const result: Partial<BrandConfig> = {};

  const color = params.get('brandColor');
  if (color && /^#[0-9a-fA-F]{6}$/.test(color)) {
    result.colorPrimary = color;
  }

  const mode = params.get('theme');
  if (mode === 'light' || mode === 'dark' || mode === 'auto') {
    result.mode = mode;
  }

  const density = params.get('density');
  if (density === 'default' || density === 'compact') {
    result.density = density;
  }

  const radius = params.get('radius');
  if (radius) {
    const parsed = Number.parseInt(radius, 10);
    if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 24) {
      result.borderRadius = parsed;
    }
  }

  return result;
}
