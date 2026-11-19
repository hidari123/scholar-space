# scholarspace-auth

> 平台鉴权与管理员服务 —— 角色 / 权限 / 网关签名 / 审计。

---

## 这是什么

回答的是「**你能做什么**」，不是「你是谁」。

```
identity 仓（独立）  →  「你是谁」   → User / Identity / Credential
auth 服务（本包）    →  「你能做什么」→ Role / Permission / AdminGrant
```

**职责边界很重要** —— identity **不需要知道** auth 的存在；
auth 通过消费 identity 的 `UserRegistered` 事件建内部账号。

---

## 三个关键设计

### ① 管理员身份不可伪造

nanobuddy 用**明文 header** 传管理员身份：

```go
r.Header.Set("X-AtomOS-Admin", "true")
```

它自己的文档写明了这个风险：

> "Directly supplying those headers to an Agent server for ordinary
> application traffic forges identity."

**只要能直连后端，就能当管理员。** 我们用签名解决：

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
| 3 | user_id 一致 | 串号 |

⚠️ **未来时间戳也拒绝** —— 否则能签一个「永远不过期」的。

### ② 租户隔离在数据层强制

```python
scope = TenantScope(tenant_id="tenant-a")
scope.require(target_tenant_id)   # 跨租户 → PermissionError
```

⚠️ 不能只靠应用层过滤 —— 漏一个 `WHERE tenant_id = ?` 就是越权。

| 角色 | 作用域 |
|---|---|
| `platform_admin` | 所有租户（隐含全部权限）|
| `tenant_admin` | 仅自己的租户 |

### ③ 审计与业务操作绑死

不是「记得记审计」，而是「**不记审计就做不成**」：

```python
grant = await grants.grant(grant)
await audit.record(AdminAction(...))   # ← 用例内部，调用方绕不过
```

⚠️ nanobuddy 的管理员操作**没要求填原因** —— 出了事只能靠翻日志猜。
我们强制 `reason` 非空，空字符串直接抛异常。

```python
@dataclass
class AdminAction:
    action: AdminActionType
    actor_id: UUID
    target_type: str
    target_id: str
    reason: str            # ⚠️ 必填 —— 空则抛 ValueError
    result: AdminActionResult
    metadata: dict[str, Any]
    occurred_at: datetime
```

---

## 三道授权红线

| # | 规则 | 为什么 |
|---|---|---|
| 1 | **不能给自己授权** | 能给自己升权就等于没有权限系统 |
| 2 | **不能给自己封禁** | 否则平台可能没人能管（nanobuddy 也这么做）|
| 3 | **租户管理员不能授平台管理员、不能跨租户** | 防止权限横向扩散 |

---

## 权限点清单

| 模块 | 权限点 |
|---|---|
| 用户 | `user.read` `user.suspend` `user.delete` |
| 租户 | `tenant.read` `tenant.update` |
| 计费 | `billing.read` `billing.adjust` |
| 内容审核 | `content.review` `content.takedown` |
| 任务 | `job.read` `job.retry` |
| 模型 | `model.read` `model.update` |
| 系统 | `system.read` |
| 审计 | `audit.read` |

---

## 目录

```
src/scholar_auth/
├── domain/               纯领域，零外部依赖
│   ├── models.py         Role / Permission / Principal / AdminGrant / TenantScope
│   ├── audit.py          AdminAction / AdminActionType
│   └── gateway.py        网关签名生成与校验
├── application/
│   ├── ports.py          存储端口（Protocol）
│   └── use_cases.py      grant_role / revoke_role / suspend_user / ...
├── infrastructure/
│   └── memory.py         内存实现（开发/测试）
└── interfaces/           HTTP 层（待建）
```

---

## 用法

```python
from scholar_auth import (
    GrantRoleRequest, RoleName, build_principal_for, grant_role,
)

# 从存储构造主体
principal = await build_principal_for(user_id, grants, accounts)

# 授予角色（自动写审计）
result = await grant_role(
    GrantRoleRequest(
        target_user_id=target_id,
        role=RoleName.TENANT_ADMIN,
        tenant_id="tenant-a",
        reason="新同事入职",
    ),
    principal,
    grants,
    accounts,
    audit,
)
```

---

## 质量门禁

```bash
uv venv --python 3.13
uv pip install -e ".[dev]" --no-deps
uv pip install pytest pytest-asyncio ruff mypy

.venv/Scripts/ruff.exe check src/ tests/
.venv/Scripts/mypy.exe src/
.venv/Scripts/python.exe -m pytest tests/ -q
```

---

## 相关

- [ADR-0017：管理员体系](../../../docs/adr/0017-admin-system.md) —— 决策依据
- [packages/services/README.md](../README.md) —— B 类底座服务总览
