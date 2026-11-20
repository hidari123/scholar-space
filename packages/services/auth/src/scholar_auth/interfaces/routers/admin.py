"""管理员路由 —— 授权 / 撤权 / 停用 / 解封 / 审计查询。

⚠️ 这一层**很薄** —— 只做三件事：
    ① 解析请求（Pydantic 校验）
    ② 调 application 层
    ③ 包装响应

⚠️ **权限检查有两道**：
    · 依赖层 `require_roles(...)` —— 是不是管理员
    · 用例层 `grant_role(...)` 内部 —— 能不能操作这个用户/租户

两道都要有。依赖层挡住「不是管理员」，用例层挡住「是管理员但越权」。
"""

from __future__ import annotations

from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from scholar_auth.application.use_cases import (
    AuthContext,
    AuthorizationError,
    GrantRoleRequest as UseCaseGrantRoleRequest,
    SelfEscalationError,
    SuspendUserRequest as UseCaseSuspendUserRequest,
    grant_role,
    reinstate_user,
    revoke_role,
    suspend_user,
)
from scholar_auth.composition import build_auth_context
from scholar_auth.domain.models import Principal, RoleName, UserStatus
from scholar_auth.interfaces.dependencies import require_principal, require_roles
from scholar_auth.interfaces.schemas import (
    AuditRecordResponse,
    GrantRoleRequest,
    RevokeRoleRequest,
    SuspendUserRequest,
    UserAccountResponse,
)

__all__ = ["get_auth_context", "router"]

router = APIRouter(prefix="/api/admin", tags=["admin"])


# ══════════════════════════════════════════════════════════
# 依赖注入
#
# ⚠️ **接口层不许 import 基础设施层** ——
#    路由只认「一个能拿到 AuthContext 的依赖」，
#    具体用内存实现还是 PostgreSQL，由组装根决定。
#
# ⚠️ **组装根在 `scholar_auth.composition`** ——
#    它不属于任何一层，是把所有层拼起来的地方。
#
# ⚠️ **⚠️ 曾经的写法（已改）** ——
#    路由曾直接 import `scholar_auth.infrastructure.memory`，
#    当时的理由是「检查过没有循环依赖，所以安全」。
#    ⚠️ **没有循环依赖 ≠ 架构正确** ——
#    接口层依赖基础设施就意味着换实现要改路由。
#
# ⚠️ 用 functools.cache 做单例 —— 比 global 干净，
#    不会有并发初始化的竞态。测试通过 dependency_overrides 覆盖。
# ══════════════════════════════════════════════════════════


def get_auth_context() -> AuthContext:
    """用例上下文依赖。

    ⚠️ **只转发给组装根** —— 路由层不关心实现细节。
    """
    return build_auth_context()


#: 管理员端点的上下文依赖。
AuthContextDep = Annotated[AuthContext, Depends(get_auth_context)]

#: 平台管理员依赖 —— 只有平台管理员能进这些端点。
PlatformAdminDep = Annotated[Principal, Depends(require_roles(RoleName.PLATFORM_ADMIN))]

#: 任一种管理员。
AnyAdminDep = Annotated[
    Principal, Depends(require_roles(RoleName.PLATFORM_ADMIN, RoleName.TENANT_ADMIN))
]

#: 已认证主体（任意角色）。
PrincipalDep = Annotated[Principal, Depends(require_principal)]


@router.post(
    "/roles",
    response_model=UserAccountResponse,
    status_code=status.HTTP_201_CREATED,
    summary="授予角色",
)
async def grant_role_endpoint(
    payload: GrantRoleRequest,
    actor: AnyAdminDep,
    context: AuthContextDep,
) -> UserAccountResponse:
    """授予角色。

    ⚠️ **不能给自己授权** —— 用例层会拦，这里再转成 403。

    Raises:
        HTTPException: 权限不足 / 自举 / 用户不存在
    """
    try:
        role = RoleName(payload.role)
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"未知角色：{payload.role}",
        ) from error

    try:
        result = await grant_role(
            _to_grant_request(payload, role),
            actor,
            context,
        )
    except SelfEscalationError as error:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(error),
        ) from error
    except AuthorizationError as error:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(error),
        ) from error

    principal = result.principal
    return UserAccountResponse(
        user_id=principal.user_id,
        email=None,
        status=principal.status.value,
        roles=[item.value for item in principal.roles],
        tenant_id=_as_uuid_or_none(principal.tenant_scope.tenant_id),
    )


@router.delete(
    "/roles",
    response_model=UserAccountResponse,
    summary="撤销角色",
)
async def revoke_role_endpoint(
    payload: RevokeRoleRequest,
    actor: AnyAdminDep,
    context: AuthContextDep,
) -> UserAccountResponse:
    """撤销角色。

    Raises:
        HTTPException: 权限不足 / 自撤
    """
    try:
        role = RoleName(payload.role)
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"未知角色：{payload.role}",
        ) from error

    try:
        await revoke_role(
            payload.user_id,
            role,
            actor,
            context,
            payload.reason,
        )
    except SelfEscalationError as error:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(error),
        ) from error
    except AuthorizationError as error:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(error),
        ) from error

    return UserAccountResponse(
        user_id=payload.user_id,
        email=None,
        status="active",
        roles=[],
    )


@router.post(
    "/users/{user_id}/suspend",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="停用用户",
)
async def suspend_user_endpoint(
    user_id: UUID,
    payload: SuspendUserRequest,
    actor: AnyAdminDep,
    context: AuthContextDep,
) -> None:
    """停用用户。

    ⚠️ **不是删除** —— 状态可恢复，审计痕迹完整。

    Raises:
        HTTPException: 权限不足
    """
    if payload.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="路径中的 user_id 与请求体不一致",
        )

    try:
        await suspend_user(
            _to_suspend_request(payload),
            actor,
            context,
        )
    except AuthorizationError as error:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(error),
        ) from error


@router.post(
    "/users/{user_id}/reinstate",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="解封用户",
)
async def reinstate_user_endpoint(
    user_id: UUID,
    actor: AnyAdminDep,
    context: AuthContextDep,
) -> None:
    """解封用户。

    ⚠️ **不强制 reason** —— 解封不是敏感操作。
       但审计记录里会带上操作人。

    Raises:
        HTTPException: 权限不足
    """
    try:
        await reinstate_user(user_id, actor, context)
    except AuthorizationError as error:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(error),
        ) from error


@router.get(
    "/audit",
    response_model=list[AuditRecordResponse],
    summary="查询审计记录",
)
async def list_audit_endpoint(
    actor: PlatformAdminDep,
    context: AuthContextDep,
) -> list[AuditRecordResponse]:
    """查询审计记录。

    ⚠️ **只有平台管理员能查全部审计** ——
    租户管理员查审计会看到别的租户的操作记录。

    Raises:
        HTTPException: 权限不足
    """
    del actor  # ⚠️ 显式标记未使用 —— 避免 ARG001

    # ⚠️ query() 返回 AuditRecord（分页容器），不是 list ——
    #    审计表会很大，不能一次全拉。
    page = await context.audit.query(limit=100)

    return [
        AuditRecordResponse(
            id=action.id,
            actor_id=action.actor_id,
            action=action.action.value,
            target_user_id=_as_uuid_or_none(action.target_id),
            reason=action.reason,
            result=action.result.value,
            created_at=action.occurred_at,
            details=action.metadata,
        )
        for action in page.actions
    ]


@router.get(
    "/admins",
    response_model=list[UserAccountResponse],
    summary="列出管理员",
)
async def list_admins_endpoint(
    actor: PlatformAdminDep,
    context: AuthContextDep,
) -> list[UserAccountResponse]:
    """列出所有管理员授权记录。

    ⚠️ **只返回授权信息，不返回用户私有内容** ——
    这是「管理员默认看不到私有内容」原则的落地。

    Raises:
        HTTPException: 权限不足
    """
    del actor  # ⚠️ 显式标记未使用 —— 避免 ARG001

    grants = await context.grants.list_admins()

    return [
        UserAccountResponse(
            user_id=grant.user_id,
            email=None,
            status=UserStatus.ACTIVE.value,
            roles=[grant.role.value],
            tenant_id=_as_uuid_or_none(grant.tenant_id),
        )
        for grant in grants
    ]


# ══════════════════════════════════════════════════════════
# 辅助函数
# ══════════════════════════════════════════════════════════


def _to_grant_request(payload: GrantRoleRequest, role: RoleName) -> Any:
    """把 HTTP 请求模型转成用例请求。

    ⚠️ 用例层的 `GrantRoleRequest` 与 HTTP 层的同名但字段不同
       （用例层用 RoleName 枚举，HTTP 层用字符串）——
       所以要显式转换，不能直接传。
    """
    return UseCaseGrantRoleRequest(
        target_user_id=payload.user_id,
        role=role,
        # ⚠️ HTTP 层用 UUID，用例层用 str —— 这里显式转换。
        #    两层用不同类型不是疏忽：UUID 只在有 UUID 语义时用，
        #    而 tenant_id 在用例层可能来自旧数据（纯字符串）。
        tenant_id=str(payload.tenant_id) if payload.tenant_id else None,
        reason=payload.reason,
    )


def _to_suspend_request(payload: SuspendUserRequest) -> Any:
    """把 HTTP 请求模型转成用例请求。"""
    return UseCaseSuspendUserRequest(
        target_user_id=payload.user_id,
        reason=payload.reason,
    )


def _as_uuid_or_none(value: str | UUID | None) -> UUID | None:
    """把值转成 UUID，失败返回 None。

    ⚠️ 审计记录的 target_id 与授权的 tenant_id 都是字符串 ——
       可能是 user_id 也可能是别的东西。
       转不成 UUID 就返回 None，不能让整个列表接口 500。
    """
    if not value:
        return None
    if isinstance(value, UUID):
        return value
    try:
        return UUID(value)
    except ValueError:
        return None
