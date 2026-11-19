# scholarspace

> 平台级学术工作空间 —— 读论文 → 懂论文 → 出成果。
>
> **4+1+1** 独立仓 + 1 个组装主项目。Polyrepo 架构，契约先行，规范可执行。

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
| 管理员体系设计 | [packages/services/README.md](./packages/services/README.md) |
| 写一个 CLI 插件 | [cli/docs/plugin.md](./cli/docs/plugin.md) |

---

## 仓库布局（4+1+1）

```
scholarspace/                    ← 主项目（组装层 · 零业务代码）
├── packages/
│   ├── conventions/             规范唯一来源（可执行配置片段）
│   ├── ui/                      设计系统（AntD 基座 + 品牌主题 + i18n）⭐npm
│   ├── core/                    共享 Python 底座 ⭐PyPI
│   └── services/                B 类底座服务
│       ├── auth/                角色 / 权限 / 内部 JWT / 管理员判定
│       ├── llm/                 多模型接入 / 路由 / 成本核算
│       ├── storage/             对象存储抽象
│       ├── events/              事件总线 + SSE
│       ├── billing/             账本 + 额度
│       └── federation/          跨实例互联
├── contracts/                   OpenAPI + JSON Schema + i18n schema
├── apps/                        gateway / web
├── infra/                       Docker / K8s / 观测 / CI 模板
├── docs/                        ⭐ 全部规划文档
├── tools/codegen/               契约 → 代码
├── tools/guards/                架构护栏
├── versions/                    兼容矩阵
└── cli/                         🛠️ 平台工具链（内核 + 插件）
```

---

## 独立仓（4+1）

> 全部在 [github.com/hidari123](https://github.com/hidari123) 下。

| 仓库 | 一句话 | 阶段 |
|---|---|---|
| [scholarspace-identity](https://github.com/hidari123/scholarspace-identity) | ⭐ 登录注册（邮箱必绑 + 微信/Google/GitHub）| **M1 进行中** |
| [scholarspace-slides](https://github.com/hidari123/scholarspace-slides) | ⭐ PPT 引擎（规划→排版→可编辑 pptx）| M3 |
| [scholarspace-orchestra](https://github.com/hidari123/scholarspace-orchestra) | ⭐ 编排引擎（Flow 图 + 运行时 + 节点市场）| M2 |
| [scholarspace-community](https://github.com/hidari123/scholarspace-community) | 学术社区（自研）| M5 |
| [scholarspace-paper](https://github.com/hidari123/scholarspace-paper) | 论文检索/文献库/问答 | M4 |

**判据**：能独立部署给别人用 → 独立仓；只是平台内部支撑 → 主仓 `packages/services/`。

---

## 当前状态

| 阶段 | 状态 |
|---|---|
| 规划文档 | ✅ 完成（13 主文档 + 16 ADR）|
| 待确认项 | ⏳ 16 项（见 [docs/MANIFEST.md](./docs/MANIFEST.md)）|
| **M0 地基** | ✅ **完成**（8 Step 全绿，179 tests）|
| **M1 样板** | 🔄 **进行中** —— identity 仓 4 个包完成（139 tests）|
| 代码总量 | ✅ 318 tests |

---

## 核心原则

1. **只借鉴，不复制** —— 参考项目只取思路与算法，不拷贝源码（避开 AGPL）
2. **契约先行** —— OpenAPI 定义在 `contracts/`，代码生成，不手写 DTO
3. **依赖倒置** —— 领域层零外部依赖，外部系统走 Port
4. **规范可执行** —— 规范是配置不是文档，脚手架继承，CI 校验
5. **可替换** —— LLM / 存储 / 队列 / 渲染器全走 Port
6. **单轨优先** —— 每个子项目投产前完成自研重写
7. **身份与业务分离** —— identity 只管「你是谁」，业务数据在别的包
8. **身份标识用稳定值** —— 微信用 openid 不用昵称（昵称会变）

---

## 快速上手

```bash
# 主仓
pnpm install
pnpm run verify

# 新建一个独立仓
node cli/dist/cli.js new scholarspace-xxx --template python-service --target C:\work

# 在自己的仓里同步规范基座
node C:\work\scholarspace\cli\dist\cli.js sync --kind python

# 跑完整质量门禁
node C:\work\scholarspace\cli\dist\cli.js verify
```
