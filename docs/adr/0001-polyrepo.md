# ADR-0001：采用 Polyrepo 而非 Monorepo

- **状态**：已接受
- **日期**：2026-11-19

---

## 背景

`scholarspace` 由 13 个独立子项目 + 1 个组装主项目构成。每个子项目有独立的技术栈边界（Python 服务 / TypeScript 包）、独立的发布节奏、独立的 CI。

约束：
1. 用户明确要求"每一个都是单独可以成为一个项目，然后组装到这个项目里"
2. `pdf-viewer` 已在独立开发中，未来需要收编
3. 部分子项目（如 `pdf-viewer`）将来可能要开源或对外分发

---

## 决策

**每个子项目 = 独立 Git 仓库 + 独立版本号 + 独立 CI + 独立发布。**

主项目 `scholarspace` 作为**组装层**，包含：
- `packages/conventions/` —— 规范唯一来源（可执行配置片段）
- `packages/ui/` —— 设计系统
- `packages/core/` —— 核心底座
- `contracts/` —— 契约唯一来源
- `apps/` —— 组装应用
- `infra/` `docs/` `tools/` `cli/`

跨仓库协作靠 **契约（contracts）+ 版本兼容矩阵 + CI 校验**。

---

## 理由

### 1. 满足"独立项目"的诉求

每个子项目能：
- 独立发版（PyPI / npm）
- 独立 CI（不同语言、不同测试栈）
- 独立被复用（`orchestra` 可以单独给企业内部用）
- 独立开源（`pdf-viewer` 是 MIT，天然适合）

### 2. 契约中心是 Polyrepo 的关键

Polyrepo 的头号风险是**版本漂移**。我们的对策：
- 契约在主仓 `contracts/` 定义（唯一真相源）
- `tools/codegen` 生成 Python 模型 + TS 客户端，**不手写 DTO**
- `versions/compatibility.yaml` 声明兼容矩阵
- CI 跑 `openapi-diff`（契约变更即阻断）+ `schemathesis`（实现与契约 fuzz 一致性）

### 3. 规范用"可执行配置"跨仓库传导

`packages/conventions/` 里的 base 配置（ruff / mypy / biome / tsconfig / import-linter）被所有子项目 `extends`。
**规范演进改一处，全平台跟随** —— 这在纯文档规范下做不到。

---

## 备选方案

### Monorepo（单仓多包）

**优点**：跨项目改动一次 commit；CI 统一；版本协调简单。

**否决理由**：
1. 用户明确要求"单独可以成为一个项目"
2. `pdf-viewer` 独立开发中，收编时迁历史更麻烦
3. 未来若某个包要单独开源（如 MIT 协议的 `pdf-viewer`），polyrepo 更自然
4. 不同技术栈在同一仓的 CI 配置互相干扰

**缓解措施**：polyrepo 的版本漂移风险由契约中心 + CI 门禁承担，而不是靠"都在一个仓里所以不会漂"。

---

## 后果

### 正面
- 边界清晰，物理隔离强制约束（不能随手 import 别人的内部实现）
- 各包技术栈独立优化
- 单包发布不影响其他包
- 对外分发（开源/私有）灵活

### 负面
- **跨仓 PR 成本**：改契约 + 改消费方 = 2 个 PR，需要版本协调
- **本地开发体验**：要 clone 多个仓（用 `git submodule` 或 `pnpm workspace` + `uv workspace` 缓解）
- **版本矩阵管理复杂度**：需要兼容矩阵 + 自动化校验

### 风险与缓解

| 风险 | 缓解 |
|---|---|
| 版本漂移 | 契约中心 + `openapi-diff` CI 门禁 + 兼容矩阵 + 统一发版节奏 |
| 跨仓协调成本高 | 契约变更走"先改契约 → 生成 → 再改实现"流程；契约 PR 与实现 PR 绑定 |
| 本地开发繁琐 | 提供 `scholarspace dev setup` 一键拉取全部子仓 |
