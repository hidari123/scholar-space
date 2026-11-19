"""HTTP 接口层测试 —— 管理员端点 + 网关签名校验。

⚠️ 这组测试验证的是**安全边界**：
    · 签名不对 → 401，请求进不了路由
    · 角色不对 → 403
    · 自举授权 → 403
    · 每���次写操作都产生审计记录
"""

from __future__ import annotations

import time
from collections.abc import Iterator
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from scholar_auth.application.use_cases import AuthContext
from scholar_auth.domain.gateway import sign_gateway_headers
from scholar_auth.domain.models import UserStatus
from scholar_auth.infrastructure.memory import (
    AuthRepositories,
    InMemoryAccountRepository,
    InMemoryAuditRepository,
    InMemoryGrantRepository,
)
from scholar_auth.interfaces.app import create_app
from scholar_auth.interfaces.routers.admin import get_auth_context

#: 测试用网关密钥。
# ⚠️ S105（硬编码密码）在这里是**误报** ——
#    这是测试用的固定密钥，不是真实凭据。
TEST_SECRET = "test-gateway-secret"  # noqa: S105


@pytest.fixture
def context() -> AuthContext:
    """构造用例上下文。"""
    repositories = AuthRepositories(
        accounts=InMemoryAccountRepository(),
        grants=InMemoryGrantRepository(),
        audit=InMemoryAuditRepository(),
    )
    return AuthContext(
        grants=repositories.grants,
        accounts=repositories.accounts,
        audit=repositories.audit,
    )


@pytest.fixture
def client(context: AuthContext, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    """构造测试客户端。

    ⚠️ 每个测试拿到**独立的**上下文 —— 用 dependency_overrides 注入。
    """
    monkeypatch.setenv("SCHOLARSPAWN_GATEWAY_SECRET", TEST_SECRET)

    app = create_app()
    app.dependency_overrides[get_auth_context] = lambda: context

    with TestClient(app) as test_client:
        yield test_client


def signed_headers(
    user_id: UUID,
    roles: list[str],
    secret: str = TEST_SECRET,
    timestamp: int | None = None,
) -> dict[str, str]:
    """生成带签名的请求头。"""
    headers = sign_gateway_headers(user_id, roles, secret, timestamp)
    return {
        "X-Scholar-User-Id": headers.user_id,
        "X-Scholar-Roles": headers.roles,
        "X-Scholar-Ts": headers.timestamp,
        "X-Scholar-Sig": headers.signature,
    }


@pytest.fixture
def admin_id() -> UUID:
    """管理员 ID。"""
    return uuid4()


@pytest.fixture
def target_id() -> UUID:
    """目标用户 ID。"""
    return uuid4()


class TestGatewaySignature:
    """⚠️ 网关签名校验 —— 安全边界的第一道。"""

    def test_missing_headers_returns_401(self, client: TestClient) -> None:
        """没有签名头 → 401。"""
        response = client.get("/api/admin/admins")
        assert response.status_code == 401

    def test_wrong_signature_returns_401(self, client: TestClient, admin_id: UUID) -> None:
        """签名不对 → 401。"""
        headers = signed_headers(
            admin_id,
            ["platform_admin"],
            secret="wrong-secret",  # noqa: S106
        )
        response = client.get("/api/admin/admins", headers=headers)
        assert response.status_code == 401

    def test_expired_signature_returns_401(self, client: TestClient, admin_id: UUID) -> None:
        """⚠️ 签名过期 → 401（防重放）。"""
        headers = signed_headers(admin_id, ["platform_admin"], timestamp=int(time.time()) - 120)
        response = client.get("/api/admin/admins", headers=headers)
        assert response.status_code == 401

    def test_future_timestamp_returns_401(self, client: TestClient, admin_id: UUID) -> None:
        """⚠️ 未来时间戳 → 401。

        否则可以签一个「永远不过期」的时间戳。
        """
        headers = signed_headers(admin_id, ["platform_admin"], timestamp=int(time.time()) + 300)
        response = client.get("/api/admin/admins", headers=headers)
        assert response.status_code == 401

    def test_tampered_user_id_returns_401(self, client: TestClient, admin_id: UUID) -> None:
        """⚠️ 改了 user_id 但没重签 → 401（防串号）。"""
        headers = signed_headers(admin_id, ["platform_admin"])
        headers["X-Scholar-User-Id"] = str(uuid4())
        response = client.get("/api/admin/admins", headers=headers)
        assert response.status_code == 401

    def test_tampered_roles_returns_401(self, client: TestClient, admin_id: UUID) -> None:
        """⚠️ 把 member 改成 platform_admin → 401（防提权）。"""
        headers = signed_headers(admin_id, ["member"])
        headers["X-Scholar-Roles"] = "platform_admin"
        response = client.get("/api/admin/admins", headers=headers)
        assert response.status_code == 401

    def test_valid_signature_passes(self, client: TestClient, admin_id: UUID) -> None:
        """签名正确 → 放行。"""
        headers = signed_headers(admin_id, ["platform_admin"])
        response = client.get("/api/admin/admins", headers=headers)
        assert response.status_code == 200


class TestRoleChecks:
    """⚠️ 角色检查 —— 安全边界的第二道。"""

    def test_non_admin_returns_403(self, client: TestClient, admin_id: UUID) -> None:
        """普通成员访问管理员端点 → 403。"""
        headers = signed_headers(admin_id, ["member"])
        response = client.get("/api/admin/admins", headers=headers)
        assert response.status_code == 403

    def test_viewer_returns_403(self, client: TestClient, admin_id: UUID) -> None:
        """访客 → 403。"""
        headers = signed_headers(admin_id, ["viewer"])
        response = client.get("/api/admin/admins", headers=headers)
        assert response.status_code == 403

    def test_tenant_admin_can_access_tenant_endpoints(
        self, client: TestClient, admin_id: UUID
    ) -> None:
        """租户管理员能进平台管理端点吗？—— 不能（审计是平台级的）。"""
        headers = signed_headers(admin_id, ["tenant_admin"])
        response = client.get("/api/admin/admins", headers=headers)
        assert response.status_code == 403


class TestGrantRole:
    """授权端点。"""

    @pytest.mark.asyncio
    async def test_grant_role_succeeds(
        self, client: TestClient, context: AuthContext, admin_id: UUID, target_id: UUID
    ) -> None:
        """授予角色成功。"""
        await context.accounts.set_status(target_id, UserStatus.ACTIVE)

        headers = signed_headers(admin_id, ["platform_admin"])
        response = client.post(
            "/api/admin/roles",
            json={
                "user_id": str(target_id),
                "role": "member",
                "reason": "新同事入职",
            },
            headers=headers,
        )

        assert response.status_code == 201
        assert response.json()["user_id"] == str(target_id)

    @pytest.mark.asyncio
    async def test_grant_role_requires_reason(
        self, client: TestClient, context: AuthContext, admin_id: UUID, target_id: UUID
    ) -> None:
        """⚠️ 没有原因 → 422（reason 是必填的）。

        审计没有原因等于没记录。
        """
        await context.accounts.set_status(target_id, UserStatus.ACTIVE)

        headers = signed_headers(admin_id, ["platform_admin"])
        response = client.post(
            "/api/admin/roles",
            json={"user_id": str(target_id), "role": "member", "reason": ""},
            headers=headers,
        )

        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_cannot_grant_to_self(
        self, client: TestClient, context: AuthContext, admin_id: UUID
    ) -> None:
        """⚠️ 不能给自己授权 → 403。"""
        await context.accounts.set_status(admin_id, UserStatus.ACTIVE)

        headers = signed_headers(admin_id, ["platform_admin"])
        response = client.post(
            "/api/admin/roles",
            json={
                "user_id": str(admin_id),
                "role": "platform_admin",
                "reason": "自举",
            },
            headers=headers,
        )

        assert response.status_code == 403

    def test_unknown_role_returns_422(
        self, client: TestClient, admin_id: UUID, target_id: UUID
    ) -> None:
        """未知角色 → 422。"""
        headers = signed_headers(admin_id, ["platform_admin"])
        response = client.post(
            "/api/admin/roles",
            json={
                "user_id": str(target_id),
                "role": "superuser",
                "reason": "x",
            },
            headers=headers,
        )

        assert response.status_code == 422

    def test_extra_field_returns_422(
        self, client: TestClient, admin_id: UUID, target_id: UUID
    ) -> None:
        """⚠️ 多余字段 → 422。

        客户端以为传了 `role` 就能提权，实际被拒绝了 —— 早失败好过静默忽略。
        """
        headers = signed_headers(admin_id, ["platform_admin"])
        response = client.post(
            "/api/admin/roles",
            json={
                "user_id": str(target_id),
                "role": "member",
                "reason": "x",
                "is_superuser": True,
            },
            headers=headers,
        )

        assert response.status_code == 422


class TestSuspendUser:
    """停用端点。"""

    @pytest.mark.asyncio
    async def test_suspend_succeeds(
        self, client: TestClient, context: AuthContext, admin_id: UUID, target_id: UUID
    ) -> None:
        """停用成功。"""
        await context.accounts.set_status(target_id, UserStatus.ACTIVE)

        headers = signed_headers(admin_id, ["platform_admin"])
        response = client.post(
            f"/api/admin/users/{target_id}/suspend",
            json={"user_id": str(target_id), "reason": "违规"},
            headers=headers,
        )

        assert response.status_code == 204
        assert await context.accounts.get_status(target_id) is UserStatus.SUSPENDED

    @pytest.mark.asyncio
    async def test_cannot_suspend_self(
        self, client: TestClient, context: AuthContext, admin_id: UUID
    ) -> None:
        """⚠️ 不能停用自己 → 403。"""
        await context.accounts.set_status(admin_id, UserStatus.ACTIVE)

        headers = signed_headers(admin_id, ["platform_admin"])
        response = client.post(
            f"/api/admin/users/{admin_id}/suspend",
            json={"user_id": str(admin_id), "reason": "x"},
            headers=headers,
        )

        assert response.status_code == 403

    def test_path_body_mismatch_returns_422(
        self, client: TestClient, admin_id: UUID, target_id: UUID
    ) -> None:
        """⚠️ 路径与请求体的 user_id 不一致 → 422。

        防止「A 的路径 + B 的 body」这种混淆。
        """
        headers = signed_headers(admin_id, ["platform_admin"])
        response = client.post(
            f"/api/admin/users/{target_id}/suspend",
            json={"user_id": str(uuid4()), "reason": "x"},
            headers=headers,
        )

        assert response.status_code == 422


class TestAuditTrail:
    """⚠️ 审计 —— 每一次写操作都要留痕。"""

    @pytest.mark.asyncio
    async def test_grant_creates_audit_record(
        self, client: TestClient, context: AuthContext, admin_id: UUID, target_id: UUID
    ) -> None:
        """授权产生审计记录。"""
        await context.accounts.set_status(target_id, UserStatus.ACTIVE)

        headers = signed_headers(admin_id, ["platform_admin"])
        client.post(
            "/api/admin/roles",
            json={
                "user_id": str(target_id),
                "role": "member",
                "reason": "新同事入职",
            },
            headers=headers,
        )

        page = await context.audit.query(limit=10)
        assert len(page.actions) == 1
        assert page.actions[0].actor_id == admin_id
        assert page.actions[0].reason == "新同事入职"

    @pytest.mark.asyncio
    async def test_suspend_creates_audit_record(
        self, client: TestClient, context: AuthContext, admin_id: UUID, target_id: UUID
    ) -> None:
        """停用产生审计记录。"""
        await context.accounts.set_status(target_id, UserStatus.ACTIVE)

        headers = signed_headers(admin_id, ["platform_admin"])
        client.post(
            f"/api/admin/users/{target_id}/suspend",
            json={"user_id": str(target_id), "reason": "违规"},
            headers=headers,
        )

        page = await context.audit.query(limit=10)
        assert len(page.actions) == 1
        assert page.actions[0].reason == "违规"

    @pytest.mark.asyncio
    async def test_audit_endpoint_lists_records(
        self, client: TestClient, context: AuthContext, admin_id: UUID, target_id: UUID
    ) -> None:
        """审计端点能列出记录。"""
        await context.accounts.set_status(target_id, UserStatus.ACTIVE)

        headers = signed_headers(admin_id, ["platform_admin"])
        client.post(
            f"/api/admin/users/{target_id}/suspend",
            json={"user_id": str(target_id), "reason": "违规"},
            headers=headers,
        )

        response = client.get("/api/admin/audit", headers=headers)

        assert response.status_code == 200
        assert len(response.json()) == 1


class TestHealth:
    """健康检查。"""

    def test_health_is_public(self, client: TestClient) -> None:
        """⚠️ 健康检查不需要签名。

        负载均衡器探活没有签名 —— 要求签名会导致探活失败。
        """
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
