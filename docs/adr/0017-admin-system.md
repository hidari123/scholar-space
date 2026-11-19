# ADR-0017：管理员体系

> 状态：**已接受**（4 项待确认已全部拍板 —— 2026-11-19）
> 日期：2026-11-19
> 决策者：项目负责人

---

## 背景

用户提出：**「这个大项目我需要一个管理员 你看这个管理员模式怎么加 他能看到什么」**

并指定参考 `C:\work\nanobuddy` 的实现。

本文分析 nanobuddy 的做法，指出其两个短板，给出我们的设计。

---

## 已拍板的 4 项

> 用户确认：**「建议都可以的」** —— 以下全部按建议执行。

| # | 问题 | 决策 |
|---|---|---|
| 1 | 管理员是全局还是租户内？ | **两者都要** —— 平台管理员（管所有租户）+ 租户管理员（只管自己机构）|
| 2 | 管理员能看用户的论文/PPT 内容吗？ | **默认不能**；内容审核时只给**被标记那一份的快照** |
| 3 | 封禁用户怎么做？ | **`UserStatus` + 网关每次请求校验** —— 不是删人 |
| 4 | 管理员账号怎么进？ | **复用 identity 正常注册 + 由另一个 admin 授予**；⚠️ 第一个 admin 走初始化脚本 |

---

## nanobuddy 的做法（实测）

### 判定：OIDC group claim

```go
// atomos-api/cmd/server/main.go:1213
// Group gating — allow user OR admin group.
hasAccess := false
for _, g := range claims.Groups {
    if g == s.cfg.UserGroup || g == s.cfg.AdminGroup {
        hasAccess = true
    }
}
```

```
ATOMOS_API_USER_GROUP  = atomos-users
ATOMOS_API_ADMIN_GROUP = atomos-admins
```

### 传递：网关注入 header

```go
// main.go:1375
r.Header.Set("X-AtomOS-User-Id", uid)
if isAdmin {
    r.Header.Set("X-AtomOS-Admin", "true")
}
```

### 校验：下游服务检查 header

```python
# agent-server/app/account_api.py:20
def _admin(value: str | None) -> None:
    if value != "true":
        raise HTTPException(403, "admin only")
```

### 一个值得抄的细节

```python
# 删除自己的账号时，admin header 存在 → 拒绝
if x_atomos_admin == "true":
    raise HTTPException(400, "an administrator cannot delete their own account; ...")
```

理由：管理员把自己删了，平台就没人能管了。

### 管理员能看到的（从 `frontend/src/locales/zh/admin.json` 提取）

| Tab | 内容 |
|---|---|
| 用户 | 列表 / 筛选 / 封禁 / 恢复 / 删除 / 详情 |
| 账单 | 概览 / 用户余额 / 流水 / 费率 CRUD / 预留 / 配置 |
| 技能 | 列表 / CRUD / 发布 / fork / 启停 / 重置为仓库版 |
| 模型 | 列表 / CRUD / 协议 / 思考预算 / 采样 / 上下文 / 工具支持 |
| 人设 | 人设编辑 |
| 会话 | 列表 / 导出 / 追踪详情 |
| 任务 | 执行任务列表 |
| 注册 | 允许注册域名白名单 |
| 设置 | 默认并发任务数 / 最大活跃数 / 内存配置 |

---

## 评价：两个短板

### 短板 1：管理员身份绑死在 IdP group

- 加/撤管理员要改 IdP 配置
- **没有审计** —— 谁在什么时候被授予了什么，无记录
- 无法「今天临时给客服开 admin，三天后撤销」

### 短板 2：admin header 明文传递

```go
r.Header.Set("X-AtomOS-Admin", "true")
```

nanobuddy 的 CLAUDE.md 自己写明了这个风险：

> "Directly supplying those headers to an Agent server for ordinary
> application traffic forges identity. Do not add another ingress path
> that trusts them."

也就是说：**能直连 agent-server 就能伪造管理员身份**。nanobuddy 靠
「网络隔离」防这个 —— 我们不能只靠这个。

---

## 决策

### 决策 1：管理员名单存我们自己的库

**不**用 IdP group 判定管理员。

理由：
- 需要审计（「谁在什么时候被授予了 admin」）
- 需要动态增删
- identity 仓已经有用户表了，管理员就是用户的一个**角色**

```
scholarspace-core 的 auth 服务（住主仓 packages/services/auth）
├── Role       admin / editor / viewer / tenant_admin
├── Permission 具体权限点（如 user.suspend、billing.adjust）
└── AdminGrant 谁被授予了哪个角色，什么时候，谁授予的
```

**IdP 只管认证**（「你是谁」），我们管授权（「你能做什么」）。

### 决策 2：签名 header 而非明文

```
X-Scholar-User-Id: <uuid>
X-Scholar-Roles: admin,editor
X-Scholar-Ts: <unix ts>
X-Scholar-Sig: <HMAC-SHA256(user_id:roles:ts, GATEWAY_SECRET)>
```

校验三件事：

| # | 检查 | 防什么 |
|---|---|---|
| 1 | 时间戳在 60 秒窗口内 | 重放攻击 |
| 2 | HMAC 匹配 | 伪造身份 |
| 3 | roles 含 `admin` | 越权 |

实现放 `scholar_core`（共享底座）—— 所有后端子项目直接可用。

### 决策 3：职责边界

| 服务 | 职责 |
|---|---|
| `identity`（独立仓）| 「你是谁」—— 签发用户身份，发 `UserRegistered` 事件 |
| `auth`（主仓）| 「你能做什么」—— 消费事件建内部账号，签发内部 JWT |

**identity 永远不需要知道 auth 的存在。**

### 决策 4：管理员能操作，但不能窥探

| 原则 | 说明 |
|---|---|
| 能操作业务数据 | 封禁用户、调账目、下架内容 |
| **不能看私密内容** | 论文正文、PPT 内容 —— 除非内容审核场景 |
| 审核也只看快照 | 只看被标记的那一份的快照，不给全文浏览 |

### 决策 5：强制审计，强制填原因

```python
@dataclass
class AdminAction:
    actor_id: UUID
    action: str            # "user.suspend" / "billing.adjust" / "content.takedown"
    target_type: str
    target_id: str
    reason: str            # ⚠️ 必填
    metadata: dict[str, Any]
    occurred_at: datetime
```

⚠️ nanobuddy 的管理员操作**没要求填原因** —— 出了事查起来很痛苦。
我们强制填。

### 决策 6：第一个 admin 不能自举

管理员账号的来源：

1. **第一个 admin** —— 由初始化脚本/环境变量产生
2. **后续 admin** —— 由**另一个 admin** 在管理后台授予

⚠️ 不能让管理员能自助升级 —— 那是安全漏洞。

### 决策 7：封禁不是删除

```
UserStatus: active / suspended / deleted
```

- `suspended` —— 网关每次请求校验，账号仍可恢复
- `deleted` —— 软删除 + 保留审计痕迹

**不是**在数据库里 `DELETE FROM users`。

---

## 管理员能力矩阵

| 模块 | 能看 | 能做 | 审计 | 权限点 |
|---|---|---|---|---|
| **用户** | 列表 / 详情（注册方式、邮箱验证状态、活跃度）| 封禁 / 解封 / 删除 / 重置密码 | ✅ | `user.read` `user.suspend` `user.delete` |
| **租户** | 机构列表 / 配额 / 品牌配置 | 改配额 / 改品牌色 | ✅ | `tenant.read` `tenant.update` |
| **计费** | 余额 / 流水 / 费率 | 调整余额 / 改费率 / 手工调账 | ✅ | `billing.read` `billing.adjust` |
| **内容审核** | 被标记内容的**快照** | 通过 / 驳回 / 下架 | ✅ | `content.review` `content.takedown` |
| **任务** | Flow 运行记录 / PPT 生成任务 | 查看 / 重跑 / 取消 | ✅ | `job.read` `job.retry` |
| **模型** | 模型配置 / 成本 | 改配置 / 启停 / 换默认模型 | ✅ | `model.read` `model.update` |
| **系统** | 服务健康 / 队列积压 / 错误率 | 只读 | — | `system.read` |
| **审计** | 管理操作日志 | 只读 | — | `audit.read` |

### 平台管理员 vs 租户管理员

| 角色 | 作用域 | 能做什么 |
|---|---|---|
| `platform_admin` | 所有租户 | 上表全部，含跨租户查询 |
| `tenant_admin` | 仅自己的租户 | 同上，但**查询与操作都被限制在自己租户内** |

⚠️ **租户隔离必须在数据查询层强制**，不能只靠应用层过滤 ——
漏一个 `WHERE tenant_id = ?` 就是越权。

---

## 影响

### 正向

- 审计能力 —— nanobuddy 缺的那块补上了
- 身份不可伪造 —— 明文 header 换成签名
- 动态授权 —— 不用改 IdP 配置
- 管理员职责边界清晰 —— 知道什么是「不能看的」
- 平台/租户两级角色 —— 学术 SaaS 的必然需求

### 代价

- 多一个签名机制要维护（网关与各服务的密钥轮换）
- 审计表需要 retention 策略
- 租户模型要在 `auth` 里先立起来（比纯全局 admin 复杂）
- **租户隔离要在数据层强制** —— 每个管理端查询都要带 `tenant_id` 条件

### 风险与缓解

| 风险 | 缓解 |
|---|---|
| 租户隔离漏一处 → 越权 | 数据访问层强制注入 `tenant_id`；护栏加规则检查管理端查询 |
| 管理员账号被盗 → 平台沦陷 | 强制审计 + 操作必填 reason + 敏感操作可要求二次确认 |
| 网关密钥泄露 → 身份可伪造 | 密钥轮换 + 时间戳窗口（60 秒）限制重放 |
| 第一个 admin 无人可授 | 初始化脚本从环境变量产生，且**只允许运行一次** |

---

## 相关

- [ADR-0016：仓库结构与 identity 独立仓](./0016-repo-layout-and-identity.md)
- [packages/services/README.md](../../packages/services/README.md) —— 实现位置与详细设计
- [scholar-club 旧实现的反面教材](./0014-migration-strategy.md)
