# ADR-0012：脚手架以 TypeScript CLI 实现

- **状态**：已接受
- **日期**：2026-11-19

---

## 背景

需求：**"我还需要一个脚手架 可以快速搭建起来项目的那种"**。

约束：
1. 13 个子项目（6 个 Python 包 + 5 个 TS 包 + 2 个 app）需要快速创建
2. 新项目必须**天生符合规范**（见 [ADR-0011](./0011-conventions-as-code.md)）
3. 团队 2 人，脚手架本身不能成为负担

---

## 决策

**实现 `@scholarspace/cli` —— TypeScript CLI，通过 `pnpm dlx` 使用。**

```bash
pnpm dlx @scholarspace/cli new my-service --template python-service
```

### 核心设计：与规范同源

```
packages/conventions/          ← 唯一规范来源
        ↑ extends
cli/templates/*/               ← 所有模板继承 base
        ↑ 生成
my-service/                    ← 新项目天生合规
```

### 命令集

`new` `add-node` `add-service` `add-page` `i18n check` `i18n extract` `theme preview` `contract diff` `contract generate` `guards run` `doctor` `release check` `release publish`

### 模板集

`python-service` `python-library` `python-worker` `ts-package` `ts-app` `ts-hook`

---

## 理由

### 1. TypeScript 而非 Python

| 维度 | 评估 |
|---|---|
| 前端团队学习成本 | ⭐ 零（TS 是主语言）|
| 跨语言统一工具链 | ⭐ 同一个 pnpm workspace |
| 模板引擎生态 | ⭐ Nunjucks/Eta/Handlebars 成熟 |
| 生成 Python 代码 | ✅ 只是写文件，无语言障碍 |

**如果用 Python**：前端同学要装 uv、读 Python CLI 代码、学习 argparse/typer。
**用 TS**：所有人 `pnpm dlx` 一条命令，零学习成本。

### 2. 必须同源，不能是"模板复制"

如果脚手架只是把 base 配置**复制**一份到新项目：
- 规范演进 → 每个包都要手动同步 → 必然漂移
- 这正是我们要避免的

**用 `extends`（相对路径）**：base 变更自动传导。

### 3. `add-node` 是本项目的特色命令

`orchestra` 要加一个节点类型，需要动 6+ 个地方：
```
orchestra/domain/node_specs/<name>.py
orchestra/infrastructure/nodes/<name>.py
orchestra/schemas/node-<name>.json
orchestra/tests/unit/test_<name>_node.py
orchestra/src/i18n/{zh-CN,en-US}.ts
apps/orchestra-web/src/features/nodes/<name>/
```

**手工做必然漏**。`add-node` 一条命令生成全部，且自动同步契约。

### 4. `i18n check` 是必需的

14 个包 × 数百 key，人工检查不可能。CLI 提供机器检查：
- key 命名规范
- L1 覆盖一致性
- 跨语言占位符一致性

### 5. `theme preview` 解决实际痛点

调主题色需要**看到效果**。提供一个可视化页面（预设/主色/圆角/密度/明暗/RTL 预览），比反复改代码试错高效得多。

### 6. `guards run` 统一入口

各护栏散落在各处会让开发者不知道该跑什么。统一成一个命令 + 一份清单。

---

## 备选方案

### A. Python CLI（uvx）

**优点**：与后端技术栈一致；Python 生态的模板工具成熟。

**否决**：前端团队零学习成本的优势更大；且 CLI 只是"写文件"，不需要 Python 生态。

**保留**：若未来 CLI 需要调用大量 Python 生态工具（如 pydantic 渲染），可做一个 Python 侧的 `uvx` 版本。

### B. Yeoman

**优点**：成熟的脚手架框架，生态插件多。

**否决**：
1. 生态主要面向 Web 框架（React/Vue），Python 模板要自己写
2. 插件机制我们要的"同源 base"用不上
3. 引入大量依赖

### C. Cookiecutter（Python）

**优点**：模板机制简单，Jinja2 强大。

**否决**：同 A。**且 Cookiecutter 无法做"生成后自动安装依赖 + 初始化 git + 跑冒烟测试"这类编排。**

### D. Copier（Python）

**优点**：比 Cookiecutter 好（支持模板更新）。

**否决**：同 A。**Copier 的"模板更新"能力我们可以自己实现（base 变更 → 已有项目 `sync` 命令）。**

### E. 不做脚手架，手工建仓

**否决**：13 个包手工建 = 重复劳动 + 不一致 + 规范易漏。**这正是当前 `scholar-club-backend` 的状况。**

---

## 后果

### 正面
- 新项目 1 条命令创建，**天生合规**
- 规范演进出成本 = 改 1 个 base
- 团队零学习成本
- `add-node` / `add-service` 这类多文件改动不会漏
- 护栏有统一入口

### 负面
- **脚手架本身要维护**（约 1.5-2 周）
- 模板与实际项目会有偏差 → 需要在真实项目中验证
- TS 生态的模板工具要选型（Eta vs Handlebars vs Nunjucks）
- 跨仓 `extends` 的相对路径需要约定目录布局 → 用 `scholarspace dev setup` 解决

### 风险与缓解

| 风险 | 对策 |
|---|---|
| 脚手架过度设计 | 只管骨架，业务一律不管；命令集克制 |
| 模板与实际不符 | 每个新子项目**必须**用它生成（强制）；发现偏差就改模板 |
| base 演进滞后 | 模板 `extends` base，base 变更自动传导；提供 `sync` 命令把已有项目对齐 |
| 生成代码质量差 | 生成后自动跑 formatter + lint + 冒烟测试 |
| 跨仓路径问题 | `dev setup` 统一布局；CI 校验路径存在 |

---

## 里程碑

| 阶段 | 内容 | 工期 |
|---|---|---|
| C.1 | CLI 骨架 + `new` + `python-service` / `ts-package` 模板 | 1 周 |
| C.2 | `guards run` + `i18n check` + 护栏脚本 | 1 周 |
| C.3 | `contract diff/generate` + `add-node` + `add-service` | 1 周 |
| C.4 | `theme preview` + `doctor` + `release` | 0.5 周 |

**M0 必须完成 C.1 + C.2** —— 否则第一个子项目就不合规，后面全部返工。

---

## 技术选型

| 项 | 选型 | 理由 |
|---|---|---|
| CLI 框架 | **Commander** | 简洁、成熟、文档好 |
| 模板渲染 | **Eta** | 比 Handlebars 轻快，语法接近 JS |
| 交互提示 | **@clack/prompts** | 现代化 TUI，体验好 |
| 文件操作 | **fs-extra** + **globby** | 成熟 |
| 校验 | **Zod v4** | 与前端一致 |
| 测试 | **Vitest** | 与前端一致 |
| i18n | 平台自己的 i18n 体系 | `cli/src/i18n/`（zh-CN / en-US）|
