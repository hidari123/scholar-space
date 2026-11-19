"""事件服务测试 —— 序列号 / 落库 / 广播 / 续传。

⚠️ 重点验证三件事：
    ① seq 在流内单调递增（并发下也不重复）
    ② 先落库再推送
    ③ 断线重连能补发历史事件
"""

from __future__ import annotations

import asyncio
import json
from uuid import UUID, uuid4

import pytest

from scholar_events.application.use_cases import (
    EventContext,
    is_terminal,
    publish_event,
    replay_events,
    subscribe_events,
)
from scholar_events.domain.events import DomainEvent, EventType, InvalidEventError
from scholar_events.infrastructure.memory import InMemoryEventStore, InMemoryEventStream


@pytest.fixture
def context() -> EventContext:
    """构造用例上下文。"""
    store = InMemoryEventStore()
    stream = InMemoryEventStream(store)
    return EventContext(store=store, stream=stream)


@pytest.fixture
def stream_id() -> UUID:
    """流 ID。"""
    return uuid4()


def make_event(
    stream_id: UUID,
    event_type: EventType = EventType.NODE_STARTED,
    **kwargs: object,
) -> DomainEvent:
    """构造一个事件。"""
    return DomainEvent(type=event_type, stream_id=stream_id, **kwargs)  # type: ignore[arg-type]


class TestDomainEvent:
    """事件本身。"""

    def test_seq_must_not_be_negative(self) -> None:
        """⚠️ 负数 seq 会让「从 last+1 开始」的续传算错。"""
        with pytest.raises(InvalidEventError, match="序列号不能为负"):
            DomainEvent(type=EventType.NODE_STARTED, stream_id=uuid4(), seq=-1)

    def test_is_terminal_for_run_endings(self) -> None:
        """终止事件。"""
        stream_id = uuid4()

        assert make_event(stream_id, EventType.RUN_SUCCEEDED).is_terminal
        assert make_event(stream_id, EventType.RUN_FAILED).is_terminal
        assert make_event(stream_id, EventType.RUN_CANCELLED).is_terminal

    def test_is_terminal_false_for_node_events(self) -> None:
        """节点事件不是终止事件。"""
        stream_id = uuid4()
        assert not make_event(stream_id, EventType.NODE_STARTED).is_terminal

    def test_to_dict_shape(self) -> None:
        """字典形状。"""
        stream_id = uuid4()
        event = make_event(stream_id, payload={"a": 1})

        data = event.to_dict()
        assert data["type"] == "node.started"
        assert data["stream_id"] == str(stream_id)
        assert data["payload"] == {"a": 1}
        assert "seq" in data
        assert "occurred_at" in data

    def test_to_json_keeps_chinese_readable(self) -> None:
        r"""⚠️ 中文不该被转成 \\uXXXX。

        SSE 是给前端 parse 的，转义了浪费带宽也难调试。
        """
        event = make_event(uuid4(), payload={"text": "根据检索结果"})

        parsed = json.loads(event.to_json())
        assert parsed["payload"]["text"] == "根据检索结果"
        assert "根据检索结果" in event.to_json()

    def test_from_dict_roundtrip(self) -> None:
        """字典往返。"""
        original = make_event(uuid4(), payload={"x": 1})
        restored = DomainEvent.from_dict(original.to_dict())

        assert restored.type == original.type
        assert restored.stream_id == original.stream_id
        assert restored.payload == original.payload
        assert restored.event_id == original.event_id


class TestSequenceNumbers:
    """⚠️ seq 单调递增 —— 这是续传的基础。"""

    @pytest.mark.asyncio
    async def test_seq_increases_per_stream(self, context: EventContext, stream_id: UUID) -> None:
        """同一流内 seq 递增。"""
        first = await publish_event(context, make_event(stream_id))
        second = await publish_event(context, make_event(stream_id))
        third = await publish_event(context, make_event(stream_id))

        assert (first.seq, second.seq, third.seq) == (1, 2, 3)

    @pytest.mark.asyncio
    async def test_seq_is_per_stream_not_global(self, context: EventContext) -> None:
        """⚠️ 不同流的 seq 各自独立。

        全局递增会让不同 run 的事件交织，重连时难定位。
        """
        stream_a = uuid4()
        stream_b = uuid4()

        event_a1 = await publish_event(context, make_event(stream_a))
        event_b1 = await publish_event(context, make_event(stream_b))
        event_a2 = await publish_event(context, make_event(stream_a))

        assert event_a1.seq == 1
        assert event_b1.seq == 1, "不同流应该各自从 1 开始"
        assert event_a2.seq == 2

    @pytest.mark.asyncio
    async def test_concurrent_publish_gets_unique_seqs(
        self, context: EventContext, stream_id: UUID
    ) -> None:
        """⚠️ 并发发布时 seq 不重复。

        不加锁会算出重复的 seq ——
        客户端按 seq 续传就会漏事件。
        """
        events = [make_event(stream_id, EventType.NODE_STARTED) for _ in range(50)]

        results = await asyncio.gather(*(publish_event(context, event) for event in events))

        seqs = [result.seq for result in results]
        assert len(set(seqs)) == 50, "seq 重复了"
        assert sorted(seqs) == list(range(1, 51))

    @pytest.mark.asyncio
    async def test_last_seq_reflects_latest(self, context: EventContext, stream_id: UUID) -> None:
        """last_seq 反映最新值。"""
        for _ in range(3):
            await publish_event(context, make_event(stream_id))

        assert await context.store.last_seq(stream_id) == 3

    @pytest.mark.asyncio
    async def test_last_seq_of_unknown_stream_is_zero(self, context: EventContext) -> None:
        """未知流 → 0。"""
        assert await context.store.last_seq(uuid4()) == 0


class TestStore:
    """事件存储。"""

    @pytest.mark.asyncio
    async def test_read_after_seq_filters(self, context: EventContext, stream_id: UUID) -> None:
        """按 seq 过滤。"""
        for _ in range(5):
            await publish_event(context, make_event(stream_id))

        events = await context.store.read(stream_id, after_seq=2)
        assert [event.seq for event in events] == [3, 4, 5]

    @pytest.mark.asyncio
    async def test_read_respects_limit(self, context: EventContext, stream_id: UUID) -> None:
        """限制条数。"""
        for _ in range(10):
            await publish_event(context, make_event(stream_id))

        events = await context.store.read(stream_id, limit=3)
        assert len(events) == 3

    @pytest.mark.asyncio
    async def test_read_unknown_stream_is_empty(self, context: EventContext) -> None:
        """未知流 → 空。"""
        assert await context.store.read(uuid4()) == ()


class TestReplay:
    """⚠️ 断线重连补发。"""

    @pytest.mark.asyncio
    async def test_replay_from_seq(self, context: EventContext, stream_id: UUID) -> None:
        """从指定 seq 之后补发。"""
        for index in range(5):
            await publish_event(context, make_event(stream_id, payload={"i": index}))

        events = await replay_events(context, stream_id, after_seq=2)
        assert [event.payload["i"] for event in events] == [2, 3, 4]

    @pytest.mark.asyncio
    async def test_replay_all_by_default(self, context: EventContext, stream_id: UUID) -> None:
        """默认从头补发。"""
        for _ in range(3):
            await publish_event(context, make_event(stream_id))

        events = await replay_events(context, stream_id)
        assert len(events) == 3


class TestSubscribe:
    """订阅。"""

    @pytest.mark.asyncio
    async def test_receives_published_events(self, context: EventContext, stream_id: UUID) -> None:
        """收到已发布的事件（历史补发）。"""
        await publish_event(context, make_event(stream_id, payload={"a": 1}))

        received = []
        async for event in subscribe_events(context, stream_id):
            received.append(event)
            break

        assert len(received) == 1
        assert received[0].payload == {"a": 1}

    @pytest.mark.asyncio
    async def test_receives_live_events(self, context: EventContext, stream_id: UUID) -> None:
        """⚠️ 实时收到订阅之后发布的事件。

        ⚠️ **必须先启动消费任务再发布** ——
        异步生成器第一次 `__anext__` 会阻塞在 `queue.get()`，
        同步写「先订阅再发布」会死等。
        """
        received: list[DomainEvent] = []

        async def consume() -> None:
            async for event in subscribe_events(context, stream_id):
                received.append(event)
                return

        task = asyncio.create_task(consume())
        # ⚠️ 等订阅真正建立（队列已注册）
        await asyncio.sleep(0.01)

        await publish_event(context, make_event(stream_id, payload={"live": True}))
        await asyncio.wait_for(task, timeout=2)

        assert len(received) == 1
        assert received[0].payload == {"live": True}

    @pytest.mark.asyncio
    async def test_history_is_replayed_first(self, context: EventContext, stream_id: UUID) -> None:
        """⚠️ 先补历史再推实时。

        顺序反了的话，订阅建立瞬间的事件会漏掉。
        """
        for index in range(3):
            await publish_event(context, make_event(stream_id, payload={"i": index}))

        received = []
        async for event in subscribe_events(context, stream_id):
            received.append(event)
            if len(received) == 3:
                break

        assert [event.payload["i"] for event in received] == [0, 1, 2]

    @pytest.mark.asyncio
    async def test_after_seq_skips_already_seen(
        self, context: EventContext, stream_id: UUID
    ) -> None:
        """⚠️ 跳过已经补发过的。

        客户端带 `Last-Event-ID: 2` → 不该再收到 seq ≤ 2 的。
        """
        for index in range(5):
            await publish_event(context, make_event(stream_id, payload={"i": index}))

        received = []
        async for event in subscribe_events(context, stream_id, after_seq=2):
            received.append(event)
            if len(received) == 2:
                break

        # ⚠️ payload 的 `i` 是 0-indexed，seq 是 1-indexed ——
        #    seq 3 对应 i=2。别把两者搞混。
        assert [event.seq for event in received] == [3, 4]
        assert [event.payload["i"] for event in received] == [2, 3]

    @pytest.mark.asyncio
    async def test_broadcast_to_all_subscribers(
        self, context: EventContext, stream_id: UUID
    ) -> None:
        """⚠️ 广播语义 —— 所有订阅者都收到。

        不是工作队列语义（一个事件只给一个人）。
        """
        received_a: list[DomainEvent] = []
        received_b: list[DomainEvent] = []

        async def consume(target: list[DomainEvent]) -> None:
            async for event in subscribe_events(context, stream_id):
                target.append(event)
                if len(target) == 2:
                    return

        task_a = asyncio.create_task(consume(received_a))
        task_b = asyncio.create_task(consume(received_b))
        await asyncio.sleep(0.01)

        await publish_event(context, make_event(stream_id, payload={"a": 1}))
        await publish_event(context, make_event(stream_id, payload={"a": 2}))

        await asyncio.wait_for(asyncio.gather(task_a, task_b), timeout=2)

        assert len(received_a) == 2
        assert len(received_b) == 2

    @pytest.mark.asyncio
    async def test_aclose_cleans_up(self, context: EventContext, stream_id: UUID) -> None:
        """⚠️ 显式 `aclose()` → 生成器关闭 → finally 执行 → 队列清理。

        ⚠️ **这是 SSE 断连时的正确做法** ——
        依赖 GC 关闭生成器会延迟很久，
        长时间跑的进程里队列会堆积。
        """
        stream = context.stream
        assert isinstance(stream, InMemoryEventStream)

        # ⚠️ 先发一条 —— 否则推进生成器会阻塞在 queue.get()
        await publish_event(context, make_event(stream_id))

        generator = subscribe_events(context, stream_id)
        first = await generator.__anext__()
        assert first is not None

        # 订阅已注册
        assert stream._subscribers.get(stream_id)

        # 关闭生成器 → 触发 finally → 清理队列
        await generator.aclose()

        subscribers = stream._subscribers.get(stream_id)
        assert not subscribers, "订阅者队列没被清理 —— 内存泄漏"

    @pytest.mark.asyncio
    async def test_unsubscribe_removes_all_subscribers(
        self, context: EventContext, stream_id: UUID
    ) -> None:
        """⚠️ 显式 `unsubscribe()` 清掉某流的所有订阅。

        SSE 客户端断开时用 —— 一次清干净，不等 GC。
        """
        stream = context.stream
        assert isinstance(stream, InMemoryEventStream)

        await publish_event(context, make_event(stream_id))

        generators = [subscribe_events(context, stream_id) for _ in range(3)]
        for generator in generators:
            await generator.__anext__()

        assert len(stream._subscribers.get(stream_id, set())) == 3

        await stream.unsubscribe(stream_id)

        assert not stream._subscribers.get(stream_id)

        # 清理生成器，避免测试结束时告警
        for generator in generators:
            await generator.aclose()


class TestIsTerminal:
    """终止事件判定。"""

    def test_matches_event_property(self) -> None:
        """与事件自身的属性一致。"""
        stream_id = uuid4()

        for event_type in (EventType.RUN_SUCCEEDED, EventType.RUN_FAILED):
            event = make_event(stream_id, event_type)
            assert is_terminal(event) == event.is_terminal
