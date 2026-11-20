"""收发箱服务 —— ActivityPub 的进出。

⚠️ **inbox 是「先收下，再处理」** ——
网络请求要尽快返回（对方会超时重试），
所以先落库返回 202，处理放到后台。

⚠️ **不认识的活动也要记** ——
审计 + 将来重放。静默丢弃会让人以为「没收到过」。
"""

from __future__ import annotations

import json
from typing import Any, Protocol, runtime_checkable

from scholar_federation.application.signature import (
    SignatureHeaders,
    SignatureVerifier,
    VerificationResult,
)
from scholar_federation.domain.activity import (
    Activity,
    ActivityType,
    Actor,
    InboxItem,
)

__all__ = [
    "ActorRepositoryPort",
    "FederationService",
    "InboxRepositoryPort",
    "OutboxRepositoryPort",
]


@runtime_checkable
class InboxRepositoryPort(Protocol):
    """收件箱仓储端口."""

    async def add(self, item: InboxItem) -> InboxItem:
        """存入收件箱."""
        ...

    async def list_pending(self, limit: int = 50) -> tuple[InboxItem, ...]:
        """待处理的条目."""
        ...

    async def mark_done(self, item_id: str) -> bool:
        """标记处理完成."""
        ...

    async def exists_activity(self, activity_id: str) -> bool:
        """活动是否已经收过（幂等）."""
        ...


@runtime_checkable
class OutboxRepositoryPort(Protocol):
    """发件箱仓储端口."""

    async def enqueue(self, activity: Activity) -> Activity:
        """入队待发."""
        ...

    async def list_pending(self, limit: int = 50) -> tuple[Activity, ...]:
        """待发的活动."""
        ...

    async def mark_sent(self, activity_id: str) -> bool:
        """标记已发."""
        ...


@runtime_checkable
class ActorRepositoryPort(Protocol):
    """演员仓储端口."""

    async def get(self, actor_id: str) -> Actor | None:
        """取演员."""
        ...

    async def save(self, actor: Actor) -> Actor:
        """保存演员."""
        ...


class FederationService:
    """联邦服务."""

    def __init__(
        self,
        inbox: InboxRepositoryPort,
        outbox: OutboxRepositoryPort,
        actors: ActorRepositoryPort,
        verifier: SignatureVerifier,
    ) -> None:
        """初始化.

        :param inbox: 收件箱仓储
        :param outbox: 发件箱仓储
        :param actors: 演员仓储
        :param verifier: 验签器
        """
        self._inbox = inbox
        self._outbox = outbox
        self._actors = actors
        self._verifier = verifier

    # ══════════════════════════════════════════════════
    # 收
    # ══════════════════════════════════════════════════

    async def receive(
        self,
        headers: SignatureHeaders,
        body: bytes,
        method: str = "POST",
        path: str = "/inbox",
    ) -> tuple[bool, VerificationResult]:
        """接收一个入站活动.

        ⚠️ **先验签，再落库** ——
        没验签的东西不能进收件箱。

        ⚠️ **返回 (是否接受, 验签结果)** ——
        上层据此决定返回 202 还是 401。

        :param headers: 签名头
        :param body: 请求体
        :param method: HTTP 方法
        :param path: 请求路径
        :return: (是否接受, 验签结果)
        """
        verification = await self._verifier.verify(
            headers,
            body,
            method=method,
            path=path,
        )

        if not verification.is_valid:
            return False, verification

        activity = self._parse_activity(body, verification.actor_id)

        # ⚠️ **幂等** —— 对方重发不能重复处理
        if await self._inbox.exists_activity(activity.activity_id):
            return True, verification

        await self._inbox.add(
            InboxItem(
                item_id=f"inbox-{activity.activity_id}",
                activity_id=activity.activity_id,
                actor_id=verification.actor_id,
                raw=activity.extra,
            )
        )

        return True, verification

    def _parse_activity(self, body: bytes, actor_id: str) -> Activity:
        """解析活动 JSON.

        ⚠️ **解析失败也要能收下** ——
        记成 UNKNOWN 类型，不能因为格式不认识就丢弃。
        """
        try:
            payload = json.loads(body)
        except (ValueError, TypeError):
            payload = {}

        if not isinstance(payload, dict):
            payload = {}

        raw_type = str(payload.get("type", "Unknown"))
        try:
            activity_type = ActivityType(raw_type)
        except ValueError:
            activity_type = ActivityType.UNKNOWN

        activity_id = str(payload.get("id", ""))
        str(payload.get("published", ""))

        return Activity(
            activity_id=activity_id,
            activity_type=activity_type,
            actor_id=str(payload.get("actor", actor_id)),
            object=payload.get("object"),
            extra=payload,
        )

    # ══════════════════════════════════════════════════
    # 发
    # ══════════════════════════════════════════════════

    async def publish(
        self,
        activity_type: ActivityType,
        actor_id: str,
        activity_id: str,
        obj: Any = None,
    ) -> Activity:
        """发布一个出站活动.

        ⚠️ **先入队，由后台发送** ——
        ActivityPub 的投递可能失败（对方宕了），
        不能阻塞发帖流程。

        :param activity_type: 活动类型
        :param actor_id: 执行者
        :param activity_id: 活动 ID（完整 URL）
        :param obj: 对象
        :return: 排队的活动
        """
        activity = Activity(
            activity_id=activity_id,
            activity_type=activity_type,
            actor_id=actor_id,
            object=obj,
        )

        return await self._outbox.enqueue(activity)

    async def follow(self, actor_id: str, target_actor_id: str) -> Activity:
        """关注一个远端演员."""
        activity_id = f"{actor_id}/follow/{target_actor_id}"

        return await self.publish(
            ActivityType.FOLLOW,
            actor_id=actor_id,
            activity_id=activity_id,
            obj=target_actor_id,
        )

    async def like(self, actor_id: str, post_url: str) -> Activity:
        """点赞一个远端帖子."""
        activity_id = f"{actor_id}/like/{post_url}"

        return await self.publish(
            ActivityType.LIKE,
            actor_id=actor_id,
            activity_id=activity_id,
            obj=post_url,
        )

    # ══════════════════════════════════════════════════
    # 演员
    # ══════════════════════════════════════════════════

    async def resolve_actor(self, actor_id: str) -> Actor | None:
        """取演员（本地缓存）."""
        return await self._actors.get(actor_id)

    async def save_actor(self, actor: Actor) -> Actor:
        """保存演员."""
        return await self._actors.save(actor)
