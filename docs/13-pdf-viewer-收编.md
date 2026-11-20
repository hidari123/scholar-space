# M7.3 —— pdf-viewer 收编指南

> ⚠️ **`scholar-pdf-viewer` 是冻结仓** —— 本文档只给「改法」，
> **不要由我在那个仓里动手**。改完由你决定什么时候合。

## 目标

把 `scholar-pdf-viewer` 变成 `@scholarspace/pdf-viewer`，
跟平台的主题、i18n、护栏体系对齐。

| 维度 | 现状 | 目标 |
|---|---|---|
| **包名** | `@scholar-club/pdf-viewer` | `@scholarspace/pdf-viewer` |
| **CSS 变量前缀** | `scpdf-` | `ss-` |
| **主题** | 自造 CSS 变量 | 并入 `packages/ui` 品牌令牌 |
| **i18n** | 自带 `src/i18n/messages.ts` | 接入平台 Provider |
| **core 零 React** | ✅ 保持 | ✅ 保持 |
| **License** | MIT | MIT（不变） |

---

## 一、包名

```diff
- "name": "@scholar-club/pdf-viewer",
+ "name": "@scholarspace/pdf-viewer",
```

⚠️ **连带要改的**：
- `package.json` 的 `exports`（子路径不变，只是包名变）
- `scripts/build.mjs` 里的产物路径
- `demo/package.json` 的依赖引用
- `size-limit.json` / `.attw.json` 的包名

⚠️ **GitHub Packages 私有源**：
```json
"publishConfig": {
  "access": "restricted",
  "registry": "https://npm.pkg.github.com"
}
```

---

## 二、CSS 变量前缀 `scpdf-` → `ss-`

⚠️ **508 处引用** —— 用脚本批量改，别手改。

```bash
# ⚠️ 先看清楚要改什么
grep -rn "scpdf-" src/ | wc -l

# 批量替换
grep -rl "scpdf-" src/ | xargs sed -i 's/scpdf-/ss-/g'
```

⚠️ **改完要跑测试** —— `messages.test.ts` 之外还有 CSS 相关的快照。

⚠️ **别忘了 `themes.css` 和 `viewer.css`** ——
变量名和引用是两处，都要改。

---

## 三、主题并入 `packages/ui`

### 现状

pdf-viewer 自己造 CSS 变量（因为它「零 UI 库」是硬约束）。

⚠️ **这个约束本身是合理的** ——
它保证这个包能被任何项目用。

### 做法

⚠️ **不要让 pdf-viewer 依赖 `packages/ui`** ——
那会让「零 UI 依赖」的包反过来依赖 UI 包，
而且 `packages/ui` 依赖 antd，会把 antd 拖进来。

**正确做法**：**由消费方注入变量**。

```css
/* apps/web/src/styles/pdf-viewer.css */

/* ⚠️ **先应用平台品牌令牌** */
@import '@scholarspace/ui/styles.css';

/* ⚠️ **再把平台令牌映射到 pdf-viewer 的变量名** */
:root {
  --ss-color-primary: var(--ant-color-primary, #611f6a);
  --ss-color-text: var(--ant-color-text, #1f1f1f);
  --ss-color-bg: var(--ant-color-bg-container, #ffffff);
  --ss-color-border: var(--ant-color-border, #d9d9d9);
  --ss-font-family: var(--ant-font-family, system-ui, sans-serif);
}
```

⚠️ **这样 pdf-viewer 仍然是零 UI 依赖** ——
它只认 `ss-*` 变量，不关心谁注入的。

---

## 四、i18n 接入平台 Provider

### 现状

pdf-viewer 自带 `src/i18n/messages.ts`。

⚠️ **平台的 `resolveMessage()` 就是从它借鉴的** ——
5 级回退（overrides → locales[locale] → BUILTIN[locale] → BUILTIN['en-US'] → key）。

### 做法

⚠️ **两条路**：

**A. 保留自带 i18n，只对齐 key 命名**（改动小）

```ts
// ⚠️ **平台约定：namespace.key**
// 旧的：`"viewer.toolbar.zoomIn"`
// 新的：`"pdfViewer.toolbar.zoomIn"`
```

⚠️ **G13 护栏会检查 key 命名** ——
改完要过护栏。

**B. 完全接入平台 Provider**（推荐，但工作量大）

```tsx
import { ScholarSpaceProvider } from '@scholarspace/ui';

<ScholarSpaceProvider locale={locale} namespaces={{ pdfViewer: pdfViewerMessages }}>
  <PdfViewer />
</ScholarSpaceProvider>
```

⚠️ **B 的前提**：
- pdf-viewer 的 `resolveMessage()` 换成平台的
- 组件里 `useTranslate()` 换成平台的 `useTranslate()`

⚠️ **core 层要保持零 React** ——
i18n 的 core 部分（`resolveMessage`）要抽到不依赖 React 的地方。

---

## 五、core 零 React 保持不变

⚠️ **这是 pdf-viewer 的硬约束** —— G3 护栏会检查。

```bash
# ⚠️ **验证**
grep -R "from 'react'" src/core/ && echo "❌ core 层有 React" || echo "✅ core 层干净"
```

⚠️ **收编过程中最容易破坏这条** ——
比如把 i18n 的 Provider 逻辑塞进 core。

---

## 六、收编后的验收

| 检查项 | 命令 / 方式 |
|---|---|
| **包名** | `package.json` 的 `name` 是 `@scholarspace/pdf-viewer` |
| **CSS 前缀** | `grep -rn "scpdf-" src/ \| wc -l` → 0 |
| **core 零 React** | `grep -R "from 'react'" src/core/` → 空 |
| **测试通过** | `pnpm test` 全绿 |
| **构建通过** | `pnpm build` 无错 |
| **体积** | `pnpm size` ≤ 20 kB gzip |
| **发布检查** | `pnpm release:check`（publint + attw） |
| **License** | 仍是 MIT |

---

## 七、顺序建议

⚠️ **先改名，后改内容** ——
改名会让所有 import 断掉，一次改完容易混乱。

1. **改名**（包名 + 所有引用）
2. **跑测试** —— 确认只是改名没别的
3. **CSS 前缀批量替换** —— 跑测试
4. **主题映射**（在消费方做，pdf-viewer 本身不改）
5. **i18n 对齐**（先 A 后 B，看时间）
6. **发布到 GitHub Packages**
7. **主仓 `apps/web` 装上并验证**

⚠️ **每步一个 commit** —— 出问题好回滚。
