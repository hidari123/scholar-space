"""scholarspace 事件服务 —— 事件总线 + 事件流（SSE 支撑）。

⚠️ 四层架构：
    domain         → DomainEvent / EventType（零外部依赖）
    application    → 用例编排 + 端口协议
    infrastructure → 内存实现（Redis 实现待补）

⚠️ **两个端口的用途不同**：
    EventBusPort    → 「发布出去，让别人处理」（工作流）
    EventStreamPort → 「实时推给客户端看」（SSE）
"""

from scholar_events.application.ports import (
    EventBusPort,
    EventStorePort,
    EventStreamPort,
)
from scholar_events.application.use_cases import (
    EventContext,
    is_terminal,
    publish_event,
    replay_events,
    subscribe_events,
)
from scholar_events.domain.events import DomainEvent, EventType, InvalidEventError
from scholar_events.infrastructure.memory import InMemoryEventStore, InMemoryEventStream

__all__ = [
    "DomainEvent",
    "EventBusPort",
    "EventContext",
    "EventStorePort",
    "EventStreamPort",
    "EventType",
    "InMemoryEventStore",
    "InMemoryEventStream",
    "InvalidEventError",
    "is_terminal",
    "publish_event",
    "replay_events",
    "subscribe_events",
]
