# ADR-0007：品牌主题机制

- **状态**：已接受
- **日期**：2026-11-19

---

## 背景

需求：**"风格需要可以配置主题色"**。

多租户场景：不同机构/实验室希望平台呈现自己的品牌色（如某高校的校色）。同时需要明暗模式、紧凑密度。

现有实现的问题（`scholar-club-new/src/constants/theme.ts`）：
1. 主色硬编码 `#611F6A`，无法运行时配置
2. Button 组件级手写 12 个颜色 → 换主色要改 20 处
3. 组件圆角不一致（Button 4 / Input 12 / Table 4 / Card 8）
4. 无暗色模式、无紧凑模式
5. `initIconTheme()` 硬编码双色图标色

---

## 决策

### 1. 五层主题模型

| 层 | 控制什么 | 手段 | 示例 |
|---|---|---|---|
| L0 色板 | 原始色值 | 预设对象 | `{ brand: '#5B5BD6' }` |
| L1 种子令牌 | AntD token | `token.colorPrimary` | 状态色自动派生 |
| L2 主题 | 一整套语义映射 | `theme="paper"` | 5 套学术预设 |
| L3 品牌覆盖 | **只改主色** | `brandColor="#E8590C"` | 租户自定义 ⭐ |
| L4 运行时微调 | 任意数值 | CSS 变量覆盖 | 圆角/字号 |

**核心**：**L3 品牌色是一等公民** —— 换主色不需要做一套新主题。

### 2. BrandConfig 契约

```ts
interface BrandConfig {
  colorPrimary: string;
  colors?: { success?; warning?; error?; info? };
  borderRadius?: number;
  fontFamily?: string;
  density?: 'default' | 'compact';
  mode?: 'light' | 'dark' | 'auto';
  brandName?: string;
  logo?: { light: string; dark: string };
  favicon?: string;
}
```

存为 JSON，遵循 `contracts/theme/brand.schema.json`。

### 3. 五级配置来源

| 级 | 来源 | 场景 | 持久化 |
|---|---|---|---|
| ① | `/api/v1/config/branding` | 机构/租户级 | 服务端 |
| ② | URL 参数 `?brandColor=…` | 预览 / 嵌入 / 分享 | 无 |
| ③ | `localStorage` | 用户个人偏好 | 浏览器 |
| ④ | `VITE_BRAND_*` | 多租户镜像 | 编译时 |
| ⑤ | 内置预设 | 默认 | 代码 |

### 4. 主题模式与品牌色**分离控制**

> **主题模式（明/暗/紧凑）由用户控制；品牌色由机构控制。**

理由：用户切暗色是个人偏好，不该被机构配置覆盖；品牌色是机构标识，不该由用户随意改。

实现为两个独立配置层：
```ts
// 用户偏好（localStorage）
{ mode: 'dark', density: 'compact' }
// 机构品牌（服务端）
{ colorPrimary: '#E8590C', borderRadius: 8, logo: {...} }
```

### 5. 5 套学术预设

`scholar`（学术紫 #611F6A）/ `academic`（学术蓝）/ `emerald`（墨绿）/ `graphite`（石墨）/ `lab`（实验室橙）

### 6. 语义 CSS 变量导出

统一 `--ss-*` 前缀，给非 React 消费方（iframe、邮件模板、PPT 导出、原生 CSS）。

---

## 理由

### 1. 用 AntD 的 Token 体系，而不是自造

AntD 的 `SeedToken → MapToken → AliasToken → ComponentToken` 四层派生已经完整实现：
- `colorPrimary` → `colorPrimary1..10`（色阶）+ `colorPrimaryBg` + `colorPrimaryHover` + `colorPrimaryActive` + `colorPrimaryBorder` + `colorPrimaryText`
- `colorTextBase` → `colorText` / `colorTextSecondary` / `colorTextTertiary` / `colorTextQuaternary` / `colorFill*`
- `colorBgBase` → `colorBgLayout` / `colorBgContainer` / `colorBgElevated` / `colorBorder*`

**自造一套（如 OKLCH 派生）没有额外价值**，且会与 AntD 组件脱节。

### 2. "只改主色"是核心需求

用户的诉求是"可以配置主题色"，不是"可以配一套完整设计系统"。
L3 只暴露 `colorPrimary` 一个字段，其余自动派生 → 满足诉求且零维护。

### 3. 组件级不写颜色（关键）

现状手写 12 个 Button 颜色，换主色要改 20 处还容易漏。
改用 `token.colorPrimary` 后：**改 1 处**。

而且手写组件级颜色会**阻止** AntD 算法正常工作（算法产物被覆盖）。

### 4. 主题模式与品牌色分离

- 暗色是**个人偏好**（有人白天用暗色）
- 品牌色是**机构标识**（不能被用户改掉）

混在一起会产生"机构设了暗色，用户想切亮色但切不了"的矛盾。

### 5. 5 级来源覆盖全部场景

- 编译期多租户镜像（预置品牌）
- 运行时租户配置（机构后台可改）
- 用户偏好（本地）
- URL 覆盖（预览/嵌入）
- 默认（兜底）

---

## 备选方案

### A. 自造 OKLCH 派生算法

**优点**：感知均匀，生成的色阶更"像一套"。

**否决**：
1. AntD 已内置完整派生，自造会与组件脱节
2. 若要自造，就等于放弃 AntD 的 Token 体系（要重写所有组件样式）
3. 收益（色阶更均匀）不足以抵消成本

**保留**：若未来换用非 AntD 的组件库，OKLCH 方案值得重新评估。

### B. CSS 变量硬编码主题（pdf-viewer 现在的做法）

**优点**：简单直接。

**否决**：与 AntD 组件脱节 → AntD 组件不跟随；且要维护两套主题（AntD 一套、变量一套）。

> pdf-viewer 因为"零 UI 库"硬约束必须自造（它的约束是合理的）。但平台级 `ui` 包没有这个约束。

### C. 只支持单一主色（不做预设）

**否决**：预设能提供"开箱即用的合理默认值"，降低首次配置成本。

### D. 允许用户完全自定义所有 token

**否决**：门槛太高，多数用户只需要改主色。高级用户可用 CSS 变量覆盖（L4）。

---

## 后果

### 正面
- 换主色 = 改 1 处
- 换品牌色 = 传 1 个参数
- 明暗/紧凑全站自动生效
- 圆角统一（消除现有 4/12/4/8 的不一致）
- 品牌配置是数据（可存、可下发、可版本化）

### 负面
- **不能完全控制 AntD 组件的内部样式**（只到 token 层）
- 需要维护"用户偏好 vs 机构品牌"两层配置的合并逻辑
- CSS 变量导出需要维护映射表

### 风险与缓解

| 风险 | 缓解 |
|---|---|
| 机构品牌色对比度不足 | `brand.schema.json` 校验色值格式；`theme preview` 提供对比度检查 |
| 用户偏好与机构品牌冲突 | 明确分离规则（模式=用户，色=机构）|
| AntD 暗色漏变量 | **实测教训**（pdf-viewer README 记录过）→ M0 用 `theme preview` 逐套主题截图核对 |
| CSS 变量与 AntD 变量脱节 | 变量表由 `packages/ui` 单一维护；CI 校验映射完整性 |
