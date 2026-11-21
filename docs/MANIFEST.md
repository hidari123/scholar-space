# 文档清单

> `scholarspace` 规划文档集。全部为规划阶段产物，尚未开始编码。

---

## 主文档

| 文件 | 内容 | 阅读顺序 |
|---|---|---|
| [README.md](./README.md) | 总纲：原则、项目总表、依赖拓扑、技术栈概览、路线图、决策速查 | ① |
| [01-精华与糟粕.md](./01-精华与糟粕.md) | 每个参考项目的"留/弃"逐条判定 + 20 项精华资产迁移施工单 | ② |
| [02-技术栈.md](./02-技术栈.md) | 统一技术栈与选型理由、淘汰清单、风险登记 | ③ |
| [03-语言体系.md](./03-语言体系.md) | 界面语言 12 种 + 内容语言 20 种 + 自定义语言 | ④ |
| [04-主题与设计系统.md](./04-主题与设计系统.md) | 品牌主题五层模型、AntD 集成、样式系统、复合组件 | ⑤ |
| [05-代码规范.md](./05-代码规范.md) | Python / TypeScript / API / DB / Git / 安全规范 | ⑥ |
| [06-架构护栏.md](./06-架构护栏.md) | 27 条 CI 护栏（G1-G27）| ⑦ |
| [07-orchestra.md](./07-orchestra.md) | 编排引擎完整设计 | ⑧ |
| [08-slides.md](./08-slides.md) | PPT 引擎完整设计 | ⑨ |
| [09-脚手架.md](./09-脚手架.md) | `scholarspace-cli` 设计 | ⑩ |
| [10-迁移路线.md](./10-迁移路线.md) | 双轨迁移、数据策略、下线清单 | ⑪ |

## ADR

| 文件 | 决策 |
|---|---|
| [adr/0001-polyrepo.md](./adr/0001-polyrepo.md) | Polyrepo 而非 Monorepo |
| [adr/0002-antd-foundation.md](./adr/0002-antd-foundation.md) | AntD v5 作为组件基座 |
| [adr/0003-style-system.md](./adr/0003-style-system.md) | Tailwind(布局) + AntD(组件)，移除 styled-components |
| [adr/0004-backend-fastapi.md](./adr/0004-backend-fastapi.md) | 后端统一 FastAPI |
| [adr/0005-postgresql.md](./adr/0005-postgresql.md) | 数据库统一 PostgreSQL 17 + pgvector |
| [adr/0006-language-system.md](./adr/0006-language-system.md) | 语言体系设计 |
| [adr/0007-brand-theme.md](./adr/0007-brand-theme.md) | 品牌主题机制 |
| [adr/0008-slides-rendering.md](./adr/0008-slides-rendering.md) | PPT 渲染路线：矢量式为主 |
| [adr/0009-orchestra-naming.md](./adr/0009-orchestra-naming.md) | 编排包命名 orchestra |
| [adr/0010-community-selfbuild.md](./adr/0010-community-selfbuild.md) | 社区自研路线与 Mastodon 兼容策略 |
| [adr/0011-conventions-as-code.md](./adr/0011-conventions-as-code.md) | 规范以可执行配置承载 |
| [adr/0012-scaffold-cli.md](./adr/0012-scaffold-cli.md) | 脚手架以 TypeScript CLI 实现 |
| [adr/0013-license-compliance.md](./adr/0013-license-compliance.md) | License 合规策略（AGPL 隔离）|
| [adr/0014-migration-strategy.md](./adr/0014-migration-strategy.md) | 双轨并行迁移策略 |
| [adr/0015-shared-base-publishing.md](./adr/0015-shared-base-publishing.md) | 共享底座发布策略 |
| [adr/0016-repo-layout-and-identity.md](./adr/0016-repo-layout-and-identity.md) | 仓库布局：4+1+1 + identity 独立 |
| [adr/0017-admin-system.md](./adr/0017-admin-system.md) | 管理员体系设计 |
| [adr/0018-g1-gate-review.md](./adr/0018-g1-gate-review.md) | **G1 闸门评审**：规范可用性评估 |

---

## 文档产出原则

| 原则 | 说明 |
|---|---|
| **决策要记录理由** | 半年后只记得"做了什么"，忘了"为什么" → 每个 ADR 写清背景/理由/备选/后果 |
| **数据要有出处** | 所有数字（173 处复制粘贴、408 处异常吞噬、39 处 styled、164 个 antd 文件等）均来自实测 |
| **参考要分清留弃** | `01-精华与糟粕.md` 逐条判定，避免把旧问题带进新系统 |
| **规范要可执行** | 文档说"为什么"，`packages/conventions/` 说"怎么执行" |
| **不确定要标注** | 待确认项集中列出，不假装已经定了 |

---

## 已识别的关键待确认项

| # | 问题 | 建议 | 文档位置 |
|---|---|---|---|
| 1 | 界面语言 12 种是否够 | ✅ **已落地**：12 种（`packages/ui` + `identity-ui` 各实现一遍）| 03 |
| 2 | 内容语言 20 种 | ✅ **已落地**：21 种（20 + `auto`），见 `packages/services/llm` | 03 |
| 3 | 自定义语言分发方式 | 运行时 JSON + `/api/v1/i18n/locales/{locale}` | 03 |
| 4 | RTL 实现深度 | 架构预留 + `ar-EG` 验证，不做全量翻译 | 03 |
| 5 | 品牌色 vs 用户偏好优先级 | 模式=用户，色=机构，二者分离 | 04 / ADR-0007 |
| 6 | AntD 版本 | v5（v6 生态未稳）| ADR-0002 |
| 7 | Tailwind 定位 | 仅布局/间距 | ADR-0003 |
| 8 | 富文本方案 | Tiptap（替 react-quill）| 02 |
| 9 | 头像裁剪 | 自研（替 antd-img-crop）| 02 |
| 10 | 任务队列 | arq（Port 抽象，可换 Temporal）| 02 |
| 11 | PPT 渲染路线 | ✅ **已定** —— 矢量式为主，G2 闸门已通过（ADR-0019）| ADR-0008 / ADR-0019 |
| 12 | 社区路线 | 自研 + 对齐 Mastodon API，联邦 P2 | ADR-0010 |
| 13 | 社区数据是否迁移 | ⏳ **待定** —— 建议不迁（从零开始），M5 做之前要你确认 | ADR-0010 |
| 14 | 脚手架语言 | TypeScript CLI | ADR-0012 |
| 15 | 旧系统下线节点 | M7（明确节点，防双轨长期化）| ADR-0014 |
| 16 | 电商/社群等商业化功能 | 本期不做 | 10 |
| 17 | 管理员是全局还是租户内？ | ✅ **已确认**：平台管理员 + 租户管理员两级 | ADR-0017 |
| 18 | 管理员能看用户的论文/PPT 内容吗？ | ✅ **已确认**：默认不能，审核只给快照 | ADR-0017 |
| 19 | 封禁用户怎么做？ | ✅ **已确认**：`UserStatus` + 网关校验，不删人 | ADR-0017 |
| 20 | 管理员账号怎么进？ | ✅ **已确认**：另一个 admin 授予；第一个走初始化脚本 | ADR-0017 |

---

## 下一步

按依赖顺序，建议：

| 序 | 动作 | 前置 | 状态 |
|---|---|---|---|
| 1 | 确认本套文档中的待确认项 | — | ✅ 17-20 已确认，1-16 见上表 |
| 2 | 建 `scholarspace` 主项目骨架 + `packages/conventions/` | 确认 | ✅ |
| 3 | 建 `packages/ui`（AntD 基座 + 品牌主题 + i18n）| 2 | ✅ |
| 4 | 建 `cli` 脚手架（`new` + `guards run` + `i18n check`）| 2 | ✅ |
| 5 | 建 `contracts/` + codegen | 2 | ✅ 5 份 OpenAPI 契约 + codegen 37 tests |
| 6 | 第一个样板子项目（`auth`）验证规范 | 3 4 5 | ✅ |
| 7 | **G1 闸门评审** —— 规范可用性评估 | 6 | ✅ **已通过**（ADR-0018）|
| 8 | 进入 M2（orchestra）| 7 | 🔄 **进行中** —— events 已落地，画布前端未建 |
