# scholarspace-events

scholarspace 事件服务 —— 事件总线 + 事件流（SSE 支撑）。

> **B 类服务**：主仓内的基础服务，不是独立仓。
> 供 slides / orchestra / community 复用。

---

## 三个关键设计

### ① 每个流内的 `seq` 单调递增

```
事件: {"type":"node.stream","stream_id":"01J...","seq":42,...}
```

SSE 断线重连时客户端带 `Last-Event-ID: 42`，
服务端从 `43` 开始补发。

⚠️ 没有 `seq` 就**只能重新拉全部** ——
大 run 的事件可能有几千条。

⚠️ `seq` 是**流内**递增，不是全局 ——
全局递增会让不同 run 的事件交织，重连时更难定位。

### ② 先落库，再推送

反过来的话，客户端收到的事件可能还没持久化，
断线重连时补不回来。

### ③ 广播语义，不是工作队列语义

一个事件，**所有**订阅者都收到。

---

## 架构

```
domain/          DomainEvent / EventType —— 零外部依赖
application/
  ports.py       EventBusPort / EventStreamPort / EventStorePort
  use_cases.py   publish_event / replay_events / subscribe_events
infrastructure/
  memory.py      InMemoryEventStore / InMemoryEventStream
```

⚠️ **依赖方向**：`infrastructure → application → domain`

---

## 用法

```python
from scholar_events import (
    DomainEvent,
    EventContext,
    EventType,
    InMemoryEventStore,
    InMemoryEventStream,
    publish_event,
    subscribe_events,
)

store = InMemoryEventStore()
stream = InMemoryEventStream(store)
context = EventContext(store=store, stream=stream)

# 发布
event = await publish_event(
    context,
    DomainEvent(type=EventType.NODE_STARTED, stream_id=run_id),
)
print(event.seq)  # 1

# 订阅
async for event in subscribe_events(context, run_id):
    print(event.type, event.payload)
    if event.is_terminal:
        break
```

---

## 与 orchestra 的关系

```
orchestra（编排）── publish ──→ events（事件服务）
       │                            │
       └──── subscribe ────────────┘
```

⚠️ orchestra **只依赖 `EventStreamPort` 协议**，不依赖任何实现 ——
换 Redis 实现不用改 orchestra 一行代码。

对应文档：`docs/07-orchestra.md` 第 6 节。

---

## 开发

```bash
.venv/Scripts/python.exe -m pytest      # 测试
.venv/Scripts/python.exe -m ruff check . # lint
.venv/Scripts/python.exe -m mypy src/   # 类型
```

---

## 已知限制

- **Redis 实现还没写** —— 现在的内存实现只适合单进程
- **补历史与建立订阅之间有竞态窗口** —— 内存版靠单线程语义压到极小，
  Redis 版要用「补历史 + 记录当前 seq + 推送增量」解决
- **慢消费者会丢事件** —— 内存版队列满了就丢，
  靠断线重连补发兜底
