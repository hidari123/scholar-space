"""权限与角色领域模型 —— 纯领域，零外部依赖。

⚠️ 这一层回答的是「**你能做什么**」，不是「你是谁」。

    identity 仓（独立）  →  「你是谁」   → User / Identity / Credential
    auth 服务（本包）    →  「你能做什么」→ Role / Permission / AdminGrant

职责边界很重要 —— identity **不需要知道** auth 的存在；
auth 通过消费 identity 的 `UserRegistered` 事件建内部账号。
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import StrEnum
from uuid import UUID

__all__ = [
    "AdminGrant",
    "Permission",
    "Principal",
    "Role",
    "RoleName",
    "TenantScope",
    "UnknownPermissionError",
    "UnknownRoleError",
    "UserStatus",
]


class UnknownPermissionError(ValueError):
    """未知权限点。"""


class UnknownRoleError(ValueError):
    """未知角色。"""


class RoleName(StrEnum):
    """角色。

    ⚠️ 平台管理员与租户管理员**并列**，不是包含关系 ——
       租户管理员的权限受租户作用域限制。
    """

    #: 平台管理员 —— 管所有租户
    PLATFORM_ADMIN = "platform_admin"
    #: 租户管理员 —— 只管自己租户
    TENANT_ADMIN = "tenant_admin"
    #: 机构成员 —— 租户内的普通成员（可编辑内容）
    MEMBER = "member"
    #: 访客 —— 只读
    VIEWER = "viewer"


class Permission(StrEnum):
    """权限点。

    ⚠️ 用 `模块.动作` 命名 —— 加新模块时不会打乱既有前缀。
    """

    # 用户
    USER_READ = "user.read"
    USER_SUSPEND = "user.suspend"
    USER_DELETE = "user.delete"

    # 租户
    TENANT_READ = "tenant.read"
    TENANT_UPDATE = "tenant.update"

    # 计费
    BILLING_READ = "billing.read"
    BILLING_ADJUST = "billing.adjust"

    # 内容审核
    CONTENT_REVIEW = "content.review"
    CONTENT_TAKEDOWN = "content.takedown"

    # 任务
    JOB_READ = "job.read"
    JOB_RETRY = "job.retry"

    # 模型
    MODEL_READ = "model.read"
    MODEL_UPDATE = "model.update"

    # 系统
    SYSTEM_READ = "system.read"

    # 审计
    AUDIT_READ = "audit.read"


@dataclass(frozen=True, slots=True)
class Role:
    """角色 —— 一组权限点的集合。

    ⚠️ 角色**不可变** —— 改了就是新角色（版本化更安全）。
    """

    name: RoleName
    permissions: frozenset[Permission]
    description: str = ""

    def has(self, permission: Permission) -> bool:
        """是否拥有某权限。

        ⚠️ `platform_admin` 隐含**所有**权限 ——
           平台管理员要能管所有租户。
        """
        if self.name is RoleName.PLATFORM_ADMIN:
            return True

        return permission in self.permissions

    def grants(self, permission: Permission) -> Role:
        """返回一个额外授予某权限的角色。"""
        return Role(
            name=self.name,
            permissions=self.permissions | {permission},
            description=self.description,
        )


def _build_role_definitions() -> dict[RoleName, Role]:
    """构造内置角色定义。

    ⚠️ 集中在一处定义 —— 避免权限散落在各处导致难以审计。
    """
    member_permissions = frozenset(
        {
            Permission.USER_READ,
            Permission.BILLING_READ,
            Permission.JOB_READ,
            Permission.MODEL_READ,
            Permission.SYSTEM_READ,
        }
    )

    tenant_admin_permissions = frozenset(
        {
            Permission.USER_READ,
            Permission.USER_SUSPEND,
            Permission.TENANT_READ,
            Permission.TENANT_UPDATE,
            Permission.BILLING_READ,
            Permission.BILLING_ADJUST,
            Permission.CONTENT_REVIEW,
            Permission.CONTENT_TAKEDOWN,
            Permission.JOB_READ,
            Permission.JOB_RETRY,
            Permission.MODEL_READ,
            Permission.MODEL_UPDATE,
            Permission.SYSTEM_READ,
            Permission.AUDIT_READ,
        }
    )

    return {
        RoleName.PLATFORM_ADMIN: Role(
            name=RoleName.PLATFORM_ADMIN,
            permissions=frozenset(Permission),
            description="平台管理员 —— 管所有租户，隐含全部权限",
        ),
        RoleName.TENANT_ADMIN: Role(
            name=RoleName.TENANT_ADMIN,
            permissions=tenant_admin_permissions,
            description="租户管理员 —— 只管自己租户",
        ),
        RoleName.MEMBER: Role(
            name=RoleName.MEMBER,
            permissions=member_permissions,
            description="机构成员 —— 可编辑内容",
        ),
        RoleName.VIEWER: Role(
            name=RoleName.VIEWER,
            permissions=frozenset(
                {
                    Permission.USER_READ,
                    Permission.JOB_READ,
                    Permission.SYSTEM_READ,
                }
            ),
            description="访客 —— 只读",
        ),
    }


#: 内置角色定义
ROLES: dict[RoleName, Role] = _build_role_definitions()


def get_role(name: RoleName) -> Role:
    """按名字取角色。

    Raises:
        UnknownRoleError: 角色不存在
    """
    role = ROLES.get(name)
    if role is None:
        raise UnknownRoleError(f"未知角色：{name}")

    return role


class UserStatus(StrEnum):
    """用户状态。

    ⚠️ **封禁不是删除** —— 被封禁的用户仍可恢复，审计痕迹完整。
    """

    #: 正常
    ACTIVE = "active"
    #: 停用（可恢复）
    SUSPENDED = "suspended"
    #: 已删除（软删除，保留审计）
    DELETED = "deleted"

    @property
    def can_access(self) -> bool:
        """是否可访问。"""
        return self is UserStatus.ACTIVE


@dataclass(frozen=True, slots=True)
class TenantScope:
    """租户作用域。

    ⚠️ 平台管理员的 `tenant_id` 为 None —— 表示**不受租户限制**。
    租户管理员必须有 tenant_id。
    """

    tenant_id: str | None = None

    def covers(self, target_tenant_id: str | None) -> bool:
        """是否能访问目标租户的数据。

        ⚠️ **这是租户隔离的核心判断** —— 数据访问层必须过这一关。
        """
        # 无租户限制（平台级）
        if self.tenant_id is None:
            return True

        # 必须精确匹配
        return self.tenant_id == target_tenant_id

    def require(self, target_tenant_id: str | None) -> None:
        """校验访问权限，不通过则抛错。

        Raises:
            PermissionError: 跨租户访问
        """
        if not self.covers(target_tenant_id):
            raise PermissionError(f"无权访问租户 {target_tenant_id}")


@dataclass(frozen=True, slots=True)
class Principal:
    """主体 —— 一次请求里的「谁 + 能做什么 + 在哪个租户」。

    ⚠️ 这是网关校验后传给下游服务的**唯一身份载体**。
    """

    user_id: UUID
    roles: frozenset[RoleName]
    tenant_scope: TenantScope = field(default_factory=TenantScope)
    status: UserStatus = UserStatus.ACTIVE

    @property
    def is_platform_admin(self) -> bool:
        """是否平台管理员。"""
        return RoleName.PLATFORM_ADMIN in self.roles

    @property
    def is_tenant_admin(self) -> bool:
        """是否租户管理员。"""
        return RoleName.TENANT_ADMIN in self.roles

    @property
    def is_admin(self) -> bool:
        """是否是管理员（任一种）。"""
        return self.is_platform_admin or self.is_tenant_admin

    def has_permission(self, permission: Permission) -> bool:
        """是否拥有某权限。

        ⚠️ 任一角色有该权限即算有 —— 角色是并集不是交集。
        """
        return any(get_role(role).has(permission) for role in self.roles)

    def can_access_tenant(self, tenant_id: str | None) -> bool:
        """能否访问某租户。"""
        return self.tenant_scope.covers(tenant_id)


@dataclass(frozen=True, slots=True)
class AdminGrant:
    """管理员授权记录。

    ⚠️ **谁、什么时候、谁授予的、为什么** —— 四要素齐全才能审计。
    """

    user_id: UUID
    role: RoleName
    tenant_id: str | None = None
    granted_by: UUID | None = None
    granted_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    reason: str = ""
    revoked_at: datetime | None = None
    revoked_by: UUID | None = None

    @property
    def is_active(self) -> bool:
        """授权是否仍然有效。"""
        return self.revoked_at is None

    def revoke(self, actor_id: UUID) -> AdminGrant:
        """撤销授权。

        Returns:
            新的授权记录（原记录保留 —— 审计要看到历史）
        """
        return AdminGrant(
            user_id=self.user_id,
            role=self.role,
            tenant_id=self.tenant_id,
            granted_by=self.granted_by,
            granted_at=self.granted_at,
            reason=self.reason,
            revoked_at=datetime.now(UTC),
            revoked_by=actor_id,
        )
