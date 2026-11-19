"""用例 —— 事件发布与订阅。

⚠️ 这一层做三件事：
    ① 分配序列号（保证流内单调递增）
    ② 落库（保证断线能补发）
    ③ 推送（保证实时）
"""

from __future__ import annotations

from collections.abc import AsyncGenerator, AsyncIterator
from dataclasses import dataclass
from uuid import UUID

from scholar_events.application.ports import EventStorePort, EventStreamPort
from scholar_events.domain.events import DomainEvent, EventType

__all__ = [
    "EventContext",
    "publish_event",
    "replay_events",
    "subscribe_events",
]


@dataclass(frozen=True, slots=True)
class EventContext:
    """用例上下文 —— 打包存储与流。

    ⚠️ 与 auth / llm 服务同一个思路：参数打包，依赖关系一目了然。
    """

    #: 事件存储
    store: EventStorePort
    #: 事件流（实时推送）
    stream: EventStreamPort


async def publish_event(
    context: EventContext,
    event: DomainEvent,
) -> DomainEvent:
    """发布事件。

    :param context: 用例上下文
    :param event: 要发布的事件
    :return 带 seq 的事件
    """
    # ⚠️ **先落库再推送** ——
    #    反过来的话，客户端收到的事件可能还没持久化，
    #    断线重连时补不回来。
    #
    # ⚠️ **只 append 一次** ——
    #    `InMemoryEventStream.publish()` 内部也会 append 到同一个 store，
    #    如果这里先 append 再 publish，事件会被存两遍，
    #    seq 变成 1, 3, 5（每次跳两个）。
    #
    #    正确的分工：
    #    · store.append()  分配 seq 并落库
    #    · stream.publish() **只推送**，不重复落库
    stored = await context.store.append(event)
    await context.stream.push(stored)
    return stored


async def replay_events(
    context: EventContext,
    stream_id: UUID,
    after_seq: int = 0,
    limit: int = 100,
) -> tuple[DomainEvent, ...]:
    """回放历史事件。

    ⚠️ SSE 断线重连时用 —— 客户端带 `Last-Event-ID`，
    服务端从 `after_seq + 1` 开始补发。
    """
    return await context.store.read(stream_id, after_seq=after_seq, limit=limit)


async def subscribe_events(
    context: EventContext,
    stream_id: UUID,
    after_seq: int = 0,
) -> AsyncIterator[DomainEvent]:
    """订阅事件流（先补历史再推实时）。

    ⚠️ **必须把 `aclose` 透传给内层生成器** ——
       简单写 `async for ... in stream.subscribe(...): yield ...` 会**漏掉清理**：
       外层生成器关闭时不会自动关闭内层，
       内层的 `finally`（清理订阅队列）永远不执行 → 内存泄漏。

       正确做法是抓住内层生成器，在外层被关闭时显式 `aclose()` 它。
    """
    # ⚠️ 显式标注成 AsyncGenerator —— 只有它有 `aclose()`。
    #    `AsyncIterator` 没有 `aclose`，清理逻辑就写不出来。
    inner: AsyncGenerator[DomainEvent] = context.stream.subscribe(
        stream_id,
        after_seq=after_seq,
    )

    try:
        async for event in inner:
            yield event
    finally:
        # ⚠️ 透传关闭 —— 让内层的 finally 执行
        await inner.aclose()


def is_terminal(event: DomainEvent) -> bool:
    """是否是终止事件。

    ⚠️ 订阅方据此结束等待 —— 不用轮询。
    """
    return event.type in {
        EventType.RUN_SUCCEEDED,
        EventType.RUN_FAILED,
        EventType.RUN_CANCELLED,
    }
