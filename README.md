# scholarspace

> 平台级学术工作空间 —— 读论文 → 懂论文 → 出成果。
>
> 13 个独立子项目 + 1 个组装主项目。Polyrepo 架构，契约先行，规范可执行。

---

## 快速导航

| 我想看… | 去这里 |
|---|---|
| 整体架构与项目总表 | [docs/README.md](./docs/README.md) |
| 完整文档清单 | [docs/MANIFEST.md](./docs/MANIFEST.md) |
| 架构决策记录 | [docs/adr/](./docs/adr/) |
| 执行步骤与里程碑 | [docs/11-执行计划.md](./docs/11-执行计划.md) |
| 代码规范 | [docs/05-代码规范.md](./docs/05-代码规范.md) |
| CI 护栏清单 | [docs/06-架构护栏.md](./docs/06-架构护栏.md) |

---

## 仓库布局

```
scholarspace/                    ← 主项目（组装层）
├── packages/
│   ├── conventions/             规范唯一来源（可执行配置片段）
│   ├── ui/                      设计系统（AntD 基座 + 品牌主题 + i18n）
│   └── core/                    核心底座
├── contracts/                   OpenAPI + JSON Schema + i18n schema
├── apps/                        gateway / web / slides-web / orchestra-web / worker
├── infra/                       Docker / K8s / 观测 / CI 模板
├── docs/                        ⭐ 全部规划文档
├── tools/codegen/               契约 → 代码
├── versions/                    兼容矩阵
└── cli/                         🛠️ 项目脚手架

独立仓库（13）：
scholarspace-core       scholarspace-auth      scholarspace-llm
scholarspace-storage    scholarspace-events    scholarspace-billing
scholarspace-paper      scholarspace-slides    scholarspace-orchestra
scholarspace-community  scholarspace-federation
scholarspace-ui         scholarspace-pdf-viewer
```

---

## 当前状态

| 阶段 | 状态 |
|---|---|
| 规划文档 | ✅ 完成（11 主文档 + 14 ADR）|
| 待确认项 | ⏳ 16 项（见 [docs/MANIFEST.md](./docs/MANIFEST.md)）|
| M0 地基 | ⬜ 未开始 |

---

## 核心原则

1. **只借鉴，不复制** —— 参考项目只取思路与算法，不拷贝源码（避开 AGPL）
2. **契约先行** —— OpenAPI 定义在 `contracts/`，代码生成，不手写 DTO
3. **依赖倒置** —— 领域层零外部依赖，外部系统走 Port
4. **规范可执行** —— 规范是配置不是文档，脚手架继承，CI 校验
5. **可替换** —— LLM / 存储 / 队列 / 渲染器全走 Port
6. **单轨优先** —— 每个子项目投产前完成自研重写
