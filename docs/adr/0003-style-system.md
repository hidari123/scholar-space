# ADR-0003：样式系统 —— Tailwind(布局) + AntD(组件)，移除 styled-components

- **状态**：已接受
- **日期**：2026-11-19

---

## 背景

现有前端三套样式系统并存：

| 系统 | 使用情况 | 问题 |
|---|---|---|
| **AntD** | 164 个文件 | ✅ 保留 |
| **Tailwind** | 大量 `className="flex items-center..."` | 也在用来定颜色/字号 |
| **styled-components** | 39 处 | 与 AntD 的 CSS-in-JS 冲突；运行时开销；主题不统一 |
| **MUI** | 已废弃（`Container/Title.tsx:2` 留有"替换 MUI 的"注释）| 残留 |

具体问题：
1. 主题不统一 —— AntD 主题与 Tailwind 硬编码色值各行其是
2. 换主色/切暗色时，两套系统都要改
3. styled-components 的样式无法参与 AntD 的 token 体系

同时，AntD 的主题配置本身有重复劳动（`constants/theme.ts`）：
- Button 手写 12 个颜色（`colorPrimary` / `Hover` / `Active` / `Border` / `colorText` / `colorTextHover` …）
- 组件圆角不一致：Button 4 / Input 12 / Table 4 / Card 8

---

## 决策

### 1. 三者职责严格分离

| 系统 | 职责 | 禁止 |
|---|---|---|
| **AntD v5** | 所有组件（Button/Table/Modal/Form/…）| — |
| **Tailwind v4** | **仅布局与间距**（flex/grid/gap/padding/margin/响应式/定位偏移）| ❌ 颜色、字号、字重、阴影、圆角 |
| **CSS 变量** | 跨系统传值 + 非 React 消费方 | ❌ 硬编码颜色 |

### 2. 移除 styled-components（全部 39 处）

替代方案：

| 原用法 | 替代 |
|---|---|
| `styled.div\`...\`` 布局 | Tailwind 类 |
| `styled.div\`color: ...\`` | `style={{ color: 'var(--ss-color-xxx)' }}` |
| `keyframes` 动画 | Tailwind `animate-*` 或 CSS 文件 |
| `createGlobalStyle` | `styles/globals.css` |

### 3. AntD 主题：只设种子令牌，组件级不写颜色

```ts
token: {
  colorPrimary: brand.colorPrimary,   // ✅ 一处
  // AntD 自动派生 primary1..10 / bg / border / hover / active / text
}
components: {
  Button: { controlHeight: 36, borderRadius: brand.borderRadius },  // ✅ 只调结构
}
```

### 4. 统一圆角与尺寸基准

```ts
token: {
  borderRadius: brand.borderRadius ?? 6,   // 统一基准
  sizeUnit: 4, sizeStep: 4, fontSize: 14,
}
components: {
  Button: { borderRadius: brand.borderRadius ?? 6, controlHeight: 36 },
  Input:  { borderRadius: brand.borderRadius ?? 6, controlHeight: 36 },
  Card:   { borderRadiusLG: 12 },
}
```

### 5. CI 护栏（G8 G9 G10 G11）

| 护栏 | 内容 |
|---|---|
| G8 | 禁止 `styled-components` |
| G9 | Tailwind 类白名单（禁颜色/字号/字重/阴影/圆角）|
| G10 | 禁硬编码颜色字面量（除 tokens/presets）|
| G11 | 组件级 theme 不得含颜色 |

---

## 理由

### 1. 三套系统 = 三倍维护 + 主题分裂

styled-components 的样式不参与 AntD 的 token 体系 → 切暗色时它是"另一套"。

Tailwind 硬编码颜色（`text-blue-500`）同样绕过 AntD 主题 → 换品牌色时它是"另一套"。

**统一后**：改一处（`token.colorPrimary`）→ 全站生效。

### 2. Tailwind 保留但降级，不是移除

Tailwind 在**布局**上确实高效（`flex items-center gap-2` 比 CSS 清晰得多）。移除它会让布局代码变得冗长。

降级为"布局工具"是最佳平衡：
- 布局：Tailwind（高效）
- 视觉：AntD token（统一，可换肤）

### 3. AntD 的组件级 token 不该写颜色

AntD 的设计是：种子令牌 → 算法派生 → 语义别名 → 组件令牌。
**组件令牌的设计意图是调整"结构差异"**（如 Table 的紧凑内边距），而不是重新指定颜色。

手写 `Button.colorPrimaryHover` 反而**阻止**了 AntD 的算法正常工作 —— 换主色时这个硬编码值不会变。

### 4. 移除 styled-components 还消除了运行时开销

CSS-in-JS 运行时 + 39 处 styled 组件 → 与 AntD 的 cssinjs 双份运行时。移除后只剩一套。

### 5. 护栏是必要的

规范靠自觉必然腐化（现有代码就是证据）。CI 门禁让"三套系统"不可能再出现。

---

## 备选方案

### A. 全部移除 styled-components + Tailwind，只用 AntD + CSS Module

**否决**：布局代码会非常冗长（AntD 的 `Row`/`Col`/`Space` 覆盖不了所有布局需求）。

### B. 只用 styled-components + AntD（去 Tailwind）

**否决**：styled-components 与 AntD 的 cssinjs 双份运行时；主题体系仍然分裂。

### C. 只用 Tailwind + shadcn（去 AntD）

**否决**：见 [ADR-0002](./0002-antd-foundation.md)。

### D. 保留三套，只加规范

**否决**：不解决根本问题。规范会被绕过。

---

## 后果

### 正面
- **改一处主色，全站生效**
- 暗色/紧凑模式自动全站生效
- 消除双份 CSS-in-JS 运行时
- 减少约 39 处 styled 组件
- 视觉一致性有 CI 保证

### 负面
- **Tailwind 不能用来快速定颜色/字号** —— 开发者会觉得"不方便"（初期）
- 需要迁移 39 处 styled-components
- Tailwind v4 语法与 v3 差异（迁移时注意）
- 某些精细样式需要写 CSS 文件（而不是内联类）

### 风险与缓解

| 风险 | 缓解 |
|---|---|
| 开发者绕过护栏用 Tailwind 颜色类 | CI 门禁（G9）；code review 把关；提供 `ss-*` CSS 变量的 Tailwind 映射作为合法替代 |
| 迁移 39 处 styled 引入回归 | 逐文件替换 + 视觉回归测试（Playwright 截图对比）|
| Tailwind v4 迁移踩坑 | 规范锁定 v4 写法；`@theme` 注入设计令牌 |
| 精细样式无处安放 | 允许 `styles/*.css`（用 CSS 变量，不硬编码颜色）|
