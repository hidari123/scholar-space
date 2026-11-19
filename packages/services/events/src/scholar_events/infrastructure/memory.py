"""内存实现 —— 开发与测试用。

⚠️ **内存实现是「正确」的参考实现** ——
Redis 实现必须与它行为一致（同样的 seq 分配、同样的续传语义）。

生产环境用 Redis（`redis.py`），但那是 M5 的事。
"""

from __future__ import annotations

import asyncio
from collections import defaultdict
from collections.abc import AsyncIterator
from dataclasses import replace
from uuid import UUID

from scholar_events.domain.events import DomainEvent

__all__ = [
    "InMemoryEventStore",
    "InMemoryEventStream",
]


class InMemoryEventStore:
    """内存事件存储。"""

    def __init__(self) -> None:
        #: 流 ID → 事件列表（按 seq 升序）
        self._streams: dict[UUID, list[DomainEvent]] = defaultdict(list)
        #: 流 ID → 当前最大 seq
        self._seqs: dict[UUID, int] = defaultdict(int)
        #: ⚠️ 锁 —— 保证 seq 分配不会并发冲突
        self._lock = asyncio.Lock()

    async def append(self, event: DomainEvent) -> DomainEvent:
        """追加事件并分配 seq。

        ⚠️ **seq 在锁内分配** ——
        多个发布者并发时，不加锁会算出重复的 seq，
        客户端按 seq 续传就会漏事件。

        ⚠️ 事件本身是不可变的 —— 分配 seq 时用 `replace` 生成新对象，
        不改原对象（调用方手里可能还拿着它）。
        """
        async with self._lock:
            next_seq = self._seqs[event.stream_id] + 1
            self._seqs[event.stream_id] = next_seq

            stored = _with_seq(event, next_seq)
            self._streams[event.stream_id].append(stored)

        return stored

    async def read(
        self,
        stream_id: UUID,
        after_seq: int = 0,
        limit: int = 100,
    ) -> tuple[DomainEvent, ...]:
        """读取事件（seq > after_seq）。"""
        events = self._streams.get(stream_id, [])
        selected = [event for event in events if event.seq > after_seq]
        return tuple(selected[:limit])

    async def last_seq(self, stream_id: UUID) -> int:
        """取当前最大 seq。"""
        return self._seqs.get(stream_id, 0)


class InMemoryEventStream:
    """内存事件流 —— 实时推送。

    ⚠️ **每个订阅者一个队列** ——
    广播语义（一个事件，所有订阅者都收到），
    不是工作队列语义（一个事件，只有一个消费者拿到）。
    """

    def __init__(self, store: InMemoryEventStore | None = None) -> None:
        self._store = store or InMemoryEventStore()
        #: 流 ID → 订阅者队列集合
        self._subscribers: dict[UUID, set[asyncio.Queue[DomainEvent]]] = defaultdict(set)

    @property
    def store(self) -> InMemoryEventStore:
        """底层存储。"""
        return self._store

    async def push(self, event: DomainEvent) -> None:
        """推送到已订阅的队列。

        ⚠️ **只推送，不落库** ——
           落库由 `EventStorePort.append()` 负责。
           两边都做的话，事件会被存两遍，seq 跳号。

        ⚠️ 用例层 `publish_event()` 的调用顺序：
            store.append(event)  → 分配 seq + 落库
            stream.push(stored)  → 推给订阅者
        """
        for queue in list(self._subscribers.get(event.stream_id, set())):
            # ⚠️ put_nowait 可能在队列满时抛 QueueFull ——
            #    队列是有界的，慢消费者不该拖垮发布者。
            try:
                queue.put_nowait(event)
            except asyncio.QueueFull:
                # ⚠️ 慢消费者：丢弃这条。
                #    事件已经落库了，客户端重连时能补回来。
                continue

    async def publish(self, event: DomainEvent) -> None:
        """发布到流（落库 + 推送）。

        ⚠️ **这是「一步到位」的便捷方法** ——
           直接调用它时事件会被落库一次。
           用例层应该用 `store.append()` + `stream.push()`，
           避免重复落库。
        """
        stored = await self._store.append(event)
        await self.push(stored)

    async def subscribe(
        self,
        stream_id: UUID,
        after_seq: int = 0,
    ) -> AsyncIterator[DomainEvent]:
        """订阅流。

        ⚠️ **先补历史再推实时** ——
        顺序反了的话，订阅建立瞬间的事件会漏掉。

        ⚠️ 补历史与建立订阅之间有**竞态窗口** ——
        真实实现（Redis）用「补历史 + 记录当前 seq + 推送增量」解决，
        内存版靠 `asyncio` 单线程语义把窗口压到极小。
        """
        queue: asyncio.Queue[DomainEvent] = asyncio.Queue(maxsize=1000)
        self._subscribers[stream_id].add(queue)

        try:
            # ① 补历史
            history = await self._store.read(stream_id, after_seq=after_seq, limit=1000)
            for event in history:
                yield event

            # ② 推实时
            while True:
                event = await queue.get()
                # ⚠️ 跳过已经补发过的（seq <= after_seq）
                if event.seq <= after_seq:
                    continue
                yield event
        finally:
            # ⚠️ 一定要清理 —— 否则订阅者断开后队列还挂在字典里，
            #    内存泄漏。
            #
            #    ⚠️ **`finally` 只在生成器被关闭时执行** ——
            #    调用方 `break` 出 async for 时，生成器要等 GC 才会关闭。
            #    所以清理不能只靠 finally，还要提供显式的 `unsubscribe`。
            self._subscribers[stream_id].discard(queue)

    async def unsubscribe(self, stream_id: UUID) -> None:
        """显式取消某流的所有订阅。

        ⚠️ **SSE 断连时必须调这个** ——
           依赖 GC 关闭生成器会延迟很久，
           长时间跑的进程里队列会堆积。
        """
        self._subscribers.pop(stream_id, None)


def _with_seq(event: DomainEvent, seq: int) -> DomainEvent:
    """生成带指定 seq 的事件副本。

    ⚠️ 用 `replace` 而不是改原对象 ——
       调用方手里可能还拿着它，而事件是不可变的。
    """
    return replace(event, seq=seq)
