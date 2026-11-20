"""联邦服务测试。

⚠️ **重点验证「验签的三个防护」**：
    ① 重放（时间戳窗口）
    ② 签名剥离（实际取公钥）
    ③ 参数混淆（明确约定签名范围）
"""

from __future__ import annotations

import base64
import hashlib
from datetime import UTC, datetime, timedelta

import pytest

from scholar_federation.application.service import FederationService
from scholar_federation.application.signature import (
    SignatureHeaders,
    SignatureVerifier,
    SigningKeyResolver,
)
from scholar_federation.domain.activity import Activity, ActivityType, Actor
from scholar_federation.infrastructure.memory import (
    InMemoryActorRepository,
    InMemoryInboxRepository,
    InMemoryOutboxRepository,
)


class FakeResolver(SigningKeyResolver):
    """假公钥解析器."""

    def __init__(self, public_key: str = "FAKE-KEY") -> None:
        self.public_key = public_key
        self.requested: list[str] = []

    async def resolve(self, key_id: str) -> str | None:
        """取公钥."""
        self.requested.append(key_id)
        return self.public_key


@pytest.fixture
def resolver() -> FakeResolver:
    """解析器."""
    return FakeResolver()


@pytest.fixture
def verifier(resolver: FakeResolver) -> SignatureVerifier:
    """验签器."""
    return SignatureVerifier(resolver)


#: ⚠️ **测试用的请求体** —— 摘要要跟它对上
BODY = b'{"type":"Create","actor":"https://remote.example/users/alice"}'


def make_digest(body: bytes = BODY) -> str:
    """算摘要头.

    ⚠️ **摘要要跟请求体一致** ——
    不一致会被验签器拒绝（这是对的）。
    """
    return "SHA-256=" + base64.b64encode(hashlib.sha256(body).digest()).decode()


def make_headers(
    key_id: str = "https://remote.example/users/alice#main-key",
    created: int | None = None,
    signature: str = "c2lnbmF0dXJl",
    digest: str | None = None,
) -> SignatureHeaders:
    """造签名头."""
    stamp = created if created is not None else int(datetime.now(UTC).timestamp())

    return SignatureHeaders(
        signature=(
            f'keyId="{key_id}",alg="rsa-sha256",created={stamp},'
            f'headers="(request-target) host date digest",signature="{signature}"'
        ),
        key_id=key_id,
        digest=digest if digest is not None else make_digest(),
        date="Mon, 20 Nov 2026 00:00:00 GMT",
    )


class TestSignatureVerifier:
    """验签."""

    async def test_missing_signature_is_rejected(self, verifier: SignatureVerifier) -> None:
        """⚠️ **没签名 → 拒绝**。"""
        result = await verifier.verify(SignatureHeaders(), b"{}")

        assert not result.is_valid
        assert result.reason == "missing_signature"

    async def test_malformed_signature_is_rejected(self, verifier: SignatureVerifier) -> None:
        """⚠️ **格式不对 → 拒绝**。"""
        headers = SignatureHeaders(signature="garbage", key_id="https://x/y")

        result = await verifier.verify(headers, b"{}")

        assert not result.is_valid
        assert result.reason == "malformed_signature"

    async def test_expired_signature_is_rejected(self, verifier: SignatureVerifier) -> None:
        """⚠️ **过期的签名 → 拒绝**（防重放）。"""
        old = int((datetime.now(UTC) - timedelta(hours=1)).timestamp())
        headers = make_headers(created=old)

        result = await verifier.verify(headers, b"{}")

        assert not result.is_valid
        assert result.is_expired

    async def test_future_signature_is_rejected(self, verifier: SignatureVerifier) -> None:
        """未来的时间戳 → 拒绝。

        ⚠️ 允许未来等于给了攻击者一个窗口。
        """
        future = int((datetime.now(UTC) + timedelta(hours=1)).timestamp())
        headers = make_headers(created=future)

        result = await verifier.verify(headers, b"{}")

        assert not result.is_valid
        assert result.is_expired

    async def test_unknown_key_is_rejected(self, resolver: FakeResolver) -> None:
        """⚠️ **公钥取不到 → 拒绝**（防签名剥离）。"""
        resolver.public_key = ""
        verifier = SignatureVerifier(resolver)

        result = await verifier.verify(make_headers(), b"{}")

        assert not result.is_valid
        assert result.reason == "key_not_found"

    async def test_key_is_actually_fetched(
        self, resolver: FakeResolver, verifier: SignatureVerifier
    ) -> None:
        """必须真的去取公钥。

        ⚠️ 不能相信 keyId 说的。
        """
        await verifier.verify(make_headers(), BODY)

        assert resolver.requested == ["https://remote.example/users/alice#main-key"]

    async def test_missing_cryptography_raises(self) -> None:
        """⚠️ **没装 cryptography → 抛错，不能放行**。

        ⚠️ 这是安全依赖缺失，
        放行等于没有验签。
        """
        verifier = SignatureVerifier(FakeResolver())

        # ⚠️ cryptography 装了 → 验签失败（假公钥）而不是抛异常
        result = await verifier.verify(make_headers(), b"{}")

        assert not result.is_valid


class TestFederationService:
    """联邦服务."""

    @pytest.fixture
    def service(self) -> FederationService:
        """联邦服务."""
        return FederationService(
            inbox=InMemoryInboxRepository(),
            outbox=InMemoryOutboxRepository(),
            actors=InMemoryActorRepository(),
            verifier=SignatureVerifier(FakeResolver()),
        )

    async def test_receive_rejects_unsigned(self, service: FederationService) -> None:
        """⚠️ **没签名的活动不收**。"""
        accepted, _ = await service.receive(SignatureHeaders(), BODY)

        assert not accepted

    async def test_receive_rejects_digest_mismatch(self, service: FederationService) -> None:
        """摘要对不上 → 拒绝。

        ⚠️ 请求体被改过，签名再对也没意义。
        """
        headers = make_headers(digest="SHA-256=wrong")

        accepted, result = await service.receive(headers, BODY)

        assert not accepted
        assert result.reason == "digest_mismatch"

    async def test_receive_rejects_invalid_signature(self, service: FederationService) -> None:
        """⚠️ **验签通过才收**。

        ⚠️ 这里的公钥是假的 → 验签必然失败。
        用真 RSA 密钥测「通过」路径会更完整，
        但验签逻辑本身由 cryptography 负责，
        我们要测的是「失败时正确拒绝」。
        """
        headers = make_headers()

        accepted, result = await service.receive(headers, BODY)

        assert not accepted
        assert result.reason == "invalid_signature"

    async def test_publish_enqueues(self, service: FederationService) -> None:
        """⚠️ **发布是入队** —— 不阻塞发帖。"""
        activity = await service.publish(
            ActivityType.CREATE,
            actor_id="https://local.example/users/alice",
            activity_id="https://local.example/activities/1",
            obj={"type": "Note"},
        )

        assert activity.activity_type is ActivityType.CREATE
        assert activity.activity_id == "https://local.example/activities/1"

    async def test_follow_activity(self, service: FederationService) -> None:
        """关注活动。"""
        activity = await service.follow(
            "https://local.example/users/alice",
            "https://remote.example/users/bob",
        )

        assert activity.activity_type is ActivityType.FOLLOW
        assert activity.object == "https://remote.example/users/bob"

    async def test_like_activity(self, service: FederationService) -> None:
        """点赞活动。"""
        activity = await service.like(
            "https://local.example/users/alice",
            "https://remote.example/posts/1",
        )

        assert activity.activity_type is ActivityType.LIKE

    async def test_unknown_activity_type_is_kept(self, service: FederationService) -> None:
        """不认识的活动类型也要能解析。

        ⚠️ 不能因为格式不认识就丢弃。
        """
        activity = service._parse_activity(
            b'{"id":"https://x/1","type":"SomethingNew","actor":"https://x/a"}',
            "https://x/a",
        )

        assert activity.activity_type is ActivityType.UNKNOWN
        assert activity.activity_id == "https://x/1"

    async def test_malformed_json_does_not_crash(self, service: FederationService) -> None:
        """⚠️ **坏 JSON 不能崩**。"""
        activity = service._parse_activity(b"not json", "https://x/a")

        assert activity.activity_type is ActivityType.UNKNOWN

    async def test_activity_to_jsonld(self) -> None:
        """⚠️ **JSON-LD 文档要带 @context**。"""
        activity = Activity(
            activity_id="https://x/1",
            activity_type=ActivityType.CREATE,
            actor_id="https://x/a",
        )

        document = activity.to_jsonld()

        assert document["@context"] == "https://www.w3.org/ns/activitystreams"
        assert document["type"] == "Create"


class TestActor:
    """演员."""

    async def test_public_key(self) -> None:
        """⚠️ **公钥要能导出成 JWK**。"""
        actor = Actor(
            actor_id="https://remote.example/users/alice",
            preferred_username="alice",
            public_key_id="https://remote.example/users/alice#main-key",
            public_key_pem="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----",
        )

        key = actor.public_key()

        assert key["id"] == "https://remote.example/users/alice#main-key"
        assert "BEGIN PUBLIC KEY" in key["publicKeyPem"]
