"""用例测试 —— 授权、封禁、审计绑定。"""

from __future__ import annotations

from uuid import uuid4

import pytest

from scholar_auth import (
    AdminActionResult,
    AdminActionType,
    AdminGrant,
    AuthContext,
    AuthorizationError,
    AuthRepositories,
    GrantRoleRequest,
    Permission,
    RoleName,
    SelfEscalationError,
    SuspendUserRequest,
    UserStatus,
    build_principal,
    build_principal_for,
    grant_role,
    reinstate_user,
    revoke_role,
    suspend_user,
)


@pytest.fixture
def repos() -> AuthRepositories:
    """一套独立的内存仓储。"""
    return AuthRepositories()


async def make_platform_admin(
    repos: AuthRepositories,
    user_id: object | None = None,
) -> object:
    """造一个平台管理员。"""
    admin_id = user_id or uuid4()

    await repos.accounts.set_status(admin_id, UserStatus.ACTIVE)  # type: ignore[arg-type]
    await repos.grants.grant(
        AdminGrant(
            user_id=admin_id,  # type: ignore[arg-type]
            role=RoleName.PLATFORM_ADMIN,
            granted_by=admin_id,  # type: ignore[arg-type]
            reason="bootstrap",
        )
    )

    return admin_id


class TestGrantRole:
    """授予角色。"""

    async def test_platform_admin_can_grant(self, repos: AuthRepositories) -> None:
        """平台管理员能授权。"""
        context = AuthContext(repos.grants, repos.accounts, repos.audit)
        actor_id = await make_platform_admin(repos)
        target_id = uuid4()
        await repos.accounts.set_status(target_id, UserStatus.ACTIVE)

        actor = await build_principal_for(actor_id, context)  # type: ignore[arg-type]

        result = await grant_role(
            GrantRoleRequest(
                target_user_id=target_id,
                role=RoleName.TENANT_ADMIN,
                tenant_id="tenant-a",
                reason="新同事入职",
            ),
            actor,
            context,
        )

        assert result.grant.role is RoleName.TENANT_ADMIN
        assert result.principal.is_tenant_admin is True

    async def test_self_grant_rejected(self, repos: AuthRepositories) -> None:
        """⚠️ 不能给自己授权（防自举漏洞）。"""
        context = AuthContext(repos.grants, repos.accounts, repos.audit)
        actor_id = await make_platform_admin(repos)
        await repos.accounts.set_status(actor_id, UserStatus.ACTIVE)

        actor = await build_principal_for(actor_id, context)  # type: ignore[arg-type]

        with pytest.raises(SelfEscalationError, match="给自己"):
            await grant_role(
                GrantRoleRequest(
                    target_user_id=actor_id,  # type: ignore[arg-type]
                    role=RoleName.PLATFORM_ADMIN,
                    reason="想给自己升权",
                ),
                actor,
                context,
            )

    async def test_non_admin_rejected(self, repos: AuthRepositories) -> None:
        """⚠️ 非管理员不能授权。"""
        context = AuthContext(repos.grants, repos.accounts, repos.audit)
        actor_id = uuid4()
        target_id = uuid4()
        await repos.accounts.set_status(target_id, UserStatus.ACTIVE)

        actor = build_principal(actor_id, frozenset({RoleName.MEMBER}))

        with pytest.raises(AuthorizationError):
            await grant_role(
                GrantRoleRequest(
                    target_user_id=target_id,
                    role=RoleName.TENANT_ADMIN,
                    reason="试试",
                ),
                actor,
                context,
            )

    async def test_tenant_admin_cannot_grant_platform_admin(self, repos: AuthRepositories) -> None:
        """⚠️ 租户管理员不能授予平台管理员。"""
        context = AuthContext(repos.grants, repos.accounts, repos.audit)
        actor_id = uuid4()
        target_id = uuid4()
        await repos.accounts.set_status(target_id, UserStatus.ACTIVE)
        await repos.accounts.set_status(actor_id, UserStatus.ACTIVE)

        actor = build_principal(
            actor_id,
            frozenset({RoleName.TENANT_ADMIN}),
            tenant_id="tenant-a",
        )

        with pytest.raises(AuthorizationError, match="平台管理员"):
            await grant_role(
                GrantRoleRequest(
                    target_user_id=target_id,
                    role=RoleName.PLATFORM_ADMIN,
                    reason="想升级",
                ),
                actor,
                context,
            )

    async def test_tenant_admin_cannot_grant_across_tenants(self, repos: AuthRepositories) -> None:
        """⚠️ 租户管理员不能跨租户授权。"""
        context = AuthContext(repos.grants, repos.accounts, repos.audit)
        actor_id = uuid4()
        target_id = uuid4()
        await repos.accounts.set_status(target_id, UserStatus.ACTIVE)

        actor = build_principal(
            actor_id,
            frozenset({RoleName.TENANT_ADMIN}),
            tenant_id="tenant-a",
        )

        with pytest.raises(AuthorizationError, match="跨租户"):
            await grant_role(
                GrantRoleRequest(
                    target_user_id=target_id,
                    role=RoleName.MEMBER,
                    tenant_id="tenant-b",
                    reason="越权测试",
                ),
                actor,
                context,
            )

    async def test_target_must_exist(self, repos: AuthRepositories) -> None:
        """目标账号不存在 → 拒绝。"""
        context = AuthContext(repos.grants, repos.accounts, repos.audit)
        actor_id = await make_platform_admin(repos)
        actor = await build_principal_for(actor_id, context)  # type: ignore[arg-type]

        with pytest.raises(AuthorizationError, match="不存在"):
            await grant_role(
                GrantRoleRequest(
                    target_user_id=uuid4(),
                    role=RoleName.MEMBER,
                    reason="测试",
                ),
                actor,
                context,
            )

    async def test_grant_is_audited(self, repos: AuthRepositories) -> None:
        """⚠️ 授权必须留审计。"""
        context = AuthContext(repos.grants, repos.accounts, repos.audit)
        actor_id = await make_platform_admin(repos)
        target_id = uuid4()
        await repos.accounts.set_status(target_id, UserStatus.ACTIVE)

        actor = await build_principal_for(actor_id, context)  # type: ignore[arg-type]

        await grant_role(
            GrantRoleRequest(
                target_user_id=target_id,
                role=RoleName.MEMBER,
                reason="授予成员权限",
            ),
            actor,
            context,
        )

        record = await repos.audit.query()
        assert record.total == 1
        action = record.actions[0]
        assert action.action is AdminActionType.ROLE_GRANT
        assert action.actor_id == actor_id
        assert action.target_id == str(target_id)
        assert action.reason == "授予成员权限"


class TestRevokeRole:
    """撤销角色。"""

    async def test_revoke_works(self, repos: AuthRepositories) -> None:
        """撤销生效。"""
        context = AuthContext(repos.grants, repos.accounts, repos.audit)
        actor_id = await make_platform_admin(repos)
        target_id = uuid4()
        await repos.accounts.set_status(target_id, UserStatus.ACTIVE)

        actor = await build_principal_for(actor_id, context)  # type: ignore[arg-type]

        await grant_role(
            GrantRoleRequest(
                target_user_id=target_id,
                role=RoleName.MEMBER,
                reason="先授予",
            ),
            actor,
            context,
        )

        revoked = await revoke_role(
            target_id,
            RoleName.MEMBER,
            actor,
            context,
            reason="离职",
        )

        assert revoked is True
        assert await repos.grants.has_role(target_id, RoleName.MEMBER) is False

    async def test_cannot_revoke_own_role(self, repos: AuthRepositories) -> None:
        """⚠️ 不能撤销自己的角色。"""
        context = AuthContext(repos.grants, repos.accounts, repos.audit)
        actor_id = await make_platform_admin(repos)
        actor = await build_principal_for(actor_id, context)  # type: ignore[arg-type]

        with pytest.raises(SelfEscalationError):
            await revoke_role(
                actor_id,  # type: ignore[arg-type]
                RoleName.PLATFORM_ADMIN,
                actor,
                context,
                reason="想下台",
            )

    async def test_failed_revoke_is_audited(self, repos: AuthRepositories) -> None:
        """⚠️ 撤销不存在的角色也要审计 —— 「尝试过」也是信息。"""
        context = AuthContext(repos.grants, repos.accounts, repos.audit)
        actor_id = await make_platform_admin(repos)
        target_id = uuid4()
        await repos.accounts.set_status(target_id, UserStatus.ACTIVE)

        actor = await build_principal_for(actor_id, context)  # type: ignore[arg-type]

        revoked = await revoke_role(
            target_id,
            RoleName.MEMBER,
            actor,
            context,
            reason="撤销一个不存在的角色",
        )

        assert revoked is False

        record = await repos.audit.query()
        assert record.total == 1
        assert record.actions[0].result is AdminActionResult.FAILED


class TestSuspendUser:
    """封禁用户。"""

    async def test_suspend_sets_status(self, repos: AuthRepositories) -> None:
        """封禁改变状态。"""
        context = AuthContext(repos.grants, repos.accounts, repos.audit)
        actor_id = await make_platform_admin(repos)
        target_id = uuid4()
        await repos.accounts.set_status(target_id, UserStatus.ACTIVE)

        actor = await build_principal_for(actor_id, context)  # type: ignore[arg-type]

        await suspend_user(
            SuspendUserRequest(target_user_id=target_id, reason="违规"),
            actor,
            context,
        )

        assert await repos.accounts.get_status(target_id) is UserStatus.SUSPENDED

    async def test_suspend_is_audited(self, repos: AuthRepositories) -> None:
        """⚠️ 封禁必须留审计。"""
        context = AuthContext(repos.grants, repos.accounts, repos.audit)
        actor_id = await make_platform_admin(repos)
        target_id = uuid4()
        await repos.accounts.set_status(target_id, UserStatus.ACTIVE)

        actor = await build_principal_for(actor_id, context)  # type: ignore[arg-type]

        await suspend_user(
            SuspendUserRequest(target_user_id=target_id, reason="发送垃圾内容"),
            actor,
            context,
        )

        record = await repos.audit.query()
        assert record.total == 1
        assert record.actions[0].action is AdminActionType.USER_SUSPEND
        assert record.actions[0].reason == "发送垃圾内容"

    async def test_cannot_suspend_self(self, repos: AuthRepositories) -> None:
        """⚠️ 不能封禁自己 —— 否则平台可能没人能管。"""
        context = AuthContext(repos.grants, repos.accounts, repos.audit)
        actor_id = await make_platform_admin(repos)
        await repos.accounts.set_status(actor_id, UserStatus.ACTIVE)

        actor = await build_principal_for(actor_id, context)  # type: ignore[arg-type]

        with pytest.raises(AuthorizationError, match="自己"):
            await suspend_user(
                SuspendUserRequest(target_user_id=actor_id, reason="自罚"),  # type: ignore[arg-type]
                actor,
                context,
            )

    async def test_reinstate_restores(self, repos: AuthRepositories) -> None:
        """解封恢复状态。"""
        context = AuthContext(repos.grants, repos.accounts, repos.audit)
        actor_id = await make_platform_admin(repos)
        target_id = uuid4()
        await repos.accounts.set_status(target_id, UserStatus.SUSPENDED)

        actor = await build_principal_for(actor_id, context)  # type: ignore[arg-type]

        await reinstate_user(target_id, actor, context, reason="申诉通过")

        assert await repos.accounts.get_status(target_id) is UserStatus.ACTIVE


class TestBuildPrincipal:
    """构造主体。"""

    async def test_platform_admin_has_no_tenant_limit(self, repos: AuthRepositories) -> None:
        """⚠️ 平台管理员不受租户限制。"""
        context = AuthContext(repos.grants, repos.accounts, repos.audit)
        actor_id = await make_platform_admin(repos)

        principal = await build_principal_for(
            actor_id,  # type: ignore[arg-type]
            context,
        )

        assert principal.tenant_scope.tenant_id is None
        assert principal.can_access_tenant("any-tenant") is True

    async def test_tenant_admin_scope_from_grant(self, repos: AuthRepositories) -> None:
        """⚠️ 租户管理员的作用域从授权记录取。"""
        context = AuthContext(repos.grants, repos.accounts, repos.audit)
        user_id = uuid4()
        await repos.accounts.set_status(user_id, UserStatus.ACTIVE)
        await repos.grants.grant(
            AdminGrant(
                user_id=user_id,
                role=RoleName.TENANT_ADMIN,
                tenant_id="tenant-a",
                granted_by=user_id,
                reason="test",
            )
        )

        principal = await build_principal_for(user_id, context)

        assert principal.tenant_scope.tenant_id == "tenant-a"
        assert principal.can_access_tenant("tenant-a") is True
        assert principal.can_access_tenant("tenant-b") is False

    async def test_revoked_role_not_included(self, repos: AuthRepositories) -> None:
        """⚠️ 撤销后的角色不再生效。"""
        context = AuthContext(repos.grants, repos.accounts, repos.audit)
        actor_id = await make_platform_admin(repos)
        target_id = uuid4()
        await repos.accounts.set_status(target_id, UserStatus.ACTIVE)

        actor = await build_principal_for(actor_id, context)  # type: ignore[arg-type]

        await grant_role(
            GrantRoleRequest(
                target_user_id=target_id,
                role=RoleName.TENANT_ADMIN,
                tenant_id="tenant-a",
                reason="授予",
            ),
            actor,
            context,
        )

        await revoke_role(
            target_id,
            RoleName.TENANT_ADMIN,
            actor,
            context,
            reason="撤销",
        )

        principal = await build_principal_for(target_id, context)

        assert principal.is_admin is False
        assert principal.has_permission(Permission.USER_SUSPEND) is False
