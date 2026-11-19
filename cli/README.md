# @scholarspace/cli

> scholarspace 项目脚手架 —— **一条命令生成一个天生合规的独立项目**。

---

## 为什么需要它

规范如果只是文档，半年后必然漂移。
**规范是可执行配置**（`packages/conventions/`），但跨仓怎么落地？—— 这就是 `cli` 的职责。

```
packages/conventions/          ← 唯一规范来源
        ↑ cli sync 复制
my-service/ruff.toml           ← 本地副本，子仓 CI 不依赖主仓
my-service/mypy.ini
my-service/tsconfig.base.json
```

---

## 命令

| 命令                             | 说明                         |
| -------------------------------- | ---------------------------- |
| `new <name> --template <id>`     | 创建新项目（含规范基座同步） |
| `sync --kind python\|typescript` | 同步规范基座到目标仓         |
| `check --target <dir>`           | 检查 extends 引用是否失效    |
| `list`                           | 列出可用模板                 |

---

## 用法

### 创建项目

```bash
# Python 服务（四层 FastAPI）
npx @scholarspace/cli new my-service --template python-service

# TS 包（三层）
npx @scholarspace/cli new my-ui-kit --template ts-package
```

生成后自动：

1. 写出全部项目文件
2. **同步规范基座**（`ruff.toml` / `mypy.ini` 或 `tsconfig.base.json` / `biome.base.json`）
3. 写 `SYNC.md` 说明怎么更新
4. 打印后续验证命令

### 同步规范（改了主仓规范后）

```bash
npx @scholarspace/cli sync --kind python --target ../scholarspace-paper
```

**幂等** —— 内容没变就不动文件。

### 检查 extends 是否失效

```bash
npx @scholarspace/cli check --target ../scholarspace-paper
```

⚠️ **这个命令的价值**：biome 的 `extends` 路径不存在时**静默失效** ——
不报错，但规则全部失效，CI 照样绿灯。`check` 是这个陷阱的唯一探针。

---

## 为什么必须「复制」而不是「相对路径 extends」

子仓的 CI 是**独立 checkout** 的，仓库里没有 `../../packages/conventions/`。

| 工具      | 相对路径 extends 在子仓 CI 里       |
| --------- | ----------------------------------- |
| ruff      | ❌ 直接报错（可见）                 |
| mypy      | ❌ 报 "Unrecognized option"（可见） |
| **biome** | ⚠️ **静默失效**（不可见！）         |

biome 那个最危险 —— 规则全没了，CI 还是绿的。
所以复制是**唯一可靠**的方案。

| 工具     | 复制后的引用方式                                      |
| -------- | ----------------------------------------------------- |
| ruff     | `pyproject.toml` → `extend = "./ruff.toml"`           |
| mypy     | `mypy.ini`（mypy 无继承机制，只能整份复制）           |
| tsconfig | `tsconfig.json` → `"extends": "./tsconfig.base.json"` |
| biome    | `biome.json` → `"extends": ["./biome.base.json"]`     |

---

## 模板

### `python-service`

四层 FastAPI 服务 —— 与 `examples/python-service` 结构一致（Step 0.3 实测验证过）：

```
src/<pkg>/
├── domain/           零外部依赖
├── application/      用例 + ports
├── infrastructure/   实现 ports
└── interfaces/       薄 HTTP 层
```

附：`setup.cfg` 的 5 条 import-linter 契约、`py.typed`、`.env.example`、测试骨架。

### `ts-package`

三层 TS 库 —— 与 `examples/ts-package` 结构一致：

```
src/
├── core/         零 React、零 DOM
├── components/
└── hooks/
```

附：`publishConfig` 指向 GitHub Packages、测试 + 覆盖率门禁、tsup 构建。

---

## 质量门禁

```bash
pnpm run typecheck    # tsc --noEmit
pnpm run lint         # biome check
pnpm run test         # vitest run
pnpm run build        # tsup
```

当前：**38 tests passed**

---

## 相关文档

- [脚手架设计](../../docs/09-脚手架.md)
- [架构护栏](../../docs/06-架构护栏.md)
- [独立仓与共享 UI](../../docs/12-独立仓与共享UI设计.md)
