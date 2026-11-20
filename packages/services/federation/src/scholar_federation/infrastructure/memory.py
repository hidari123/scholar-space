"""内存实现 —— 开发与测试用。"""

from __future__ import annotations

import asyncio

from scholar_federation.domain.activity import Activity, Actor, InboxItem

__all__ = [
    "InMemoryActorRepository",
    "InMemoryInboxRepository",
    "InMemoryOutboxRepository",
]


class InMemoryInboxRepository:
    """内存收件箱."""

    def __init__(self) -> None:
        self._items: dict[str, InboxItem] = {}
        self._lock = asyncio.Lock()

    async def add(self, item: InboxItem) -> InboxItem:
        """存入收件箱."""
        async with self._lock:
            self._items[item.item_id] = item

        return item

    async def list_pending(self, limit: int = 50) -> tuple[InboxItem, ...]:
        """待处理的条目."""
        pending = [item for item in self._items.values() if item.status == "pending"]
        return tuple(pending[:limit])

    async def mark_done(self, item_id: str) -> bool:
        """标记处理完成."""
        item = self._items.get(item_id)
        if item is None:
            return False

        self._items[item_id] = InboxItem(
            item_id=item.item_id,
            activity_id=item.activity_id,
            actor_id=item.actor_id,
            raw=item.raw,
            status="done",
            received_action=item.received_action,
            received_at=item.received_at,
        )
        return True

    async def exists_activity(self, activity_id: str) -> bool:
        """活动是否已经收过（幂等）."""
        return any(item.activity_id == activity_id for item in self._items.values())


class InMemoryOutboxRepository:
    """内存发件箱."""

    def __init__(self) -> None:
        self._activities: dict[str, Activity] = {}
        self._lock = asyncio.Lock()

    async def enqueue(self, activity: Activity) -> Activity:
        """入队待发."""
        async with self._lock:
            self._activities[activity.activity_id] = activity

        return activity

    async def list_pending(self, limit: int = 50) -> tuple[Activity, ...]:
        """待发的活动."""
        return tuple(list(self._activities.values())[:limit])

    async def mark_sent(self, activity_id: str) -> bool:
        """标记已发."""
        return self._activities.pop(activity_id, None) is not None


class InMemoryActorRepository:
    """内存演员仓储."""

    def __init__(self) -> None:
        self._actors: dict[str, Actor] = {}
        self._lock = asyncio.Lock()

    async def get(self, actor_id: str) -> Actor | None:
        """取演员."""
        return self._actors.get(actor_id)

    async def save(self, actor: Actor) -> Actor:
        """保存演员."""
        async with self._lock:
            self._actors[actor.actor_id] = actor

        return actor
