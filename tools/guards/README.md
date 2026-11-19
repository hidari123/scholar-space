# @scholarspace/guards

> 架构护栏 —— **单一入口跑全部规则**。

---

## 为什么

护栏散落在各个 CI 里，会出现「这条规则到底在哪个仓跑」的困惑。
统一入口 + 统一输出（✓ 通过 / ✗ 违规 + 汇总），任何仓都能用同一条命令。

```bash
node tools/guards/dist/cli.js run                # 全部
node tools/guards/dist/cli.js run --only G7,G13  # 指定
node tools/guards/dist/cli.js list               # 列出
```

---

## 已实现的护栏

| # | 护栏 | 检查什么 | 级别 |
|---|---|---|---|
| **G7** | 禁止直接 import antd | 业务代码只能 `import from '@scholarspace/ui'`（ui 包豁免）| 阻断 |
| **G11** | 组件级 theme 禁颜色 | `theme.components.*` 里不许出现硬编码 hex | 阻断 |
| **G13** | i18n key 命名规范 | key 的 domain 必须在允许列表里 | 阻断 |
| **G16** | 密钥扫描 | OpenAI / GitHub / AWS / 私钥模式 | 阻断 |
| **G17** | License 扫描 | 禁 AGPL / GPL-3.0 / SSPL | 阻断 |
| **G21** | 包体积上限 | `packages/ui/dist` ≤ 80 kB | 提醒 |
| **G23** | extends 引用有效性 | tsconfig / biome 的 extends 目标必须存在 | 阻断 |
| **G24** | 测试函数名必须英文 | `def test_xxx(` 的名字不得含非 ASCII | 阻断 |

---

## 两条来自实测的护栏

### G23 —— 探测「静默失效」

**这是最重要的一条。**

biome 的 `extends` 指向不存在的路径时：
- ❌ **不报错**
- ❌ 规则全部失效
- ✅ CI 照样绿灯

不装这条护栏，你的 lint 规则可能根本没生效，而你完全不知道。

```bash
$ node tools/guards/dist/cli.js run --only G23
✗ G23 extends 引用有效性 —— 1 处违规
    packages/x/tsconfig.json: extends "../../packages/conventions/typescript/tsconfig.base.json" 目标不存在
```

### G24 —— 中文测试函数名

来自 Step 0.6 的实测踩坑：

```python
def test_创建示例() -> None: ...      # ❌ ruff N802 + PLC2401
def test_创建 成功() -> None: ...    # ❌ SyntaxError！被解析成 def test_创建 + 标识符 成功
```

**docstring 可以用中文，标识符不行。**

---

## 扩展一条护栏

在 `src/guards.ts` 里加一个对象：

```ts
const g8: Guard = {
  id: 'G8',
  name: '禁止 styled-components',
  description: '样式只用 Tailwind（布局）+ AntD（组件）',
  severity: 'error',
  scope: 'packages',
  run(root) {
    const violations: string[] = [];

    for (const file of walkFiles(join(root, 'packages'), ['.ts', '.tsx'])) {
      if (readText(file).includes('styled-components')) {
        violations.push(`${relative(root, file)}: 用了 styled-components`);
      }
    }

    return violations;
  },
};

// 加进注册表
export const GUARDS: Guard[] = [g7, g8, g11, ...];
```

**契约**：`run(root)` 返回违规列表，空数组 = 通过。

---

## 在 CI 里用

主仓：`.github/workflows/ci.yml` 的 `guards` job。

子仓：复制 `.github/workflows/subrepo-ci.yml`，它会 clone 主仓拿护栏工具。

---

## 质量门禁

```bash
pnpm run typecheck    # tsc --noEmit
pnpm run lint         # biome check
pnpm run test         # vitest run
pnpm run build        # tsup
```

当前：**29 tests passed**

---

## 相关文档

- [架构护栏](../../docs/06-架构护栏.md)
- [代码规范](../../docs/05-代码规范.md)
- [ADR-0015 共享底座发布](../../docs/adr/0015-shared-base-publishing.md)
