# @scholarspace/example-package

> 示例 TS 子项目 —— **验证 `packages/conventions/` 是否真正可用**。

---

## 为什么有这个示例

与 Python 示例同源（见 [../python-service/README.md](../python-service/README.md)）：

- `cli`（脚手架）依赖 `conventions`（规范基座）
- `conventions` 需要真实包来验证

**这个示例暴露了 4 个 conventions 缺陷**（见文末），全部已修。

---

## 验证结果（全部通过 ✅）

| # | 验证项 | 命令 | 结果 |
|---|---|---|---|
| 1 | tsconfig 继承 conventions | `tsc --noEmit` 走 base 的 `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` | ✅ |
| 2 | biome 继承 conventions | `biome check .` | ✅ Checked 17 files, no fixes |
| 3 | biome formatter 生效 | 自动格式化（tabs for JSON / 2 spaces for TS）| ✅ |
| 4 | vitest 测试 | `vitest run` | ✅ 4 passed |
| 5 | tsup 构建（含 dts）| `tsup` | ✅ Build success |
| 6 | 三层分离 | core / components / hooks | ✅ |

---

## 目录结构（= 脚手架 `ts-package` 模板的形状）

```
src/
├── core/                 ← 纯逻辑，零 React、零 DOM（G3-1 强制）
│   ├── types.ts          Example / CreateExampleInput
│   ├── errors.ts         AppError + ErrorCode（与后端错误码对齐）
│   ├── create-example.ts 领域逻辑
│   ├── create-example.test.ts
│   └── index.ts
├── components/           ← React 组件
│   ├── Example.tsx       ExampleCard（动作注入模式）
│   └── index.ts
├── hooks/                ← React hooks
│   ├── useExample.ts
│   └── index.ts
└── index.ts              ← 唯一公开入口
```

**配置文件**：

```
package.json      独立包配置（exports 多入口、peerDeps、scripts）
tsconfig.json     extends conventions/typescript/tsconfig.base.json ✅
biome.json        extends conventions/typescript/biome.json ✅
vitest.config.ts  测试 + 覆盖率门禁
tsup.config.ts    构建（esm + dts）
```

---

## 关键设计展示

### core 层零 React

```ts
// src/core/create-example.ts —— 无 import React，无 DOM 访问
import { ValidationError } from './errors';

export function createExample(input: CreateExampleInput): Example {
  const name = input.name.trim();
  if (name.length === 0) {
    throw new ValidationError('name cannot be empty', { field: 'name' });
  }
  return { exampleId: `example-${Date.now()}`, name, createdAt: new Date() };
}
```

**收益**：可在 Node / Worker / SSR 直接运行。

### 动作注入模式

```tsx
// src/components/Example.tsx
export interface ExampleProps {
  example: Example;
  showCreatedAt?: boolean;
  onSelect?: (example: Example) => void;   // 不传 → 按钮不渲染
}

export function ExampleCard({ example, showCreatedAt = false, onSelect }: ExampleProps) {
  return (
    <article>
      <h3>{example.name}</h3>
      {showCreatedAt ? <time>{example.createdAt.toLocaleDateString()}</time> : null}
      {onSelect ? <button onClick={() => onSelect(example)}>Select</button> : null}
    </article>
  );
}
```

**为什么重要**：宿主可以选择不提供 `onSelect` → 组件自动降级，不留死按钮。

### 错误码与后端对齐

```ts
// src/core/errors.ts
export const ErrorCode = {
  OK: 0,
  INVALID_ARGUMENT: 40001,
  NOT_FOUND: 40401,
  INSUFFICIENT_BALANCE: 60001,
  // …与 packages/conventions/api/error-codes.json 一致
} as const;
```

---

## 本次验证发现的 conventions 缺陷（4 个，全部已修）

| # | 缺陷 | 根因 | 修复 |
|---|---|---|---|
| 1 | **Biome `extends` 报 "must be either `//` or an array of paths"** | Biome 2.x 的 `extends` **必须是数组**，字符串会失败 | 改为 `["path"]` 数组 |
| 2 | **`$comment` 不是合法 key** | Biome 的 schema 是严格的，未知 key 直接报错 | 删除 `$comment`，注释放 README |
| 3 | **`noConsoleLog` 不存在** | Biome 2.x 的规则名是 `noConsole`（且 `recommended` 在 2.6 已废弃）| 改名 `noConsole`，`recommended` 保留（仅告警）|
| 4 | **嵌套 root 配置冲突** | base 配置不能带 `"root": true`，被 extends 时会报 "there's already a root configuration" | base 不设 root |

### 额外发现

| # | 问题 | 影响 | 解决 |
|---|---|---|---|
| A | **biome 的 JSON formatter 用 tab 缩进** | 与 TS 的 2 空格不一致，视觉上割裂 | 接受现状（JSON 用 tab 是 Biome 默认）；或 base 里给 `json.formatter.indentWidth` 设 2 |
| B | **biome 会对 `export` 排序** | 手写顺序与自动排序不一致会报 lint 错 | 接受自动排序；或关掉 `useSortedKeys` 类规则 |
| C | **vitest `environment: 'jsdom'` 需显式装 jsdom** | 缺依赖直接崩 | `devDependencies` 必须含 `jsdom`（React 类包）|

---

## 本地运行

```bash
pnpm install

# 质量门禁（4 道）
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run build
```

---

## 相关文档

- [代码规范](../../docs/05-代码规范.md)
- [架构护栏](../../docs/06-架构护栏.md)
- [执行计划](../../docs/11-执行计划.md)
