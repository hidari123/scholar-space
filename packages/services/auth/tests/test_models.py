"""角色、权限、租户作用域测试。"""

from __future__ import annotations

from uuid import uuid4

import pytest

from scholar_auth import (
    Permission,
    Principal,
    RoleName,
    TenantScope,
    UnknownRoleError,
    UserStatus,
    get_role,
)


class TestRoles:
    """内置角色。"""

    def test_all_roles_registered(self) -> None:
        """四个角色都定义了。"""
        for name in RoleName:
            assert get_role(name) is not None

    def test_unknown_role_raises(self) -> None:
        """未知角色报错。"""
        with pytest.raises(UnknownRoleError):
            get_role("nonexistent")  # type: ignore[arg-type]

    def test_platform_admin_has_all_permissions(self) -> None:
        """⚠️ 平台管理员隐含全部权限。"""
        role = get_role(RoleName.PLATFORM_ADMIN)

        for permission in Permission:
            assert role.has(permission) is True

    def test_tenant_admin_cannot_grant_platform_admin(self) -> None:
        """⚠️ 租户管理员没有「授予平台管理员」的隐含能力。

        这里检查的是：租户管理员的权限集合里不含只有平台才该有的操作。
        """
        role = get_role(RoleName.TENANT_ADMIN)

        # 租户管理员有这些
        assert role.has(Permission.USER_SUSPEND) is True
        assert role.has(Permission.BILLING_ADJUST) is True
        assert role.has(Permission.CONTENT_REVIEW) is True

        # 但没有平台级的全部权限
        assert role.has(Permission.USER_DELETE) is False

    def test_viewer_is_read_only(self) -> None:
        """访客只读。"""
        role = get_role(RoleName.VIEWER)

        assert role.has(Permission.JOB_READ) is True
        assert role.has(Permission.USER_SUSPEND) is False
        assert role.has(Permission.BILLING_ADJUST) is False

    def test_role_grants_extends_permissions(self) -> None:
        """⚠️ 追加权限返回新角色 —— 角色不可变。"""
        role = get_role(RoleName.VIEWER)
        extended = role.grants(Permission.BILLING_READ)

        assert extended.has(Permission.BILLING_READ) is True
        assert role.has(Permission.BILLING_READ) is False


class TestTenantScope:
    """租户作用域 —— 越权防线。"""

    def test_platform_scope_covers_everything(self) -> None:
        """⚠️ 无租户限制 → 覆盖所有租户。"""
        scope = TenantScope(tenant_id=None)

        assert scope.covers("tenant-a") is True
        assert scope.covers("tenant-b") is True
        assert scope.covers(None) is True

    def test_tenant_scope_only_covers_own_tenant(self) -> None:
        """租户管理员只能访问自己租户。"""
        scope = TenantScope(tenant_id="tenant-a")

        assert scope.covers("tenant-a") is True
        assert scope.covers("tenant-b") is False

    def test_require_raises_on_cross_tenant(self) -> None:
        """⚠️ 跨租户访问抛 PermissionError。"""
        scope = TenantScope(tenant_id="tenant-a")

        with pytest.raises(PermissionError, match="无权访问"):
            scope.require("tenant-b")

    def test_require_passes_on_own_tenant(self) -> None:
        """自己租户通过。"""
        scope = TenantScope(tenant_id="tenant-a")

        scope.require("tenant-a")


class TestPrincipal:
    """主体。"""

    def test_platform_admin_flag(self) -> None:
        """平台管理员标记。"""
        principal = Principal(
            user_id=uuid4(),
            roles=frozenset({RoleName.PLATFORM_ADMIN}),
        )

        assert principal.is_platform_admin is True
        assert principal.is_admin is True

    def test_tenant_admin_is_admin(self) -> None:
        """租户管理员也是管理员。"""
        principal = Principal(
            user_id=uuid4(),
            roles=frozenset({RoleName.TENANT_ADMIN}),
        )

        assert principal.is_tenant_admin is True
        assert principal.is_platform_admin is False
        assert principal.is_admin is True

    def test_member_is_not_admin(self) -> None:
        """普通成员不是管理员。"""
        principal = Principal(
            user_id=uuid4(),
            roles=frozenset({RoleName.MEMBER}),
        )

        assert principal.is_admin is False

    def test_permission_union_of_roles(self) -> None:
        """⚠️ 多个角色的权限是**并集**不是交集。"""
        principal = Principal(
            user_id=uuid4(),
            roles=frozenset({RoleName.VIEWER, RoleName.TENANT_ADMIN}),
        )

        assert principal.has_permission(Permission.JOB_READ) is True
        assert principal.has_permission(Permission.USER_SUSPEND) is True

    def test_no_permission_if_no_role_has_it(self) -> None:
        """没角色有该权限 → False。"""
        principal = Principal(
            user_id=uuid4(),
            roles=frozenset({RoleName.VIEWER}),
        )

        assert principal.has_permission(Permission.BILLING_ADJUST) is False


class TestUserStatus:
    """账号状态。"""

    def test_active_can_access(self) -> None:
        """正常账号可访问。"""
        assert UserStatus.ACTIVE.can_access is True

    def test_suspended_cannot_access(self) -> None:
        """⚠️ 停用账号不可访问。"""
        assert UserStatus.SUSPENDED.can_access is False

    def test_deleted_cannot_access(self) -> None:
        """删除账号不可访问。"""
        assert UserStatus.DELETED.can_access is False
