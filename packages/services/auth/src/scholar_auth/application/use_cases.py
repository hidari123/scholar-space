"""应用用例 —— 「谁能做什么」的编排。

⚠️ 关键设计：**每个写操作都强制产生审计记录**。

   不是「记得记审计」，而是「不记审计就做不成」——
   用例内部把审计和业务操作绑死，调用方想绕过都绕不过。

---

## 为什么用 `AuthContext` 而不是一堆参数

   最初的签名是 `grant_role(request, actor, grants, accounts, audit)` ——
   7 个参数，超过 ruff 的上限（5 个）。

   ⚠️ 这不是「禁用规则」能解决的 —— 参数太多本身就是设计信号：
   用例要同时依赖三个仓储，反复传它们没有意义。

   改成 `AuthContext` 把仓储打包：
   · 参数从 7 个降到 3 个
   · 依赖关系一目了然
   · 测试时构造一个 context 即可
"""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from scholar_auth.application.ports import AccountRepository, AuditRepository, GrantRepository
from scholar_auth.domain.audit import AdminAction, AdminActionResult, AdminActionType
from scholar_auth.domain.models import (
    AdminGrant,
    Principal,
    RoleName,
    TenantScope,
    UserStatus,
)

__all__ = [
    "AuthContext",
    "AuthorizationError",
    "GrantRoleRequest",
    "GrantRoleResult",
    "SelfEscalationError",
    "SuspendUserRequest",
    "build_principal",
    "build_principal_for",
    "grant_role",
    "reinstate_user",
    "revoke_role",
    "suspend_user",
]


class AuthorizationError(Exception):
    """权限不足。"""


class SelfEscalationError(AuthorizationError):
    """试图给自己授权。

    ⚠️ 这是安全红线 —— 能给自己升权就等于没有权限系统。
    """


@dataclass(frozen=True, slots=True)
class AuthContext:
    """用例上下文 —— 打包三个仓储。

    ⚠️ 用 dataclass(frozen=True) —— 上下文本身不该被改。
    """

    grants: GrantRepository
    accounts: AccountRepository
    audit: AuditRepository


@dataclass(frozen=True, slots=True)
class GrantRoleRequest:
    """授权请求。"""

    target_user_id: UUID
    role: RoleName
    tenant_id: str | None = None
    reason: str = ""


@dataclass(frozen=True, slots=True)
class GrantRoleResult:
    """授权结果。"""

    grant: AdminGrant
    principal: Principal


@dataclass(frozen=True, slots=True)
class SuspendUserRequest:
    """封禁请求。"""

    target_user_id: UUID
    reason: str = ""


def build_principal(
    user_id: UUID,
    roles: frozenset[RoleName],
    tenant_id: str | None = None,
    status: UserStatus = UserStatus.ACTIVE,
) -> Principal:
    """构造主体。

    ⚠️ **租户作用域由角色决定**：
      · 平台管理员 → 无租户限制
      · 租户管理员 → 限定在自己租户
      · 其他 → 同样限定（拿到的 tenant_id）
    """
    if RoleName.PLATFORM_ADMIN in roles:
        scope = TenantScope(tenant_id=None)
    else:
        scope = TenantScope(tenant_id=tenant_id)

    return Principal(
        user_id=user_id,
        roles=roles,
        tenant_scope=scope,
        status=status,
    )


async def build_principal_for(user_id: UUID, context: AuthContext) -> Principal:
    """从存储构造主体。

    ⚠️ **账号被停用时也要构造出来** —— 让下游能返回
    「账号已停用」而不是「用户不存在」，避免泄露账号是否存在。
    """
    status = await context.accounts.get_status(user_id) or UserStatus.ACTIVE

    active_grants = await context.grants.list_active(user_id)
    roles = frozenset(grant.role for grant in active_grants)

    # 租户管理员的租户从授权记录里取
    tenant_id: str | None = None
    for grant in active_grants:
        if grant.role is RoleName.TENANT_ADMIN and grant.tenant_id:
            tenant_id = grant.tenant_id
            break

    return build_principal(user_id, roles, tenant_id, status)


async def grant_role(
    request: GrantRoleRequest,
    actor: Principal,
    context: AuthContext,
) -> GrantRoleResult:
    """授予角色。

    ⚠️ 三道检查：
      ① actor 自己要有该权限（不能随便授予比自己权限大的角色）
      ② 不能给自己授权（防自举漏洞）
      ③ 租户管理员只能在自己租户内授权

    Raises:
        AuthorizationError: 权限不足
        SelfEscalationError: 给自己授权
    """
    # ① 不能给自己授权
    if request.target_user_id == actor.user_id:
        raise SelfEscalationError("不能给自己授予角色 —— 请由另一位管理员操作")

    # ② actor 要有管理员权限
    if not actor.is_admin:
        raise AuthorizationError("需要 admin.role.grant 权限")

    # ③ 租户管理员只能在自己租户内授权，且不能授予平台管理员
    if actor.is_tenant_admin and not actor.is_platform_admin:
        if request.role is RoleName.PLATFORM_ADMIN:
            raise AuthorizationError("租户管理员不能授予平台管理员")
        if request.tenant_id is not None and not actor.can_access_tenant(request.tenant_id):
            raise AuthorizationError("不能跨租户授予角色")

    # 目标账号必须存在
    if not await context.accounts.exists(request.target_user_id):
        raise AuthorizationError(f"用户不存在：{request.target_user_id}")

    # 业务操作
    grant = AdminGrant(
        user_id=request.target_user_id,
        role=request.role,
        tenant_id=request.tenant_id,
        granted_by=actor.user_id,
        reason=request.reason,
    )
    saved = await context.grants.grant(grant)

    # ⚠️ 审计 —— 与业务操作绑死，绕不过去
    await context.audit.record(
        AdminAction(
            action=AdminActionType.ROLE_GRANT,
            actor_id=actor.user_id,
            target_type="user",
            target_id=str(request.target_user_id),
            reason=request.reason,
            result=AdminActionResult.SUCCESS,
            metadata={"role": request.role.value, "tenant_id": request.tenant_id},
        )
    )

    principal = await build_principal_for(request.target_user_id, context)

    return GrantRoleResult(grant=saved, principal=principal)


async def revoke_role(
    target_user_id: UUID,
    role: RoleName,
    actor: Principal,
    context: AuthContext,
    reason: str = "",
) -> bool:
    """撤销角色。

    ⚠️ 同 grant_role 的检查 + 不能撤自己的。
    """
    if target_user_id == actor.user_id:
        raise SelfEscalationError("不能撤销自己的角色")

    if not actor.is_admin:
        raise AuthorizationError("需要 admin.role.revoke 权限")

    if actor.is_tenant_admin and not actor.is_platform_admin and role is RoleName.PLATFORM_ADMIN:
        raise AuthorizationError("租户管理员不能撤销平台管理员")

    revoked = await context.grants.revoke(target_user_id, role, actor.user_id)

    # ⚠️ 审计 —— **无论是否真的撤销了都要记**
    #    「尝试撤销一个不存在的角色」也是值得知道的事件
    await context.audit.record(
        AdminAction(
            action=AdminActionType.ROLE_REVOKE,
            actor_id=actor.user_id,
            target_type="user",
            target_id=str(target_user_id),
            reason=reason,
            result=(AdminActionResult.SUCCESS if revoked else AdminActionResult.FAILED),
            metadata={"role": role.value},
        )
    )

    return revoked


async def suspend_user(
    request: SuspendUserRequest,
    actor: Principal,
    context: AuthContext,
) -> None:
    """封禁用户。

    ⚠️ **封禁不是删除** —— 状态可恢复，审计痕迹完整。
    """
    if request.target_user_id == actor.user_id:
        raise AuthorizationError("不能封禁自己 —— 请由另一位管理员操作")

    if not actor.is_admin:
        raise AuthorizationError("需要 user.suspend 权限")

    await context.accounts.set_status(request.target_user_id, UserStatus.SUSPENDED)

    await context.audit.record(
        AdminAction(
            action=AdminActionType.USER_SUSPEND,
            actor_id=actor.user_id,
            target_type="user",
            target_id=str(request.target_user_id),
            reason=request.reason,
            result=AdminActionResult.SUCCESS,
        )
    )


async def reinstate_user(
    target_user_id: UUID,
    actor: Principal,
    context: AuthContext,
    reason: str = "",
) -> None:
    """解封用户。"""
    if not actor.is_admin:
        raise AuthorizationError("需要 user.suspend 权限")

    await context.accounts.set_status(target_user_id, UserStatus.ACTIVE)

    await context.audit.record(
        AdminAction(
            action=AdminActionType.USER_REINSTATE,
            actor_id=actor.user_id,
            target_type="user",
            target_id=str(target_user_id),
            reason=reason,
            result=AdminActionResult.SUCCESS,
        )
    )
