# ADR-0009：编排包命名为 `orchestra`

- **状态**：已接受
- **日期**：2026-11-19

---

## 背景

编排引擎项目最初名为 `agents`，但这个名字无法体现「编排」能力。

需要体现的能力范围（来自对 Langflow 与 ScholarClaw 的分析）：

| 层 | 能力 |
|---|---|
| 编排层 | Flow 图、可视化编辑、版本化、发布分享 |
| 运行时 | DAG 调度、变量上下文、重试、并发、EventBus |
| 能力层 | 节点类型（LLM / 工具 / 检索 / 代码 / 子流程 / 多 Agent / MCP / 人工审批）|
| 生态层 | 节点市场、技能系统（SKILL.md）、MCP Server、定时任务 |

关键判断：**编排的对象不限于 Agent**。也可以是模型调用、普通工具、数据流。因此包名不应绑定 "agent" 概念。

---

## 决策

**包名 `@scholarspace/orchestra`（Python 包 `scholarspace-orchestra`），中文名「编排引擎」。**

同时统一领域术语（对标 Langflow，重新定义）：

| Langflow | scholarspace |
|---|---|
| Flow | **Flow**（保留，行业通用）|
| Component / Vertex | **Node** |
| Job | **Run** |
| Transaction | **NodeRun** |
| VertexBuild | **Execution** |

---

## 理由

### 1. `orchestra` 字面就是"编排"

`orchestra` 是 `orchestrate` 的名词形，音乐隐喻天然贴合"多个组件协同演奏"——正是 Flow 编排的本质。**不需要任何解释**。

### 2. 不绑定 Agent 概念

编排的对象可以是 Agent、可以是普通工具调用、可以是模型与数据的混合流。若叫 `agents`，表达就窄了。

### 3. 独立性与可读性

| 维度 | 评估 |
|---|---|
| 编排感 | ⭐⭐⭐⭐⭐ |
| 工程感 | ⭐⭐⭐⭐ |
| 独立性 | ⭐⭐⭐⭐⭐ |
| 域名友好 | ✅ `orchestra.scholar.club` |
| 业界冲突 | 无（不像 `flow`/`pipeline` 被用烂）|

### 4. 备选对比

| 候选 | 编排感 | 问题 |
|---|---|---|
| **`orchestra`** | ⭐⭐⭐⭐⭐ | ✅ 选定 |
| `weave` | ⭐⭐⭐⭐ | 偏文学化，工程含义弱 |
| `conductor` | ⭐⭐⭐⭐⭐ | 与 orchestra 同源词，**不可同时用** |
| `flowforge` | ⭐⭐⭐ | 偏工具，弱化运行时 |
| `orchestrator` | ⭐⭐⭐⭐⭐ | 偏长 |
| `atlas` | ⭐⭐ | 该词在 AI 领域已被用烂 |

### 5. 术语统一的必要性

一次重写 13 个项目，必须**一次性对齐术语**。否则代码里会同时存在 `Component` / `Vertex` / `Node` 三套叫法，维护成本极高。

选择 `Node` 而非 `Component` 的原因：**"Component" 在 React 语境已被占用**（React 组件），在编排语境再叫 Component 会与前端混淆。

---

## 备选方案

### A. `agents`

**否决**：无法体现编排；且绑定 Agent 概念，窄化了这个包的能力边界。

### B. `orchestrator`

**否决**：稍长；且与 `orchestra` 语义重复，若未来要拆出"编排器 vs 乐团"的子概念会冲突。

### C. `flows` / `pipeline`

**否决**：`flow` 过于通用（社区的 feed 也叫 flow）；`pipeline` 偏数据处理，弱化 LLM/Agent 语义。

### D. `workbench` / `studio`

**否决**：偏"工具界面"，不体现"编排"这一核心动作。

---

## 后果

### 正面
- 名称自解释，无需文档澄清
- 与领域术语体系（Flow / Node / Run / NodeRun）一致
- 未来拆分子概念有空间（orchestra 下的 flow / node / run 分层）
- 域名与包名干净

### 负面
- 需要一次性重命名所有相关概念（Langflow 的 `Component` → `Node` 等）
- 与既有 Langflow 生态的术语对照需要文档说明

### 风险与缓解

| 风险 | 缓解 |
|---|---|
| 术语混用 | CI guard：禁止出现 `Component`/`Vertex` 作为领域术语（`node_type` 枚举固定） |
| 与 Langflow 文档对照困难 | 在 `orchestra/README.md` 提供术语对照表 |
| 未来若拆分「编排 vs 执行」 | 命名预留：`orchestra.domain`（编排语义）+ `orchestra.application.runtime`（执行） |
