"""领域事件 —— 纯数据，零外部依赖。

⚠️ 这一层回答的是「**发生了什么**」，不关心「怎么传」。

    domain         → DomainEvent / EventType
    application    → 端口（EventBusPort / EventStreamPort）
    infrastructure → 内存实现 / Redis 实现

---

## 为什么事件要有 `seq`（序列号）

SSE 断线重连时，客户端带 `Last-Event-ID: 42` 来问「42 之后的事件给我」。

没有序列号就**只能重新拉全部** ——
大 run 的事件可能有几千条，全量重发浪费带宽也浪费客户端算力。

所以每条事件带一个**单调递增**的 `seq`，
存储侧按 `seq` 区间查询，重连时从 `last + 1` 开始。

⚠️ 序列号是**每个流（run_id）内**递增，不是全局 ——
全局递增会让不同 run 的事件交织，重连时更难定位。
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import StrEnum
from typing import Any
from uuid import UUID, uuid4

__all__ = [
    "DomainEvent",
    "EventType",
    "InvalidEventError",
]


class EventType(StrEnum):
    """事件类型。

    ⚠️ 命名用 `域.动作` —— 订阅方可以按前缀订阅
       （如 `node.*` 订阅所有节点事件）。

    ⚠️ **这批类型是 orchestra 的编排事件** ——
    业务事件（用户注册、订阅变更）在各自领域定义，
    通过 events 服务转发，不混在这里。
    """

    # ── 生命周期 ────────────────────────────────────────
    RUN_STARTED = "run.started"
    RUN_SUCCEEDED = "run.succeeded"
    RUN_FAILED = "run.failed"
    RUN_CANCELLED = "run.cancelled"

    # ── 节点 ────────────────────────────────────────────
    NODE_STARTED = "node.started"
    NODE_SUCCEEDED = "node.succeeded"
    NODE_FAILED = "node.failed"
    NODE_SKIPPED = "node.skipped"

    # ── 流式 ────────────────────────────────────────────
    NODE_STREAM = "node.stream"

    # ── 工具 ────────────────────────────────────────────
    TOOL_INVOKED = "tool.invoked"
    TOOL_COMPLETED = "tool.completed"

    # ── 协作 ────────────────────────────────────────────
    AGENT_DELEGATED = "agent.delegated"
    AGENT_COMPLETED = "agent.completed"

    # ── 人工 ────────────────────────────────────────────
    HUMAN_REQUIRED = "human.required"
    HUMAN_RESOLVED = "human.resolved"

    # ── 心跳 ────────────────────────────────────────────
    HEARTBEAT = "run.heartbeat"


class InvalidEventError(ValueError):
    """事件不合法。"""


@dataclass(frozen=True, slots=True)
class DomainEvent:
    """一条领域事件。

    ⚠️ **不可变** —— 事件一旦发出就不能改。
       订阅方拿到的是同一份数据，改了会影响其他订阅方。
    """

    #: 事件类型
    type: EventType

    #: 所属流（run_id / flow_id）
    stream_id: UUID

    #: 序列号 —— 流内单调递增，用于断线重连
    seq: int = 0

    #: 事件 ID
    event_id: UUID = field(default_factory=uuid4)

    #: 发生时间
    occurred_at: datetime = field(default_factory=lambda: datetime.now(UTC))

    #: 请求 ID —— 串联一次用户请求引发的所有事件
    request_id: str | None = None

    #: 负载
    payload: dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        """校验 —— 序列号不能为负。

        ⚠️ `seq` 必须 ≥ 0 —— 负数会让「从 last+1 开始」的续传逻辑算错。
        """
        if self.seq < 0:
            raise InvalidEventError(f"事件序列号不能为负：{self.seq}")

    @property
    def is_terminal(self) -> bool:
        """是否是「终止事件」。

        ⚠️ 流收到终止事件后就不会再有新事件了 ——
        订阅方据此结束等待，不用轮询。
        """
        return self.type in {
            EventType.RUN_SUCCEEDED,
            EventType.RUN_FAILED,
            EventType.RUN_CANCELLED,
        }

    def to_dict(self) -> dict[str, Any]:
        """转成可 JSON 序列化的字典。"""
        return {
            "event_id": str(self.event_id),
            "type": self.type.value,
            "stream_id": str(self.stream_id),
            "seq": self.seq,
            "occurred_at": self.occurred_at.isoformat(),
            "request_id": self.request_id,
            "payload": self.payload,
        }

    def to_json(self) -> str:
        """转成 JSON 字符串。"""
        # ⚠️ ensure_ascii=False —— 中文事件内容不该被转成 \\uXXXX
        #    （SSE 是给人看/给前端 parse 的，转义了浪费带宽也难调试）
        return json.dumps(self.to_dict(), ensure_ascii=False, separators=(",", ":"))

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> DomainEvent:
        """从字典还原。

        ⚠️ 存储侧（Redis）读出来时要能还原回领域对象，
        否则订阅方拿到的就是 dict 而不是事件对象。
        """
        return cls(
            type=EventType(data["type"]),
            stream_id=UUID(data["stream_id"]),
            seq=int(data["seq"]),
            event_id=UUID(data["event_id"]),
            occurred_at=datetime.fromisoformat(data["occurred_at"]),
            request_id=data.get("request_id"),
            payload=data.get("payload") or {},
        )
