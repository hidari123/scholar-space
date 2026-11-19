# ADR-0016：仓库结构收敛与身份服务独立

- **状态**：已接受
- **日期**：2026-11-19
- **相关**：[ADR-0001 Polyrepo](./0001-polyrepo.md)、[ADR-0015 共享底座发布](./0015-shared-base-publishing.md)

---

## 背景

M0 完成后复查仓库结构，发现三个问题：

### 问题 1：13 个仓对「底座类子项目」是过度拆分

ADR-0001 定的 13 个仓里，有两类：

| 类型 | 仓库 | 特点 |
|---|---|---|
| **A. 核心差异化** | `slides` `orchestra` `community` `paper` | 用户能感知；有独立产品价值；可能单独开源 |
| **B. 底座类** | `auth` `llm` `storage` `events` `billing` `federation` | 用户感知不到；只被平台内部消费 |

**B 类拆成独立仓，成本很实在**：

| 成本 | 具体表现 |
|---|---|
| 仓数量 | 13 个仓，每个都要 CI 配置、版本号、CHANGELOG、发布流程 |
| 跨仓联调 | 本地开发要拉 13 个仓 |
| 版本矩阵 | `paper` 依赖 `auth@0.2` + `storage@0.3` + `events@0.1`…… 组合爆炸 |
| 契约同步 | 改契约要跨仓提 PR —— 而 B 类恰恰与 `conventions` 耦合最深（分层要匹配 import-linter 契约），最容易漂移 |

**B 类的收益接近零** —— 「JWT 签发器能单独给别人用」不是真实需求。

### 问题 2：CLI 的定位错位

原话：**「我是希望我们这个项目的独立仓库都能利用起来这个的」**

但 M0 的 CLI 只提供 `new` / `sync` / `check` —— **只在建仓那一刻和规范变更时有用**，仓建好之后对日常开发几乎不参与。

### 问题 3：登录注册被埋在业务里

旧系统 `scholar-club-backend/routers/login_email_router.py` **1720 行**，`ACCOUNT` 表把身份和业务混在一起：

```python
class AccountModel(Base):
    ACCOUNT_ID, UID, GOOGLE_ID, WECHAT_ID, ...        # 身份
    MASTODON_ID, MASTODON_PASSWORD,                     # 社区账号
    LIFESTUDIO_USER_ID, LIFESTUDIO_USER_APIKEY, ...     # 第三方服务
    LITELLM_PAY_KEY, LITELLM_PAY_BUDGET_ID, ...         # 计费密钥
```

**这是「登录注册该独立」的最强论据** —— 身份与业务耦合是旧系统最大的技术债之一。

---

## 决策

### 决策 1：仓库结构收敛为 4+1+1

```
scholarspace/                       主仓（组装层 + 共享底座）
├── packages/
│   ├── conventions/                规范唯一来源
│   ├── ui/                         共享设计系统      → npm
│   ├── core/                       共享 Python 底座  → PyPI
│   ├── contracts/                  契约唯一来源
│   └── services/                   ★ B 类底座服务住这里
│       ├── auth/                   平台内身份与授权
│       ├── llm/                    模型网关
│       ├── storage/                对象存储
│       ├── events/                 事件总线
│       ├── billing/                计费
│       └── federation/             ActivityPub
├── apps/                           组装应用
├── cli/                            平台工具链（内核 + 插件）
└── tools/{codegen,guards}/

scholarspace-slides/                ★ A 类独立仓 —— PPT 引擎
scholarspace-orchestra/             ★ A 类独立仓 —— Flow 编排
scholarspace-community/             ★ A 类独立仓 —— 学术社区
scholarspace-paper/                 ★ A 类独立仓 —— 文献研究
scholarspace-identity/              ★ A 类独立仓 —— 登录注册
scholar-pdf-viewer/                 已有，冻结中（M7 收编）
```

**B 类住主仓 ≠ 不能独立用**：

| 诉求 | B 类住主仓后是否满足 |
|---|---|
| 能装到别的项目用 | ✅ 按独立包组织，照样发 PyPI |
| 能单独发版 | ✅ 有独立 `pyproject.toml` |
| 四层结构与护栏 | ✅ import-linter 契约照常生效 |
| 独立 CI | ✅ 用子仓 CI 模板（主仓内用主仓 CI）|

**关键澄清**：用户要的「独立仓单独能用」指的是 **PPT 引擎、登录服务**这类用户可感知的东西 —— 都在 A 类。

### 决策 2：`scholarspace-identity` 独立成仓

**登录注册 = 独立仓 `scholarspace-identity`**

```
scholarspace-identity/
├── libs/
│   ├── identity-core/               纯领域：User / Identity / Credential / Policy / 事件
│   ├── identity-flows/              Stage 引擎（借鉴 authentik 的 stage/policy 思想）
│   ├── identity-providers/          email_password / oauth2_wechat / oauth2_google / oauth2_github / sms
│   └── identity-http/               FastAPI 实现（可嵌入）
├── apps/
│   └── identity-server/             独立部署版（可选）
└── ui/                              登录/注册前端组件
```

**用户表存 identity 仓自己的库（独立 schema）** —— 这样 identity 才能真正「复用到别的项目」：别的项目不可能去读 scholarspace 的主库。

**跨库访问**：scholarspace 侧通过 API 或事件订阅，不直接读库。

### 决策 3：只借鉴 authentik 的 stage/policy 架构思想

**借鉴的（架构思想）**：

| authentik | 我们的实现 |
|---|---|
| Stage 流程 | `identity-flows/stages/` —— 输入输出 `StageContext` |
| Policy | `identity-core/policy.py` —— 「邮箱必绑」= 一条 Policy，不写死在代码里 |
| Event + 钩子 | `identity-core/events.py` —— 注册完成发事件，下游订阅 |

**不借鉴的**：

| authentik | 原因 |
|---|---|
| 完整 OAuth2/OIDC IdP（给第三方应用签发 token）| 工作量 ×3，首批不需要 |
| Source / Provider 分离 | 我们不存 LDAP，直接 User + Identity + Credential 三层 |
| Outpost（独立进程跑 provider）| 我们的 provider 都是纯 HTTP 调用，不需要独立进程 |

### 决策 4：首批支持的登录方式

| 方式 | 阶段 | 邮箱处理 |
|---|---|---|
| 邮箱 + 密码 | P0 | 验证后完成 |
| **微信扫码**（开放平台网站应用，`snsapi_login`）| P0 | ⚠️ 微信不给邮箱 → **强制补邮箱并验证** |
| Google | P1 | `email` scope 取邮箱，验证即可 |
| GitHub | P1 | `user:email` scope；无邮箱则要求补 |
| 手机号 + 验证码 | P2 | 需短信服务商 |

**「邮箱必绑」用 Policy 实现**，不写死在代码里 —— 不同租户可以配不同策略。

### 决策 5：CLI 重构为「内核 + 插件」

```
cli/
├── src/
│   ├── core/                        ★ 内核：所有仓通用
│   │   ├── sync.ts                  规范基座同步
│   │   ├── check.ts                 探测失效的 extends
│   │   ├── contract.ts              契约 pull / diff / generate
│   │   ├── release.ts               check / bump / publish / tag
│   │   ├── quality.ts               lint / test / verify 统一入口
│   │   └── plugin.ts                ★ 插件发现与加载
│   ├── commands/                    内置命令
│   └── templates/                   建仓模板
```

**插件机制** —— 各仓在自己的 `package.json` 声明：

```jsonc
{
  "name": "@scholarspace/slides",
  "scholarspace": {
    "commands": "./src/cli-commands.ts"
  }
}
```

```bash
# 在任意独立仓里
npx @scholarspace/cli verify       # 内核：通用质量门禁
npx @scholarspace/cli deck:new foo  # 插件：slides 自己的命令
npx @scholarspace/cli list          # 列出「内核命令 + 本仓命令」
```

**通用能力在内核（改一次所有仓受益），领域命令在各仓自治（改 PPT 不影响社区）。**

### 决策 6：`identity` 与 `auth` 的分工

两者不是一回事：

```
identity（独立仓）              auth（主仓 packages/services/auth）
├ 你是谁                        ├ 你的角色（admin / editor / viewer）
├ 你的登录方式                  ├ 你的权限（能访问哪些资源）
├ 邮箱/手机号是否验证    ├ 你的配额与额度
└ 你的会话                      └ 签发平台内部 token（JWT）
```

**identity 是「登录注册」，auth 是「平台内的身份与授权」。**
identity 发 `UserRegistered` 事件 → auth 订阅 → 建内部账号。

---

## 理由

### 为什么不是 13 仓

B 类住主仓的收益：
- 仓数量 13 → 6（主仓 + 5 个 A 类）
- 规范演进：改 `conventions` → 主仓内直接改，不用跨仓提 PR
- 本地联调：拉 6 个仓而不是 13 个

### 为什么 identity 该独立而 auth 不该

- **identity** 用户直接感知，且**可复用到别的项目**（用户明确要求）→ A 类
- **auth** 只管平台内授权，用户不感知 → B 类

### 为什么借鉴 authentik 思想但不实现完整 IdP

完整 OAuth2/OIDC IdP（给第三方应用签发 token、支持 SP/DP 模式、密钥轮换…）工作量 ×3，
首批不需要。我们只需要「一个可嵌入的登录组件库 + 一个可独立部署的认证服务」。

**「借鉴架构思想，不抄实现」** —— 与全项目原则一致。

### 为什么微信首批做

- 已有可用的 AppID/Secret（用户确认）
- scholarclaw 已验证 `snsapi_login` 流程可行
- 国内用户占多数
- 但**必须修 scholarclaw 的两个问题**：state 校验缺失（CSRF）、JWT 密钥硬编码兜底（泄露）

---

## 后果

### 正面

- 仓数量从 13 降到 6，联调与版本矩阵成本大降
- 登录注册成为真正可复用的独立资产
- CLI 从「建仓脚本」升级为「平台工具链」，所有独立仓都能用
- identity 与业务彻底解耦（事件驱动），不再有 `ACCOUNT` 表混装计费密钥的老问题

### 负面

- B 类服务的代码在主仓，主仓变重
- 「独立仓」的边界需要持续维护（新增服务时先问：用户能感知吗？能单独用吗？）
- CLI 插件机制增加了一层复杂度

### 风险与缓解

| 风险 | 缓解 |
|---|---|
| 主仓过大 | B 类按独立包组织，各自有 `pyproject.toml`，可随时拆出 |
| 插件加载失败 | 插件加载失败降级为「只跑内核命令」并警告，不阻断 |
| identity 跨库查询性能 | billing 等通过 API/事件获取用户信息，不做跨库 JOIN |
| 微信 AppID 泄漏 | 只存服务端，前端不硬编码（修 scholarclaw 的问题）|

---

## 待办

| # | 事项 | 何时 |
|---|---|---|
| 1 | 建 GitHub Org + 5 个空仓（slides/orchestra/community/paper/identity）| M1.1 |
| 2 | CLI 重构为内核 + 插件 | M1.0 |
| 3 | `scholarspace-identity` 仓骨架 + 规范同步 | M1.2 |
| 4 | identity-core / flows / providers / http | M1.2 - M1.4 |
| 5 | 微信 provider（含 state 校验）| M1.2 |
| 6 | Google / GitHub provider | M1.3 |
| 7 | 邮箱必绑 Policy | M1.2 |
| 8 | identity 前端登录组件 | M1.4 |
