# 07 — orchestra 编排引擎

> `@scholarspace/orchestra` —— 可视化 AI 编排平台。
> 借鉴 Langflow 的 Flow 模型 + ScholarClaw 的运行时/事件/技能/调度，学术专用重写。

---

> **✅ 实现状态（2026-11-19）**：
>
> | 部分 | 状态 | 位置 |
> |---|---|---|
> | 领域模型 + DAG 校验 | ✅ | `scholarspace-orchestra/libs/orchestra-core` |
> | DAG 调度器 | ✅ | `scholarspace-orchestra/libs/orchestra-runtime` |
> | 节点注册表（插件机制） | ✅ | 同上 `registry.py` |
> | 内置节点（P0：llm/tool/branch/merge） | ✅ | 同上 `builtin_nodes.py` |
> | HTTP 层 + SSE | ⬜ | M2-③ |
> | 学术专用节点 | ⬜ | M3+（依赖 paper/slides 仓）|
>
> 已实现的坑见 `docs/00-项目地图.md` 附录。

---

## 1. 定位与边界

### 1.1 是什么

用节点图编排「模型调用 / 工具 / 检索 / 代码 / 子流程 / 多 Agent / 人工审批」，运行时提供流式事件、会话管理、技能加载、定时调度、MCP 集成。

### 1.2 不是什么

| 不做 | 原因 |
|---|---|
| 通用工作流引擎 | 做**学术专用**（论文理解、PPT 生成、文献综述…）|
| 桌面端 / IM 渠道 | Web 优先 |
| 通用容器编排（K8s 那种）| 面向 LLM 编排，不是基础设施编排 |
| 前端画布自研全部交互 | 用成熟方案承载，专注业务 |

### 1.3 四层能力

```
① 编排层   Flow 图 + 可视化编辑 + 版本化 + 发布/分享
② 运行时   DAG 调度 + 变量上下文 + 重试 + 并发 + EventBus
③ 能力层   节点类型（llm / tool / retrieval / code / subflow / agent / mcp / human）
④ 生态层   节点市场 + 技能系统(SKILL.md) + MCP Server + 定时任务
```

---

## 2. 领域模型

### 2.1 实体

```python
# orchestra/domain/entities.py
@dataclass(frozen=True, slots=True)
class Flow:
    flow_id: FlowId
    name: str
    description: str
    graph: FlowGraph
    version: int
    access: AccessLevel          # PRIVATE | PUBLIC | STORE
    tags: tuple[str, ...]
    mcp_enabled: bool
    owner_id: int
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True, slots=True)
class FlowGraph:
    nodes: tuple[Node, ...]
    edges: tuple[Edge, ...]

    def validate(self) -> None:
        """DAG 校验：无环、无孤立节点、端口类型匹配、必填输入已绑定"""


@dataclass(frozen=True, slots=True)
class Node:
    node_id: str                # 图内唯一，如 'llm_1'
    node_type: str              # 'llm' | 'tool' | 'retrieval' | 'code' | 'subflow'
                                # | 'agent' | 'mcp' | 'human' | 'branch' | 'merge'
                                # | 'map' | 'loop'
    position: Position          # 画布坐标 (x, y)
    config: NodeConfig          # 类型化配置
    inputs: tuple[PortBinding, ...]   # 上游数据绑定
    outputs: tuple[PortSpec, ...]      # 输出端口声明


@dataclass(frozen=True, slots=True)
class Edge:
    edge_id: str
    source_node: str
    source_port: str
    target_node: str
    target_port: str


@dataclass(frozen=True, slots=True)
class Run:
    run_id: RunId
    flow_id: FlowId
    flow_version: int
    status: RunStatus            # PENDING | RUNNING | SUCCEEDED | FAILED | CANCELLED
    input_vars: Mapping[str, Any]
    started_at: datetime | None
    finished_at: datetime | None
    error: ErrorInfo | None
    usage: Usage                 # tokens / cost / duration


@dataclass(frozen=True, slots=True)
class NodeRun:
    node_run_id: NodeRunId
    run_id: RunId
    node_id: str
    status: RunStatus
    inputs: Mapping[str, Any]
    outputs: Mapping[str, Any]
    error: ErrorInfo | None
    usage: Usage
    started_at: datetime
    finished_at: datetime
```

### 2.2 状态机

```
Run:      PENDING ──► RUNNING ──┬──► SUCCEEDED
                    │           └──► FAILED
                    └──────► CANCELLED

NodeRun:  PENDING ──► RUNNING ──┬──► SUCCEEDED
                    │           └──► FAILED
                    └──────► SKIPPED     (条件分支未命中)
```

**约束**：
- `FAILED` 必须记录 `failed_node_id`（定位到具体节点）
- `SUCCEEDED` 必须有完整 `usage`
- 取消是幂等的

### 2.3 术语统一（对标 Langflow，重定义）

| Langflow | scholarspace | 说明 |
|---|---|---|
| Flow | **Flow** | 保留（行业通用）|
| Component / Vertex | **Node** | "组件"在 React 语境已占用 |
| Job | **Run** | |
| Transaction | **NodeRun** | 单节点执行记录 |
| VertexBuild | **Execution** | 一次运行的产物集合 |
| Session | **Session** | 会话 |

---

## 3. 分层与包结构

```
scholarspace/orchestra/
├── pyproject.toml
├── importlinter.ini
├── src/orchestra/
│   ├── domain/
│   │   ├── entities.py       Flow / Node / Edge / FlowGraph
│   │   ├── value_objects.py  FlowId / RunId / Position / AccessLevel
│   │   ├── run_status.py     RunStatus + 状态机
│   │   ├── node_spec.py      NodeSpec 注册表
│   │   ├── events.py         领域事件
│   │   └── errors.py         FlowValidationError / CycleDetectedError …
│   │
│   ├── application/
│   │   ├── use_cases/
│   │   │   ├── compose_flow.py       # 创建/更新/校验 Flow
│   │   │   ├── execute_flow.py       # 执行编排
│   │   │   ├── publish_node.py       # 节点市场
│   │   │   ├── manage_session.py     # 会话与消息
│   │   │   ├── schedule_flow.py      # 定时任务
│   │   │   └── manage_variables.py   # 变量与密钥
│   │   ├── ports/
│   │   │   ├── llm.py                # LLMPort
│   │   │   ├── tool_registry.py      # ToolRegistryPort
│   │   │   ├── event_stream.py       # EventStreamPort
│   │   │   ├── task_queue.py         # TaskQueuePort
│   │   │   ├── repository.py         # FlowRepositoryPort / RunRepositoryPort
│   │   │   └── secret_store.py       # SecretStorePort
│   │   └── runtime/
│   │       ├── scheduler.py          # DAG 调度器
│   │       ├── context.py            # 变量上下文 / 数据流绑定
│   │       ├── executor.py           # 节点执行
│   │       ├── retry.py              # 重试策略
│   │       └── budget.py             # 额度/成本闸门
│   │
│   ├── infrastructure/
│   │   ├── nodes/                    # 内置节点实现
│   │   │   ├── llm_node.py
│   │   │   ├── llm_router_node.py
│   │   │   ├── tool_node.py
│   │   │   ├── retrieval_node.py
│   │   │   ├── code_node.py
│   │   │   ├── subflow_node.py
│   │   │   ├── agent_node.py
│   │   │   ├── mcp_node.py
│   │   │   ├── human_node.py
│   │   │   └── control/ (branch / merge / map / loop)
│   │   ├── eventbus/                 # EventBus 实现
│   │   ├── skills/                   # SKILL.md 加载器
│   │   ├── scheduler/                # cron + 退避 + 卡死检测
│   │   ├── memory/                   # 会话记忆
│   │   ├── mcp/                      # MCP 客户端
│   │   └── repositories/             # SQLAlchemy 实现
│   │
│   ├── interfaces/
│   │   ├── http/
│   │   │   ├── flows.py
│   │   │   ├── nodes.py              # 节点市场
│   │   │   ├── runs.py
│   │   │   ├── sessions.py
│   │   │   ├── variables.py
│   │   │   └── schedules.py
│   │   ├── sse/
│   │   │   └── events.py             # SSE 端点
│   │   └── dto.py
│   │
│   ├── schemas/
│   │   └── flow.schema.json          # ⭐ 对外 Flow JSON Schema
│   ├── config.py
│   └── main.py
├── tests/{unit,integration,contract}/
└── docs/
```

---

## 4. 节点类型

### 4.1 内置节点清单（M2 只做这些）

| 类别 | 节点 | 说明 | M2 优先级 |
|---|---|---|---|
| **模型** | `llm` | 调用 `llm` 包，支持结构化输出 | P0 |
| | `llm_router` | 按条件路由到不同模型 | P1 |
| **工具** | `tool` | 调用注册的 Python 工具 | P0 |
| | `http` | 任意 HTTP 请求 | P0 |
| | `mcp` | 调用外部 MCP Server | P2 |
| **数据** | `retrieval` | 向量检索（pgvector）| P1 |
| | `code` | 沙箱执行 Python | P2 |
| **控制** | `branch` | 条件分支 | P0 |
| | `merge` | 多输入合并 | P0 |
| | `map` | 列表映射（对每个元素执行子流程）| P1 |
| | `loop` | 迭代 | P2 |
| **协作** | `subflow` | 嵌套子流程 | P1 |
| | `agent` | 多 Agent 委派（SubagentTracker）| P1 |
| **人工** | `human_in_loop` | 人工审批节点 | P1 |

### 4.2 节点契约

```python
# orchestra/domain/node_spec.py
@dataclass(frozen=True, slots=True)
class NodeSpec:
    type: str
    label_key: str                  # i18n key（不是硬编码）
    category: NodeCategory
    description_key: str
    config_schema: type[BaseModel]  # Pydantic，校验配置
    input_ports: tuple[PortSpec, ...]
    output_ports: tuple[PortSpec, ...]
    icon: str
    category_order: int


@dataclass(frozen=True, slots=True)
class PortSpec:
    name: str
    type: PortType                 # TEXT | JSON | FILE | IMAGE | TABLE | ANY
    required: bool
    label_key: str
```

### 4.3 执行器接口

```python
# orchestra/application/ports/executor.py
class NodeExecutor(Protocol):
    async def execute(
        self,
        node: Node,
        inputs: Mapping[str, Any],
        ctx: ExecutionContext,
    ) -> NodeExecutionResult: ...
```

**内置节点实现**：`LLMNodeExecutor` `ToolNodeExecutor` `HTTPNodeExecutor` `RetrievalNodeExecutor` `BranchNodeExecutor` `SubflowNodeExecutor` `AgentNodeExecutor`…

### 4.4 学术专用节点（差异化）

在通用节点之外，提供学术专用节点：

| 节点 | 作用 |
|---|---|
| `paper_insight` | 输入论文 → 输出结构化摘要（接 `paper` 包的 `PaperArtifact` DTO）|
| `paper_sketch` | 生成大纲（复用 PaperSketch）|
| `slide_generate` | 生成 PPT 页面（接 `slides` 包）|
| `evidence_extract` | 抽取证据链（带原文坐标）|
| `citation_format` | 引用格式化（Chicago/MLA/Harvard）|
| `community_publish` | 发布到学术社区 |

**⚠️ 依赖方向**：这些节点通过 **Port 接口**调用 `paper`/`slides`/`community`，**不直接 import**（由 `apps/gateway` 注入实现）。这样 `orchestra` 保持独立可发布。

---

## 5. 运行时

### 5.1 DAG 调度器

```python
# orchestra/application/runtime/scheduler.py
class FlowScheduler:
    """按拓扑序调度节点，支持并行分支。"""

    async def run(self, flow: Flow, inputs: Mapping[str, Any], ctx: ExecutionContext) -> RunResult:
        ready = topological_ready_nodes(flow.graph)
        running: dict[str, asyncio.Task] = {}

        while ready or running:
            # 启动所有就绪节点
            for node in ready:
                running[node.node_id] = asyncio.create_task(
                    self._run_node(node, ctx)
                )
            if not running:
                break

            # 等待任一完成
            done, _ = await asyncio.wait(running, return_when=asyncio.FIRST_COMPLETED)
            for task in done:
                result = task.result()
                ctx.store_result(result)
                if result.failed:
                    await self._handle_failure(result, running, ctx)
                    return RunResult.failed(result)
                ready = self._newly_ready(flow.graph, ctx)

        return RunResult.succeeded(ctx.outputs)
```

**并行**：无依赖关系的节点同时跑（`asyncio.gather`）。
**取消**：`ctx.cancel_event` 触发后，取消所有 running task。

### 5.2 变量上下文

```python
# orchestra/application/runtime/context.py
class ExecutionContext:
    """一次 Run 的变量作用域与数据流绑定。"""

    def __init__(self, run: Run, flow: Flow, secrets: SecretResolver):
        self._vars: dict[str, Any] = {}
        self._node_outputs: dict[str, dict[str, Any]] = {}
        self._secrets = secrets

    def resolve_input(self, binding: PortBinding) -> Any:
        """按绑定解析输入值：
        - 'flow.start'      → Run 的输入变量
        - 'nodeX.outputY'   → 上游节点输出
        - 'secret.KEY'      → 密钥（永不进日志）
        - 'const.<json>'    → 字面量
        """

    def store_result(self, result: NodeExecutionResult) -> None: ...
```

**表达式**：简单路径 + 内置函数
```
{{ node_search.output.papers[0].title }}
{{ flow.start.query | upper }}
```

### 5.3 重试与降级

```python
# orchestra/application/runtime/retry.py
@dataclass(frozen=True)
class NodeRetryPolicy:
    max_attempts: int = 3
    backoff: str = "exponential"     # exponential | linear | fixed
    initial_delay_s: float = 1.0
    max_delay_s: float = 30.0
    jitter: bool = True
    retry_on: tuple[str, ...] = ("UpstreamError", "TimeoutError")
```

**节点级配置**：`Node.config.retry: NodeRetryPolicy`

### 5.4 成本闸门

```python
# orchestra/application/runtime/budget.py
class BudgetGuard:
    """运行前预估，运行中实时累计，超限即中断。"""
    async def check(self, ctx: ExecutionContext) -> None: ...
    async def consume(self, ctx: ExecutionContext, usage: Usage) -> None: ...
```
> 复用 `billing` 包的账本（通过 Port 注入）。

---

## 6. 事件流（EventBus）

### 6.1 事件类型

借鉴 ScholarClaw 的 `stream` / `tool_use` / `complete` / `error` / `subagent_*`，扩展：

```python
class EventType(str, Enum):
    # 生命周期
    RUN_STARTED    = "run.started"
    RUN_SUCCEEDED  = "run.succeeded"
    RUN_FAILED     = "run.failed"
    RUN_CANCELLED  = "run.cancelled"

    # 节点
    NODE_STARTED   = "node.started"
    NODE_SUCCEEDED = "node.succeeded"
    NODE_FAILED    = "node.failed"
    NODE_SKIPPED   = "node.skipped"

    # 流式
    NODE_STREAM    = "node.stream"          # LLM 增量输出

    # 工具
    TOOL_INVOKED   = "tool.invoked"
    TOOL_COMPLETED = "tool.completed"

    # 协作
    AGENT_DELEGATED = "agent.delegated"      # 子 Agent 委派
    AGENT_COMPLETED = "agent.completed"

    # 人工
    HUMAN_REQUIRED  = "human.required"       # 等待人工审批
    HUMAN_RESOLVED  = "human.resolved"

    # 心跳
    HEARTBEAT      = "run.heartbeat"
```

### 6.2 SSE 端点

```http
GET /api/v1/orchestra/runs/{run_id}/events
Accept: text/event-stream
```

```
event: run.started
data: {"run_id":"01J...","flow_id":"01J...","ts":"2026-11-19T13:00:00Z","request_id":"req_x"}

event: node.stream
data: {"run_id":"01J...","node_id":"llm_1","delta":"根据检索结果，","seq":42}

event: node.succeeded
data: {"run_id":"01J...","node_id":"llm_1","outputs":{"text":"..."},"usage":{"tokens":820},"duration_ms":2310}
```

**断线重连**：带 `Last-Event-ID` 头 → 从 `seq` 续传（事件持久化到 Redis）。

### 6.3 EventBus 接口

```python
# orchestra/application/ports/event_stream.py
class EventStreamPort(Protocol):
    async def publish(self, event: DomainEvent) -> None: ...
    async def subscribe(self, run_id: RunId) -> AsyncIterator[DomainEvent]: ...
```

实现放在 `events` 包（`@scholarspace/events`），`orchestra` 只依赖接口。

---

## 7. 会话与消息

```python
@dataclass(frozen=True, slots=True)
class Session:
    session_id: SessionId
    flow_id: FlowId
    title: str
    variables: Mapping[str, Any]
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True, slots=True)
class Message:
    message_id: MessageId
    session_id: SessionId
    role: MessageRole      # USER | ASSISTANT | SYSTEM | TOOL
    content: str
    blocks: tuple[ContentBlock, ...]   # 富内容（引用/图表/文件）
    node_run_ids: tuple[str, ...]
    created_at: datetime
```

**多 Agent 委派追踪**（借鉴 SubagentTracker）：
```python
@dataclass(frozen=True, slots=True)
class DelegationRecord:
    parent_node: str
    child_agent: str
    task: str
    started_at: datetime
    finished_at: datetime | None
    status: RunStatus
```

---

## 8. 技能系统（SKILL.md）

借鉴 ScholarClaw 的三级优先级 + 热重载。

### 8.1 SKILL.md 格式

```markdown
---
name: literature-review
description: 系统性文献综述助手
version: 1.0.0
tools: [web_search, paper_fetch]
model: qwen-max
temperature: 0.3
---

# 角色
你是一位严谨的文献综述专家……

# 工作流程
1. 检索相关论文
2. 提取方法与结论
3. 横向对比
4. 生成综述

# 输出格式
- 每篇论文一行：标题 | 年份 | 方法 | 结论
```

### 8.2 三级优先级

```
① workspace  >  ② project  >  ③ user
   (agents/<id>/)   (skills/)      (应用数据目录)
```
高优先级覆盖低优先级。

### 8.3 热重载

监听文件变更（watchdog / inotify）→ 重新解析 → 无需重启。

### 8.4 YAML 流程定义（无画布也能用）

```yaml
# flows/review.yaml
name: 文献综述
version: 1
nodes:
  - id: search
    type: tool
    config: { tool: paper_search, args: { query: "{{ flow.start.topic }}" } }
  - id: analyze
    type: llm
    config: { model: qwen-max, prompt: "{{ node_search.output.papers }}" }
edges:
  - from: search.output
    to: analyze.input
```

---

## 9. 节点市场

| 能力 | 说明 |
|---|---|
| 发布 | 把 Flow 或单个节点发布到市场 |
| 分类 | 按 `category` + `tags` |
| 评分/下载量 | 排序 |
| 安装 | 复制到当前空间 |
| 版本 | 节点版本号 + 兼容声明 |
| 官方节点 | 平台维护（含学术专用节点）|

---

## 10. 定时与调度

借鉴 ScholarClaw：
- **cron 表达式**（croner）
- **三种触发**：cron / interval / once
- **退避**：失败自动重试，指数退避
- **卡死检测**：超过 `timeout` 未完成 → 标记 FAILED + 告警

---

## 11. 路由映射（前端零改动）

| 旧路由（scholar-club-backend）| 新路由 |
|---|---|
| `/api/v2/agent/flows` | `/api/v1/orchestra/flows` |
| `/api/v2/agent/flows/{id}` | `/api/v1/orchestra/flows/{id}` |
| `/api/v2/agent/build/{flow_id}/flow` | `/api/v1/orchestra/runs` |
| `/api/v2/agent/build/{job_id}/events` | `/api/v1/orchestra/runs/{run_id}/events` |
| `/api/v2/agent/build/{job_id}/cancel` | `/api/v1/orchestra/runs/{run_id}/cancel` |
| `/api/v2/agent/monitor/messages` | `/api/v1/orchestra/sessions/{id}/messages` |
| `/api/v2/agent/monitor/messages/sessions` | `/api/v1/orchestra/sessions` |
| `/api/v2/agent/store/agent` | `/api/v1/orchestra/nodes` |
| `/api/v2/agent/store/components` | `/api/v1/orchestra/nodes` |
| `/api/v2/agent/apikey` | `/api/v1/orchestra/api-keys` |
| `/api/v2/agent/cookie` | `/api/v1/orchestra/session` |

**由 `apps/gateway` 做路径映射**，前端零改动。

---

## 12. 数据模型

```sql
-- orchestra_flows
CREATE TABLE orchestra_flows (
    id            UUID PRIMARY KEY,
    name          TEXT        NOT NULL,
    description   TEXT,
    graph         JSONB       NOT NULL,   -- nodes + edges
    version       INTEGER     NOT NULL DEFAULT 1,
    access        TEXT        NOT NULL DEFAULT 'PRIVATE',
    tags          TEXT[]      NOT NULL DEFAULT '{}',
    mcp_enabled   BOOLEAN     NOT NULL DEFAULT FALSE,
    owner_id      BIGINT      NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL,
    updated_at    TIMESTAMPTZ NOT NULL,
    deleted_at    TIMESTAMPTZ
);

-- 其余表
orchestra_runs        -- 运行记录
orchestra_node_runs   -- 节点执行记录
orchestra_sessions    -- 会话
orchestra_messages    -- 消息
orchestra_variables   -- 变量
orchestra_api_keys    -- API Key
orchestra_files       -- 文件
orchestra_schedules   -- 定时任务
orchestra_node_defs   -- 节点市场（已发布节点）
```

> ⚠️ 全部用 **JSONB**（Flow 图），不再 TEXT + `json.loads`。

---

## 13. 前端（`apps/orchestra-web`）

### 13.1 页面

```
/orchestra                  节点市场 / 我的流程
/orchestra/flows            流程列表
/orchestra/flows/:id        ⭐ 画布编辑器
/orchestra/flows/:id/run    执行与事件流
/orchestra/sessions         会话历史
/orchestra/nodes/:type      节点配置面板
```

### 13.2 画布编辑器（`EditorPage` 模式复用）

```
┌──────────────────────────────────────────────┐
│ 工具栏：撤销/重做/保存/运行/发布/版本           │
├──────────┬────────────────────────┬──────────┤
│ 节点面板  │      画布（可拖拽）     │ 属性面板  │
│ 分类/搜索 │      缩放/框选/连线      │ 节点配置  │
└──────────┴────────────────────────┴──────────┘
```

### 13.3 画布技术选型

| 方案 | 优点 | 缺点 |
|---|---|---|
| **React Flow** (`@xyflow/react`) | 成熟、交互好、文档全 | 依赖较重 |
| 自研 SVG 画布 | 完全可控 | 工作量大 |
| **Canvas 渲染 + 自研交互** | 性能好 | 复杂 |

**建议**：**@xyflow/react**。理由：
- 节点拖拽、连线、缩放、平移、框选、小地图 —— 这些是**通用交互**，自研无差异化
- 我们的差异化在**节点类型**和**编排语义**，不在画布
- 借鉴 Langflow 的选择（它也用 React Flow）

> 若包体积敏感，可按需 tree-shake；`@xyflow/react` gzip ≈ 150 kB，可接受（只加载在编排画布页）。

---

## 14. 与其他包的关系

| 关系 | 方式 |
|---|---|
| `orchestra` → `llm` | 通过 `LLMPort`（`llm` 包实现）|
| `orchestra` → `events` | 通过 `EventStreamPort` |
| `orchestra` → `billing` | 通过 Port（成本闸门）|
| `orchestra` → `paper`/`slides`/`community` | **不 import**，由 `apps/gateway` 注入学术节点的实现 |
| `orchestra` → `auth` | 通过 `Principal` 值对象传入 |

**这保证 `orchestra` 可独立发布、独立测试、独立复用**（如做企业内部编排工具）。

---

## 15. 测试策略

| 类型 | 重点 |
|---|---|
| 单元（domain）| 图校验、状态机、表达式解析、调度顺序 |
| 属性（hypothesis）| 任意 Flow 图 → 调度不 deadlock；任意输入 → 不越界 |
| 集成 | 与 fake LLM / fake tool 跑完整 Run |
| 契约 | SSE 事件格式、REST schema |
| E2E | 画布：拖拽→连线→保存→运行→看到事件 |

---

## 16. 里程碑

| 阶段 | 内容 | 工期 |
|---|---|---|
| M2.1 | domain + schema + 仓储 + REST（无运行时）| 1.5 周 |
| M2.2 | 调度器 + 执行器 + 事件流 + SSE | 2 周 |
| M2.3 | 节点类型（8 种）+ 技能系统 | 1 周 |
| M2.4 | 画布前端 + 节点市场 + 定时 | 1.5 周 |

**出口标准**：能在画布上拖出一个「检索 → LLM → 格式化」的流程并跑通，实时看到事件流。
