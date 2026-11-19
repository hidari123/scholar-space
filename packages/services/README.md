# packages/services —— B 类底座服务

> **这些是内部服务，不是用户可见的产品。**

---

## 为什么要住主仓

| 类别 | 例子 | 住哪 | 原因 |
|---|---|---|---|
| **A 类**（用户可见） | slides / orchestra / community / paper / identity | **独立仓** | 要能单独部署、单独发版、单独复用 |
| **B 类**（内部底座） | auth / llm / storage / events / billing / federation | **主仓** `packages/services/` | 跟主仓强耦合，一起发版更省事 |

**判据**：这个服务能独立部署给别人用吗？
- 能 → A 类 → 独立仓
- 不能，它只是平台内部的支撑 → B 类 → 主仓

---

## 已有的 B 类服务

| 服务 | 职责 | 状态 |
|---|---|---|
| `auth/` | 角色 / 权限 / 内部 JWT 签发 / 管理员判定 | 🔜 待建 |
| `llm/` | 多模型接入 / 路由 / 成本核算 | 🔜 待建 |
| `storage/` | MinIO 对象存储封装 | 🔜 待建 |
| `events/` | 领域事件总线 / 订阅 | 🔜 待建 |
| `billing/` | 配额 / 账本 / 计费 | 🔜 待建 |
| `federation/` | 跨实例互联 | 🔜 待建 |

---

## 与 A 类仓的关系

```
                    ┌─────────────────────────┐
                    │   主仓 scholarspace       │
                    │  ┌───────────────────┐  │
                    │  │  packages/services │  │
                    │  │   auth / llm / ... │  │
                    │  └───────────────────┘  │
                    │  ┌───────────────────┐  │
                    │  │  packages/ui      │  │  ← 共享设计系统（npm）
                    │  │  packages/core    │  │  ← 共享 Python 底座（PyPI）
                    │  └───────────────────┘  │
                    └────────────┬────────────┘
                                 │ HTTP / 事件
        ┌────────────┬───────────┼───────────┬────────────┐
        │            │           │           │            │
   ┌────▼────┐ ┌─────▼─────┐ ┌───▼────┐ ┌──▼─────┐ ┌────▼─────┐
   │ slides  │ │ orchestra │ │community│ │ paper  │ │ identity │
   │ (独立仓) │ │ (独立仓)  │ │(独立仓) │ │(独立仓)│ │ (独立仓)  │
   └─────────┘ └───────────┘ └────────┘ └────────┘ └──────────┘
```

**关键**：`identity` 独立仓**不依赖** `packages/services/auth`。
它只负责「你是谁」，签发用户身份；
`auth` 负责「你能做什么」，消费 identity 的事件建内部账号。

---

## 每个服务的分层

跟 `packages/core` 一样，四层：

```
domain/          零外部依赖
application/     domain + ports（Protocol）
infrastructure/  实现 ports
interfaces/      薄的 HTTP 层
```

**护栏**（由 `tools/guards` 强制）：
- `G2` 领域层零外部依赖
- `G4` interfaces 层不直接依赖 infrastructure（要用 `dependency_overrides`）
- `G11` 跨服务调用走契约，不直接 import

---

## 待建：auth 服务（管理员体系）

用户需求：**「这个大项目我需要一个管理员」**

参考 `C:\work\nanobuddy` 的实现，但要补上它的短板。

### nanobuddy 的做法

```
① 判定：OIDC group claim（ATOMOS_API_ADMIN_GROUP=atomos-admins）
② 传递：网关注入 X-AtomOS-Admin: true
③ 校验：下游服务 _admin(value) 检查 header
```

### 它的两个短板

| 短板 | 问题 | 我们的做法 |
|---|---|---|
| 管理员绑死在 IdP group | 加/撤管理员要改 IdP 配置，无审计 | 管理员名单存**我们自己的库**，IdP 只管认证 |
| admin header 明文传递 | 能直连后端就能伪造 | 加 **HMAC 签名** + 时间戳 |

### 我们的设计

```
┌────────────────────────────────────────────────┐
│  identity 仓（独立）                              │
│  签发 token：{ sub: user_id, roles: [...], exp }  │
└───────────────────┬────────────────────────────┘
                    │ 网关验证 token
┌───────────────────▼────────────────────────────┐
│  auth 服务（主仓 packages/services/auth）          │
│  · 查 AdminGrant 表 → 得出真实角色                 │
│  · 签发内部 JWT（含 roles）                        │
│  · 注入签名 header 给下游                         │
└───────────────────┬────────────────────────────┘
                    │
┌───────────────────▼────────────────────────────┐
│  下游服务（billing / paper / slides / ...）        │
│  Depends(require_admin) → 验签 + 查角色 → 执行     │
└────────────────────────────────────────────────┘
```

### 签名 header 格式

```
X-Scholar-User-Id: <uuid>
X-Scholar-Roles: admin,editor
X-Scholar-Ts: <unix ts>
X-Scholar-Sig: <HMAC-SHA256(user_id:roles:ts, GATEWAY_SECRET)>
```

校验三件事：
1. 时间戳不能太旧（防重放，窗口 60 秒）
2. HMAC 必须匹配（防伪造）
3. roles 里必须有 `admin`

### 管理员能看到什么

| 模块 | 能看 | 能做 |
|---|---|---|
| **用户** | 列表 / 详情（注册方式、邮箱验证状态、活跃度）| 封禁 / 解封 / 删除 / 重置密码 |
| **租户** | 机构列表 / 配额 / 品牌配置 | 改配额 / 改品牌色 |
| **计费** | 余额 / 流水 / 费率 | 调整余额 / 改费率 / 手工调账 |
| **内容审核** | 被标记的论文 / PPT / 评论 | 通过 / 驳回 / 下架 |
| **任务** | Flow 运行记录 / PPT 生成任务 | 查看 / 重跑 / 取消 |
| **模型** | 模型配置 / 成本 | 改配置 / 启停 / 换默认模型 |
| **系统** | 服务健康 / 队列积压 / 错误率 | 只读 |
| **审计** | 管理操作日志 | 只读 |

**原则**：管理员能操作业务数据，但**不能看用户的私密内容**（论文正文、PPT 内容）——
除非是内容审核场景，且只看到被标记的那一份的快照。

### 审计日志（nanobuddy 缺这个）

```python
@dataclass
class AdminAction:
    actor_id: UUID
    action: str            # "user.suspend" / "billing.adjust" / "content.takedown"
    target_type: str
    target_id: str
    reason: str            # ⚠️ 必填 —— 让操作可解释
    metadata: dict[str, Any]
    occurred_at: datetime
```

⚠️ **强制填 reason** —— nanobuddy 的管理员操作没要求填原因，出了事查起来很痛苦。

### 待确认的 4 件事

| # | 问题 | 建议 |
|---|---|---|
| 1 | 管理员是全局还是租户内？ | 两者都要：平台管理员 + 租户管理员（学术 SaaS 必然是租户制）|
| 2 | 管理员能看用户的论文/PPT 内容吗？ | 默认**不能**，只在内容审核时看被标记的那份快照 |
| 3 | 封禁用户怎么做？ | `UserStatus`（active/suspended/deleted）+ 网关每次请求校验，**不是**删人 |
| 4 | 管理员账号怎么进？ | 复用 identity 正常注册，由**另一个管理员**授予 admin 角色；⚠️ 第一个 admin 从环境变量/初始化脚本产生（避免自举漏洞）|

---

## 相关

- [ADR-0016](../../docs/adr/0016-repo-layout-and-identity.md) —— 4+1+1 布局
- [项目地图](../../docs/00-项目地图.md)
- [架构护栏](../../docs/06-架构护栏.md)
