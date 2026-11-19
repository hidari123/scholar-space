"""端口 —— 事件总线与事件流。

⚠️ **orchestra 只依赖这些协议，不依赖任何实现** ——
实现放在 `events` 包（Redis / 内存），orchestra 换存储不用改代码。
"""

from __future__ import annotations

from collections.abc import AsyncGenerator, AsyncIterator
from typing import Protocol, runtime_checkable
from uuid import UUID

from scholar_events.domain.events import DomainEvent

__all__ = [
    "EventBusPort",
    "EventStorePort",
    "EventStreamPort",
]


@runtime_checkable
class EventStorePort(Protocol):
    """事件存储端口。

    ⚠️ 存在的理由：**断线重连要能补发历史事件**。
       只靠「发布 → 实时推送」的话，客户端断线期间的事件就永久丢了。
    """

    async def append(self, event: DomainEvent) -> DomainEvent:
        """追加事件 —— 分配 seq 并持久化。

        ⚠️ 返回**带 seq 的事件** —— seq 由存储侧分配，
        保证流内严格递增（多个发布者并发时也能有序）。
        """
        ...

    async def read(
        self,
        stream_id: UUID,
        after_seq: int = 0,
        limit: int = 100,
    ) -> tuple[DomainEvent, ...]:
        """读取某流的事件（seq > after_seq）。"""
        ...

    async def last_seq(self, stream_id: UUID) -> int:
        """取某流当前最大 seq。

        ⚠️ 用来算「下一个事件的 seq」—— 单调递增的唯一保证。
        """
        ...


@runtime_checkable
class EventBusPort(Protocol):
    """事件总线端口。"""

    async def publish(self, event: DomainEvent) -> DomainEvent:
        """发布事件。

        ⚠️ **返回带 seq 的事件** —— 调用方要用 seq 回应客户端。
        """
        ...

    async def subscribe(self, stream_id: UUID) -> AsyncIterator[DomainEvent]:
        """订阅某流的事件。"""
        ...


@runtime_checkable
class EventStreamPort(Protocol):
    """事件流端口 —— SSE 推送用。

    ⚠️ 与 `EventBusPort` 分开是因为用途不同：
    · Bus  → 「发布出去，让别人处理」（工作流）
    · Stream → 「实时推给客户端看」（SSE）
    """

    async def publish(self, event: DomainEvent) -> None:
        """发布到流（落库 + 推送）。"""
        ...

    async def push(self, event: DomainEvent) -> None:
        """只推送，不落库。

        ⚠️ 用例层的正确顺序是：
            store.append(event)  → 分配 seq + 落库
            stream.push(stored)  → 推给订阅者

        ⚠️ **不能用 publish() 代替** ——
           publish() 内部也会落库，两边都做的话事件存两遍、seq 跳号。
        """
        ...

    def subscribe(
        self,
        stream_id: UUID,
        after_seq: int = 0,
    ) -> AsyncGenerator[DomainEvent]:
        """订阅流（可从指定 seq 之后开始）。

        ⚠️ **这是异步生成器，不是协程** ——
           直接 `async for` 迭代，不要 `await`。

        ⚠️ **不能用 `async def` 声明** ——
           那会让 mypy 把它当成协程（返回 Coroutine 而非 AsyncGenerator），
           调用处 `async for` 就类型不匹配了。

        ⚠️ **返回类型必须是 `AsyncGenerator` 而不是 `AsyncIterator`** ——
           只有前者有 `aclose()`。
           调用方要靠它把关闭信号透传给内层，清理订阅队列。

        ⚠️ 调用方负责 `aclose()` —— 不关的话订阅队列会泄漏。
        """
        ...


@runtime_checkable
class AsyncEventIterable(Protocol):
    """异步可迭代对象协议。

    ⚠️ 单独定义是因为 `subscribe()` 在 Protocol 里
       声明成协程的话，mypy 会拒绝 `async for`。
    """

    def __aiter__(self) -> AsyncIterator[DomainEvent]:
        """返回异步迭代器。"""
        ...
