# @scholarspace/ui

> scholarspace 共享设计系统 —— **AntD v5 基座 + 自研 15%**。
>
> ⚠️ **铁律**：这是**唯一**允许 `import from 'antd'` 的地方。
> 业务代码只能 `import { X } from '@scholarspace/ui'`。
> 见 [ADR-0002](../../docs/adr/0002-antd-foundation.md)。

---

## 职责边界

| 层                    | 职责                                     | 占比     |
| --------------------- | ---------------------------------------- | -------- |
| **theme**             | 品牌主题（主色/暗色/紧凑/预设/租户配置） | 自研     |
| **i18n**              | 多语言（12 种界面语言 + 5 级回退链）     | 自研     |
| **components**        | 业务无关复合组件（包装 AntD）            | 自研     |
| **layout / patterns** | 页面骨架与页面模式                       | 自研     |
| **底层组件**          | Button/Table/Modal/Form…                 | **AntD** |

**为什么不全自研**：AntD 有 70+ 组件，自研到"可用"约需 **500-600 人天**
（无障碍 150+、虚拟滚动 60+、70 语言 locale 70、焦点管理 40…）。
团队 2 人 / 总工期 24 周 —— 自研组件库会吃掉 1/3 预算且**零业务价值**。

---

## 快速开始

```tsx
import { ScholarSpaceProvider } from '@scholarspace/ui';

function App() {
  return (
    <ScholarSpaceProvider
      brand={{ colorPrimary: '#611F6A', borderRadius: 6, mode: 'auto' }}
      locale="zh-CN"
    >
      <RouterProvider router={router} />
    </ScholarSpaceProvider>
  );
}
```

**组件用法**（必须经由此包）：

```tsx
import { Button, PageHeader } from '@scholarspace/ui';
// ❌ import { Button } from 'antd';   —— 违反铁律，CI 报错
```

---

## 主题体系

### 五层模型

| 层            | 控制什么       | 手段                   | 示例                   |
| ------------- | -------------- | ---------------------- | ---------------------- |
| L0 色板       | 原始色值       | 预设对象               | `{ brand: '#5B5BD6' }` |
| L1 种子令牌   | AntD token     | `token.colorPrimary`   | 状态色自动派生         |
| L2 主题       | 一整套语义映射 | `theme="paper"`        | 5 套学术预设           |
| L3 品牌覆盖   | **只改主色**   | `brandColor="#E8590C"` | 租户自定义 ⭐          |
| L4 运行时微调 | 任意数值       | CSS 变量覆盖           | 圆角/字号              |

**核心**：改 1 处 `colorPrimary` → 全站生效。

### 组件级禁写颜色

```ts
// ✅ 只调结构
components: {
  Button: { controlHeight: 36, borderRadius: radius },
}

// ❌ 手写颜色会阻止 AntD 算法工作，换主色时不会变
components: {
  Button: { colorPrimary: '#611F6A', colorPrimaryHover: '#723678' },
}
```
> CI 护栏 **G11** 会拦截组件级硬编码颜色。

### 5 套学术预设

| ID         | 名称     | 主色      |
| ---------- | -------- | --------- |
| `scholar`  | 学术紫   | `#611F6A` |
| `academic` | 学术蓝   | `#1D4ED8` |
| `emerald`  | 墨绿     | `#047857` |
| `graphite` | 石墨     | `#334155` |
| `lab`      | 实验室橙 | `#EA580C` |

### 品牌配置 5 级来源

```
① /api/v1/config/branding   机构/租户级（服务端）
② ?brandColor=...           URL 覆盖（预览/嵌入）
③ localStorage              用户偏好
④ VITE_BRAND_*              构建期
⑤ 内置预设                   默认
```

**主题模式（明/暗/紧凑）由用户控制，品牌色由机构控制** —— 二者分离。

---

## 多语言体系

### 12 种内置界面语言

`zh-CN` `en-US` `zh-TW` `zh-HK` `ja-JP` `ko-KR` `fr-FR` `de-DE` `es-ES` `pt-BR` `ru-RU` `ar-EG`(RTL)

- **L1**（`zh-CN` / `en-US`）：100% 覆盖，CI 强制
- **L2**（其余 10 种）：目标 80%
- **L3 自定义**：任意 locale，运行时注册

### 5 级回退链

```
① overrides[key]              运行时覆盖
② locales[locale][key]        运行时注册（自定义语言）
③ BUILTIN[locale][key]        平台内置
④ BUILTIN['en-US'][key]       英文兜底
⑤ key 本身                    永不 undefined
```

**第 4 级兜底英文而非中文**：未配全的语言用中文会「中英混杂」，用英文至少语言一致。

### 自定义语言

```tsx
<I18nProvider locale="tlh" messages={{ tlh: { 'common.action.confirm': 'yImej' } }}>
```
缺失的 key 自动回退到 en-US。

### 界面语言 ≠ 内容语言

界面语言（UI locale）与内容语言（论文摘要/PPT 文字的语言）**完全解耦**。
用户用中文界面，但可以生成英文 PPT。

### AntD locale 必须联动

```tsx
// ScholarSpaceProvider 已处理：同一个 locale 同时喂给
//   ConfigProvider（组件文案）与 I18nProvider（业务文案）
// 否则会出现「分页是中文、按钮是英文」
```

---

## 用法

### 文案

```tsx
import { useTranslate } from '@scholarspace/ui';

function Component() {
  const t = useTranslate();
  return <button>{t('common.action.confirm')}</button>;
}
```

### 带变量

```tsx
t('common.label.total', { count: 42 }); // → "共 42 条"
```

### 自定义语言注册

```tsx
<ScholarSpaceProvider locale="tlh" messages={{ tlh: { 'common.action.confirm': 'yImej' } }} />;
```

---

## CSS 变量

给非 React 消费方（iframe / 邮件模板 / PPT 导出 / 原生 CSS）：

```css
:root {
  --ss-color-primary: var(--ant-color-primary);
  --ss-color-bg: var(--ant-color-bg-layout);
  --ss-color-surface: var(--ant-color-bg-container);
  --ss-color-border: var(--ant-color-border);
  --ss-color-text: var(--ant-color-text);
  --ss-radius: var(--ant-border-radius);
  /* … 见 src/styles/tokens.css */
}
```

**命名规范**：`--ss-` 前缀（scholarspace）。不用包级前缀（`scpdf-` 等）。

---

## 目录结构

```
src/
├── theme/
│   ├── brand.ts          BrandConfig + mergeBrand + 5级来源解析
│   ├── presets.ts        5 套学术预设
│   ├── provider.tsx      ScholarThemeProvider + buildAntdTheme
│   └── brand.test.ts     26 个测试
├── i18n/
│   ├── locales.ts        12 种语言注册表 + 探测
│   ├── resolver.ts       5 级回退 + 占位符 + 覆盖率 + 一致性校验
│   ├── provider.tsx      I18nProvider + useI18n
│   ├── messages/         内置文案（common/{zh-CN,en-US}）
│   └── resolver.test.ts  18 个测试
├── styles/tokens.css     --ss-* 语义变量
├── provider.tsx          ScholarSpaceProvider（主题 + i18n 组合）
└── index.ts              唯一公开入口
```

---

## 质量门禁

```bash
pnpm run typecheck    # tsc --noEmit（strict + exactOptionalPropertyTypes）
pnpm run lint         # biome check
pnpm run test         # vitest run
pnpm run build        # tsup（esm + dts）
```

当前状态：**44 tests passed** ✅

---

## 关键规则速查

| 规则                 | 说明                                                                       |
| -------------------- | -------------------------------------------------------------------------- |
| **唯一 antd 入口**   | 业务代码禁止直接 import antd（CI G7）                                      |
| **组件级禁写颜色**   | 只调结构（高度/圆角/间距）（CI G11）                                       |
| **`\| undefined`**   | `exactOptionalPropertyTypes` 要求可选属性显式声明（见 05-代码规范.md 2.5） |
| **文案 key 规范**    | `{domain}.{section}.{element}[.{state}]`（CI G13）                         |
| **占位符跨语言一致** | 同一 key 的占位符集合必须相同（CI G15）                                    |
| **CSS 变量前缀**     | `--ss-`                                                                    |
| **core 零 React**    | 本包无 core 层，但业务包有（CI G3-1）                                      |

---

## 相关文档

- [主题与设计系统](../../docs/04-主题与设计系统.md)
- [语言体系](../../docs/03-语言体系.md)
- [代码规范](../../docs/05-代码规范.md)
- [架构护栏](../../docs/06-架构护栏.md)
