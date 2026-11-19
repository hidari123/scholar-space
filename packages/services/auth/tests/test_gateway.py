"""网关签名测试 —— 防止「能直连后端就能当管理员」。

⚠️ 这是 nanobuddy 的核心短板，我们用签名补上。
"""

from __future__ import annotations

import time
from uuid import uuid4

import pytest

from scholar_auth import (
    GatewayHeaders,
    GatewaySignatureError,
    GatewaySignatureExpiredError,
    sign_gateway_headers,
    verify_gateway_signature,
)

SECRET = "test-gateway-secret-xyz"  # noqa: S105


class TestSign:
    """生成签名。"""

    def test_produces_four_fields(self) -> None:
        """四个字段齐全。"""
        headers = sign_gateway_headers(uuid4(), ["admin"], SECRET)

        assert headers.user_id
        assert headers.roles == "admin"
        assert headers.timestamp
        assert headers.signature

    def test_rejects_empty_secret(self) -> None:
        """空密钥直接拒绝。"""
        with pytest.raises(ValueError, match="密钥"):
            sign_gateway_headers(uuid4(), ["admin"], "")

    def test_signature_is_deterministic_for_same_input(self) -> None:
        """⚠️ 相同输入 + 相同时间戳 → 相同签名（可重复验证）。"""
        user_id = uuid4()
        ts = 1700000000

        first = sign_gateway_headers(user_id, ["admin"], SECRET, timestamp=ts)
        second = sign_gateway_headers(user_id, ["admin"], SECRET, timestamp=ts)

        assert first.signature == second.signature

    def test_different_secret_gives_different_signature(self) -> None:
        """换密钥签名就变。"""
        user_id = uuid4()
        ts = 1700000000

        first = sign_gateway_headers(user_id, ["admin"], SECRET, timestamp=ts)
        second = sign_gateway_headers(user_id, ["admin"], "other-secret", timestamp=ts)

        assert first.signature != second.signature


class TestVerify:
    """校验签名。"""

    def test_valid_signature_passes(self) -> None:
        """正确签名通过。"""
        user_id = uuid4()
        headers = sign_gateway_headers(user_id, ["admin"], SECRET)

        verify_gateway_signature(headers, SECRET)

    def test_tampered_user_id_fails(self) -> None:
        """⚠️ 改了 user_id → 验签失败。"""
        user_id = uuid4()
        headers = sign_gateway_headers(user_id, ["admin"], SECRET)

        tampered = GatewayHeaders(
            user_id=str(uuid4()),
            roles=headers.roles,
            timestamp=headers.timestamp,
            signature=headers.signature,
        )

        with pytest.raises(GatewaySignatureError, match="不匹配"):
            verify_gateway_signature(tampered, SECRET)

    def test_tampered_roles_fail(self) -> None:
        """⚠️ 把自己加成 admin → 验签失败。

        这是最危险的攻击：普通用户伪造 roles。
        """
        headers = sign_gateway_headers(uuid4(), ["viewer"], SECRET)

        tampered = GatewayHeaders(
            user_id=headers.user_id,
            roles="platform_admin",
            timestamp=headers.timestamp,
            signature=headers.signature,
        )

        with pytest.raises(GatewaySignatureError, match="不匹配"):
            verify_gateway_signature(tampered, SECRET)

    def test_forged_signature_fails(self) -> None:
        """完全伪造的签名被拒。"""
        headers = GatewayHeaders(
            user_id=str(uuid4()),
            roles="platform_admin",
            timestamp=str(int(time.time())),
            signature="deadbeef" * 8,
        )

        with pytest.raises(GatewaySignatureError, match="不匹配"):
            verify_gateway_signature(headers, SECRET)

    def test_wrong_secret_fails(self) -> None:
        """用别的密钥校验失败。"""
        headers = sign_gateway_headers(uuid4(), ["admin"], SECRET)

        with pytest.raises(GatewaySignatureError, match="不匹配"):
            verify_gateway_signature(headers, "wrong-secret")

    def test_expired_signature_rejected(self) -> None:
        """⚠️ 过期签名被拒（防重放）。"""
        old_timestamp = int(time.time()) - 3600
        headers = sign_gateway_headers(uuid4(), ["admin"], SECRET, timestamp=old_timestamp)

        with pytest.raises(GatewaySignatureExpiredError):
            verify_gateway_signature(headers, SECRET)

    def test_future_timestamp_rejected(self) -> None:
        """⚠️ 未来时间戳被拒 —— 否则能签一个「永远不过期」的。"""
        future = int(time.time()) + 3600
        headers = sign_gateway_headers(uuid4(), ["admin"], SECRET, timestamp=future)

        with pytest.raises(GatewaySignatureError, match="未来"):
            verify_gateway_signature(headers, SECRET)

    def test_missing_fields_rejected(self) -> None:
        """字段缺失被拒。"""
        headers = GatewayHeaders(user_id="", roles="admin", timestamp="1", signature="x")

        with pytest.raises(GatewaySignatureError, match="不完整"):
            verify_gateway_signature(headers, SECRET)

    def test_invalid_timestamp_rejected(self) -> None:
        """时间戳不是数字被拒。"""
        headers = GatewayHeaders(
            user_id=str(uuid4()),
            roles="admin",
            timestamp="not-a-number",
            signature="x",
        )

        with pytest.raises(GatewaySignatureError, match="时间戳"):
            verify_gateway_signature(headers, SECRET)

    def test_empty_secret_rejected(self) -> None:
        """空密钥被拒。"""
        headers = sign_gateway_headers(uuid4(), ["admin"], SECRET)

        with pytest.raises(GatewaySignatureError, match="未配置"):
            verify_gateway_signature(headers, "")

    def test_expected_user_id_mismatch_rejected(self) -> None:
        """⚠️ user_id 与别处解析出的不一致 → 拒绝（防串号）。"""
        headers = sign_gateway_headers(uuid4(), ["admin"], SECRET)

        with pytest.raises(GatewaySignatureError, match="不一致"):
            verify_gateway_signature(headers, SECRET, expected_user_id=uuid4())

    def test_expected_user_id_match_passes(self) -> None:
        """user_id 一致时通过。"""
        user_id = uuid4()
        headers = sign_gateway_headers(user_id, ["admin"], SECRET)

        verify_gateway_signature(headers, SECRET, expected_user_id=user_id)

    def test_ttl_window_respected(self) -> None:
        """⚠️ TTL 边界 —— 超过窗口立即失效。"""
        timestamp = int(time.time()) - 10
        headers = sign_gateway_headers(uuid4(), ["admin"], SECRET, timestamp=timestamp)

        # TTL=60 → 10 秒前还在窗口内
        verify_gateway_signature(headers, SECRET, ttl=60)

        # TTL=5 → 已超窗口
        with pytest.raises(GatewaySignatureExpiredError):
            verify_gateway_signature(headers, SECRET, ttl=5)


class TestRoleList:
    """角色列表解析。"""

    def test_parses_comma_separated(self) -> None:
        """逗号分隔的角色。"""
        headers = GatewayHeaders(
            user_id="u",
            roles="platform_admin,tenant_admin",
            timestamp="1",
            signature="x",
        )

        assert headers.role_list == ["platform_admin", "tenant_admin"]

    def test_empty_roles_gives_empty_list(self) -> None:
        """空角色字符串。"""
        headers = GatewayHeaders(user_id="u", roles="", timestamp="1", signature="x")

        assert headers.role_list == []

    def test_strips_whitespace(self) -> None:
        """去掉空格。"""
        headers = GatewayHeaders(
            user_id="u",
            roles=" admin , editor ",
            timestamp="1",
            signature="x",
        )

        assert headers.role_list == ["admin", "editor"]
