# scholarspace — 项目总纲

> 平台级学术工作空间。**4+1 独立仓 + 1 个组装主项目**。
>
> **状态**：M1 样板进行中
> **文档版本**：v1.1
> **最后更新**：2026-11-19

---

## 0. 一句话

**读论文 → 懂论文 → 出成果** 的完整闭环，由可独立发布、可独立演进的子项目组成。

---

## 1. 核心原则（不可妥协）

| # | 原则 | 落地方式 |
|---|---|---|
| 1 | **只借鉴，不复制** | 所有参考项目只取"设计思路"与"算法"，不拷贝源码。CI 加 license 扫描门禁 |
| 2 | **契约先行** | OpenAPI / JSON Schema 定义在主仓 `contracts/`，代码由 codegen 生成，不手写 DTO |
| 3 | **依赖倒置** | 领域层零外部依赖；外部系统一律走 Port 接口 |
| 4 | **规范可执行** | 规范是配置文件（`packages/conventions/`），不是文档；脚手架继承，CI 校验 |
| 5 | **表面积最小** | 每个包只暴露 `__init__.py` 公开 API，禁止摸内部实现 |
| 6 | **可替换** | LLM / 存储 / 队列 / 渲染器全部走 Port，可整体换实现 |
| 7 | **单轨优先** | 每个子项目在投产前完成自研重写，不长期维护双轨 |
| 8 | **身份与业务分离** | identity 只管「你是谁」；业务数据在别的包，靠事件解耦 |
| 9 | **身份标识用稳定值** | 微信用 openid 不用昵称 —— 昵称会变 |

---

## 2. 文档索引

| 文档 | 内容 |
|---|---|
| [00-项目地图.md](./00-项目地图.md) | 快速定位：我在做什么？现在到哪了？下一步？|
| [01-精华与糟粕.md](./01-精华与糟粕.md) | 每个参考项目的"留/弃"逐条判定 |
| [02-技术栈.md](./02-技术栈.md) | 统一技术栈与选型理由 |
| [03-语言体系.md](./03-语言体系.md) | 界面语言 / 内容语言 / 自定义语言完整设计 |
| [04-主题与设计系统.md](./04-主题与设计系统.md) | 品牌主题、多层级配置、AntD 集成 |
| [05-代码规范.md](./05-代码规范.md) | Python / TypeScript / API / Git 规范 |
| [06-架构护栏.md](./06-架构护栏.md) | 依赖规则、CI 门禁清单 |
| [07-orchestra.md](./07-orchestra.md) | 编排引擎完整设计 |
| [08-slides.md](./08-slides.md) | PPT 引擎完整设计 |
| [09-脚手架.md](./09-脚手架.md) | scholarspace-cli 设计 |
| [10-迁移路线.md](./10-迁移路线.md) | 双轨迁移与数据迁移 |
| **[11-执行计划.md](./11-执行计划.md)** | ⭐ **执行步骤与里程碑** |
| **[12-独立仓与共享UI设计.md](./12-独立仓与共享UI设计.md)** | ⭐ 独立仓可用性 + 共享 UI 机制（已实测，决策已确认）|
| [MANIFEST.md](./MANIFEST.md) | 文档清单 + 待确认项 |
| [adr/](./adr/) | 架构决策记录 |

**仓内文档**：

| 文档 | 内容 |
|---|---|
| [packages/services/README.md](../packages/services/README.md) | ⭐ B 类底座服务 + **管理员体系**设计 |
| [cli/docs/plugin.md](../cli/docs/plugin.md) | ⭐ 写一个 CLI 插件 |

---

## 3. 项目总表（4+1+1）

### 3.1 主项目（组装层，零业务代码）

```
scholarspace/
├── packages/
│   ├── conventions/     规范唯一来源（可执行配置片段）
│   ├── ui/              设计系统（AntD 基座 + 品牌主题 + i18n）⭐npm
│   ├── core/            共享 Python 底座 ⭐PyPI
│   └── services/        B 类底座服务
│       ├── auth/        角色 / 权限 / 内部 JWT / 管理员判定
│       ├── llm/         多模型接入 / 路由 / 成本核算
│       ├── storage/     对象存储抽象
│       ├── events/      事件总线 + SSE
│       ├── billing/     账本 + 额度
│       └── federation/  跨实例互联
├── contracts/           OpenAPI + JSON Schema + i18n schema
├── apps/                gateway / web
├── infra/               Docker / K8s / 观测 / CI 模板
├── docs/adr/            架构决策记录
├── tools/codegen/       契约 → 代码
├── tools/guards/        架构护栏
├── versions/            兼容矩阵
└── cli/                 平台工具链（内核 + 插件）
```

### 3.2 A 类独立仓（4+1，用户可见，各自 Git 仓库 + 独立版本 + 独立 CI）

> 全部在 [github.com/hidari123](https://github.com/hidari123) 下。

| # | 包名 | 中文 | 仓库 | 阶段 |
|---|---|---|---|---|
| 1 | `scholarspace-paper` | 文献研究 | [hidari123/scholarspace-paper](https://github.com/hidari123/scholarspace-paper) | M4 |
| 2 | `scholarspace-slides` | 演示文稿引擎 | [hidari123/scholarspace-slides](https://github.com/hidari123/scholarspace-slides) | M3 |
| 3 | `scholarspace-orchestra` | 编排引擎 | [hidari123/scholarspace-orchestra](https://github.com/hidari123/scholarspace-orchestra) | M2 |
| 4 | `scholarspace-community` | 学术社区 | [hidari123/scholarspace-community](https://github.com/hidari123/scholarspace-community) | M5 |
| +1 | `scholarspace-identity` | ⭐ 登录注册 | [hidari123/scholarspace-identity](https://github.com/hidari123/scholarspace-identity) | **M1 进行中** |

### 3.3 B 类底座服务（住主仓 `packages/services/`）

| 包名 | 中文 | 语言 | 阶段 |
|---|---|---|---|
| `auth` | 鉴权 + 角色 + 管理员 | Python | M1 |
| `llm` | 模型网关 | Python | M1 |
| `storage` | 对象存储 | Python | M1 |
| `events` | 事件总线 | Python | M1 |
| `billing` | 计费账本 | Python | M5 |
| `federation` | ActivityPub 联邦 | Python | M5+ |

### 3.4 共享底座（住在主仓，发布成包被独立仓消费）

| 包名 | 中文 | 语言 | 消费方 | 发布 |
|---|---|---|---|---|
| `@scholarspace/ui` | 共享组件库 | TypeScript | 所有前端子项目 | npm（私有源）|
| `scholarspace-core` | 核心底座 | Python | 所有后端子项目 | PyPI（私有源）|
| `packages/conventions` | 规范唯一来源 | 配置 | 所有子项目 | `cli sync` 复制 |
| `contracts/` | 契约唯一来源 | OpenAPI | 所有子项目 | codegen 生成 |

> ⚠️ **`ui` 与 `core` 不是独立仓**，而是住在主仓、以发布包形式被消费 ——
> 独立仓 clone 出来加个依赖即可用，同时版本受控、不会各造各的。
> 详见 [12-独立仓与共享UI设计.md](./12-独立仓与共享UI设计.md)。

### 3.5 工具

| 工具 | 说明 |
|---|---|
| `@scholarspace/cli` | 平台工具链 —— 内核命令 + 各仓插件 |
| `tools/codegen` | 契约 → 代码 + 发布前检查 |
| `tools/guards` | 架构护栏 |

### 3.6 冻结

| 包 | 状态 |
|---|---|
| `scholar-pdf-viewer` | ❄️ **冻结** —— M7 收编，**不要动** |

---
## 4. 依赖拓扑

```
                    ┌──────────┐
                    │   core   │  ← 谁都能依赖
                    └────┬─────┘
                         │
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
      auth             llm             storage
        │                │                │
        └────────────────┴──────┬─────────┘
                                ▼
                          ┌───────────┐
                          │  events   │
                          └─────┬─────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
    billing                  paper                  community ──► federation
        │                       │                       │
        │                       ▼                       │
        │                  insight（合并入 paper）      │
        │                       │                       │
        └───────────┬───────────┴───────────────────────┘
                    ▼
                 slides
                    │
                    ▼
              orchestra

    +--------------+
    |  identity    | <-- 独立发出 UserRegistered 事件，谁需要谁订阅
    +--------------+
```

**规则**：
- `core` 不依赖任何业务包
- `billing` 不依赖业务包（业务包依赖 billing）
- `slides` 只依赖 `core` + `llm` + `events`，**不依赖** `paper`/`community`（通过 DTO 传入内容）
- `orchestra` 依赖 `core` + `llm` + `events`
- `community` 不依赖 `paper`（只通过 ID 引用）
- **`identity` 不依赖主仓任何东西** —— 它必须能独立复用
- 跨包禁止摸内部实现

---

## 5. 技术栈（统一，不可混用）

| 层 | 选型 |
|---|---|
| 后端运行时 | Python 3.13 + uv |
| Web 框架 | FastAPI |
| 校验/配置 | Pydantic v2 + pydantic-settings |
| ORM / 迁移 | SQLAlchemy 2.0 async + Alembic |
| 数据库 | PostgreSQL 17 + pgvector |
| 缓存 / 队列 | Redis 8 + arq（Port 抽象，可换 Temporal） |
| 对象存储 | MinIO（S3 兼容）|
| HTTP / 日志 / 追踪 | httpx / structlog / OpenTelemetry |
| 测试 | pytest + hypothesis + schemathesis |
| Lint / 类型 | ruff + mypy --strict |
| 前端 | React 19 + Vite 7 + TypeScript 5.9 |
| 路由 / 数据 / 表单 | React Router 7 / TanStack Query v5 / TanStack Form + Zod v4 |
| 样式 | Tailwind v4（仅布局） + AntD v5（组件）|
| 状态 / 拖拽 / 表格 | Zustand v5 / dnd-kit / TanStack Table v8 |
| 富文本 | Tiptap |
| 前端 Lint / 类型 | Biome + tsc --strict |
| 前端测试 | Vitest 3 + Playwright |
| 编排 / 契约 | orval + datamodel-codegen |
| 观测 / 部署 | OTel + Grafana + Loki / Docker + K8s + Traefik |

**被淘汰的旧技术**：

| 旧 | 原因 |
|---|---|
| Flask | 统一到 FastAPI |
| SQLite | 统一到 PostgreSQL |
| MySQL | 统一到 PostgreSQL（社区 follow/时间线需要）|
| styled-components | 移除，改 AntD token + Tailwind 布局类 |
| MUI | 移除（早已被 AntD 替换）|
| react-quill | 已停维护 → Tiptap |
| emoji-mart v3 | 与 v5 冲突 → 统一版本 |
| antd-img-crop | 无人维护 → 自研 |
| ESLint + Prettier | → Biome |
| Celery | 太重 → arq（Port 抽象）|
| valtio + Context 混用 | → Zustand v5 |

---

## 6. 路线图（24 周）

| 阶段 | 内容 | 工期 | 状态 |
|---|---|---|---|
| **M0 地基** | `conventions` + `ui` + `contracts` + `core` + `cli` + `guards` | 4 周 | ✅ |
| **M1 样板** | `identity`（独立仓）+ `auth` + `llm` | 2 周 | 🔄 进行中 |
| **M2** | `orchestra` | 5 周 | ⬜ |
| **M3** | `slides` | 5 周 | ⬜ |
| **M4** | `paper` | 4 周 | ⬜ |
| **M5** | `community` + `federation` + `billing` | 4 周 | ⬜ |
| **M6** | `web` + 网关 + worker + 观测 | 3 周 | ⬜ |
| **M7** | 旧系统下线 + 数据迁移 + 收编 pdf-viewer | 2 周 | ⬜ |

详见 [10-迁移路线.md](./10-迁移路线.md)。

---

## 7. 关键决策速查

| 决策 | 结论 | ADR |
|---|---|---|
| Monorepo vs Polyrepo | **Polyrepo**（每个子项目独立发布） | ADR-0001 |
| 组件库 | **AntD v5 基座 + 自研 `packages/ui`（15%）** | ADR-0002 |
| 样式系统 | Tailwind v4（布局）+ AntD（组件），禁 styled-components | ADR-0003 |
| 后端框架 | **FastAPI**（统一） | ADR-0004 |
| 数据库 | **PostgreSQL 17 + pgvector** | ADR-0005 |
| 语言体系 | 界面语言 12 种 + 内容语言 20 种 + 运行时自定义 | ADR-0006 |
| 主题机制 | AntD Token + 品牌配置 5 级来源 | ADR-0007 |
| PPT 渲染 | 矢量式为主（python-pptx，可编辑），图像式可选 | ADR-0008 |
| 编排包命名 | `orchestra` | ADR-0009 |
| 社区路线 | 自研 + 对齐 Mastodon schema/API；联邦独立成包 | ADR-0010 |
| 规范载体 | `packages/conventions/` 可执行配置 | ADR-0011 |
| 脚手架 | TypeScript CLI（`pnpm dlx`） | ADR-0012 |
| License 策略 | 全部重写不拷贝；CI license 门禁 | ADR-0013 |
| 迁移方式 | 双轨并行 + 网关映射，按域灰度 | ADR-0014 |
| 共享底座发布 | `ui`→npm / `core`→PyPI，住主仓 | ADR-0015 |
| **仓库结构** | **4+1+1** —— 4 业务仓 + identity + B 类住主仓 | ADR-0016 |
| **管理员体系** | 名单存自有库 + 签名 header + 强制审计 | ADR-0017 |
