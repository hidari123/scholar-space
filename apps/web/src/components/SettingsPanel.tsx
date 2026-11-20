/**
 * 设置面板 —— 语言 / 主题 / 品牌色。
 *
 * ⚠️ **用 `@scholarspace/ui` 的组件** ——
 * 业务代码不直接 import antd（护栏 G7）。
 */

import {
  Button,
  ColorPicker,
  Divider,
  Flex,
  Segmented,
  Select,
  Space,
  Typography,
} from '@scholarspace/ui';
import { useMemo } from 'react';

import { usePreferences } from '../core/preferences';

/** 可选界面语言。 */
const LOCALES = [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'en-US', label: 'English' },
  { value: 'ja-JP', label: '日本語' },
  { value: 'ko-KR', label: '한국어' },
  { value: 'fr-FR', label: 'Français' },
  { value: 'de-DE', label: 'Deutsch' },
  { value: 'es-ES', label: 'Español' },
  { value: 'ar-EG', label: 'العربية (RTL)' },
] as const;

/** 可选主题预设。 */
const PRESETS = [
  { value: 'scholar', label: 'scholar' },
  { value: 'academic', label: 'academic' },
  { value: 'emerald', label: 'emerald' },
  { value: 'graphite', label: 'graphite' },
  { value: 'lab', label: 'lab' },
] as const;

/** 可选颜色模式。 */
const COLOR_MODES = [
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
  { value: 'system', label: '跟随系统' },
] as const;

/**
 * 设置面板。
 */
export function SettingsPanel() {
  const preferences = usePreferences();

  const localeOptions = useMemo(
    () => LOCALES.map((item) => ({ value: item.value, label: item.label })),
    [],
  );

  return (
    <Flex vertical gap="middle" data-testid="settings-panel">
      <div>
        <Typography.Text strong>界面语言</Typography.Text>
        <div>
          <Select
            value={preferences.locale}
            options={localeOptions}
            onChange={(value) => preferences.setLocale(value as typeof preferences.locale)}
            style={{ width: '100%' }}
            aria-label="界面语言"
          />
        </div>
      </div>

      <div>
        <Typography.Text strong>主题风格</Typography.Text>
        <div>
          <Segmented
            options={PRESETS.map((item) => ({
              value: item.value,
              label: item.label,
            }))}
            value={preferences.preset}
            onChange={(value) => preferences.setPreset(value as typeof preferences.preset)}
            aria-label="主题风格"
          />
        </div>
      </div>

      <div>
        <Typography.Text strong>颜色模式</Typography.Text>
        <div>
          <Segmented
            options={COLOR_MODES.map((item) => ({
              value: item.value,
              label: item.label,
            }))}
            value={preferences.colorMode}
            onChange={(value) => preferences.setColorMode(value as typeof preferences.colorMode)}
            aria-label="颜色模式"
          />
        </div>
      </div>

      <div>
        <Typography.Text strong>品牌主色</Typography.Text>
        <Space>
          {/* ⚠️ **没有自定义色时不传 value** ——
              `exactOptionalPropertyTypes` 下，
              传 `undefined` 不等于不传。 */}
          {preferences.brandColor ? (
            <ColorPicker
              value={preferences.brandColor}
              onChangeComplete={(color) => preferences.setBrandColor(color.toHexString())}
              aria-label="品牌主色"
            />
          ) : (
            <ColorPicker
              onChangeComplete={(color) => preferences.setBrandColor(color.toHexString())}
              aria-label="品牌主色"
            />
          )}
          <Button
            size="small"
            onClick={() => preferences.setBrandColor(null)}
            disabled={preferences.brandColor === null}
          >
            恢复默认
          </Button>
        </Space>
      </div>

      <Divider style={{ margin: 0 }} />

      <Button
        danger
        onClick={() => {
          preferences.setLocale('zh-CN');
          preferences.setPreset('scholar');
          preferences.setBrandColor(null);
          preferences.setColorMode('system');
        }}
      >
        全部重置
      </Button>
    </Flex>
  );
}
