"""模型定义 —— 多模型接入的领域模型。

⚠️ 这一层回答的是「**用什么模型、什么参数**」，不关心「怎么调 HTTP」。

    domain         → ModelSpec / Message / CompletionRequest（纯数据）
    application    → 用例编排 + 端口定义
    infrastructure → 真正发 HTTP 的适配器

---

## 为什么模型定义要自己抽象一层

不同厂商的 API 长得完全不一样：

    OpenAI    chat.completions.create(messages=[...])
    Anthropic messages.create(system=..., messages=[...])
    智谱      chat.completions.create(...)

但业务要的东西是一样的：**消息列表 + 温度 + 最大 token**。

所以领域层定义统一的 `CompletionRequest`，
各厂商的适配器负责翻译。这样：

    · 业务代码换模型不用改
    · 加新厂商只写一个适配器
    · 参数校验（温度范围、token 上限）在领域层一次做对
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any

__all__ = [
    "Capability",
    "CompletionRequest",
    "Message",
    "MessageRole",
    "ModelSpec",
    "ModelTier",
    "TokenUsage",
]


class MessageRole(StrEnum):
    """消息角色。

    ⚠️ 只保留三种 —— 够用且所有厂商都支持。
       复杂的 agent 循环靠 content 里的结构化标记表达，
       不靠 role 变体。
    """

    SYSTEM = "system"
    USER = "user"
    ASSISTANT = "assistant"


class Capability(StrEnum):
    """模型能力。

    ⚠️ 用于**路由** —— 业务说「我要结构化输出」，
       路由就只找支持 `structured_output` 的模型。
    """

    #: 文本生成
    TEXT = "text"
    #: 结构化输出（JSON schema 约束）
    STRUCTURED_OUTPUT = "structured_output"
    #: 流式输出
    STREAMING = "streaming"
    #: 视觉输入（图片）
    VISION = "vision"
    #: 超长上下文
    LONG_CONTEXT = "long_context"


class ModelTier(StrEnum):
    """模型档位 —— 成本/能力的粗粒度分级。

    ⚠️ 用于**成本控制** —— 用户选「快速」还是「精细」时映射到档位，
       而不是让用户直接选模型名（用户不知道模型名的差别）。
    """

    #: 快而便宜 —— 摘要、分类、简单改写
    FAST = "fast"
    #: 均衡 —— 默认档
    BALANCED = "balanced"
    #: 慢而贵 —— 深度推理、长文写作
    QUALITY = "quality"


@dataclass(frozen=True, slots=True)
class Message:
    """一条消息。"""

    role: MessageRole
    content: str

    def to_dict(self) -> dict[str, str]:
        """转成 OpenAI 风格的字典。

        ⚠️ 大部分厂商（OpenAI / 智谱 / 通义 / DeepSeek）都用这个格式，
           Anthropic 的转换在适配器里做。
        """
        return {"role": self.role.value, "content": self.content}


@dataclass(frozen=True, slots=True)
class ModelSpec:
    """模型规格。

    ⚠️ `context_window` 是**硬约束** —— 超了要报错，
       不是静默截断。截断会让模型「看起来回答了」但漏掉了关键内容。
    """

    #: 内部 ID（路由用），如 "gpt-4o-mini"
    id: str
    #: 厂商
    provider: str
    #: 厂商侧的模型名
    provider_model: str
    #: 展示名
    display_name: str
    #: 档位
    tier: ModelTier
    #: 能力
    capabilities: frozenset[Capability] = field(default_factory=frozenset)
    #: 上下文窗口（token）
    context_window: int = 128_000
    #: 最大输出 token
    max_output_tokens: int = 4_096
    #: 单价（美元 / 百万 token），输入
    price_per_million_input: float = 0.0
    #: 单价（美元 / 百万 token），输出
    price_per_million_output: float = 0.0
    #: 是否支持流式
    supports_streaming: bool = False

    def supports(self, capability: Capability) -> bool:
        """是否支持某能力。"""
        return capability in self.capabilities

    def estimate_cost(
        self,
        input_tokens: int,
        output_tokens: int,
    ) -> float:
        """估算成本（美元）。

        ⚠️ 估算不是精确计费 —— 真实账单以厂商为准。
           用途是**预算护栏**（超过阈值就换便宜的模型或拒绝）。
        """
        input_cost = input_tokens / 1_000_000 * self.price_per_million_input
        output_cost = output_tokens / 1_000_000 * self.price_per_million_output
        return input_cost + output_cost


@dataclass(frozen=True, slots=True)
class TokenUsage:
    """token 用量。"""

    prompt_tokens: int = 0
    completion_tokens: int = 0

    @property
    def total_tokens(self) -> int:
        """总 token 数。"""
        return self.prompt_tokens + self.completion_tokens


@dataclass(frozen=True, slots=True)
class CompletionRequest:
    """补全请求。

    ⚠️ `response_schema` —— 结构化输出用 JSON Schema 约束。
       不是「让模型返回 JSON」（那只是碰运气），
       而是**真的把 schema 传给厂商的约束解码功能**。
    """

    #: 消息列表
    messages: tuple[Message, ...]
    #: 模型 ID（空 = 由路由按档位选）
    model: str | None = None
    #: 温度
    temperature: float = 0.7
    #: 最大输出 token
    max_tokens: int | None = None
    #: 是否流式
    stream: bool = False
    #: 结构化输出的 JSON Schema
    response_schema: dict[str, Any] | None = None
    #: 停止词
    stop: tuple[str, ...] = ()

    def system_prompt(self) -> str:
        """取出系统提示词（可能多条拼接）。"""
        return "\n\n".join(
            message.content for message in self.messages if message.role is MessageRole.SYSTEM
        )

    def conversation(self) -> tuple[Message, ...]:
        """取出非系统消息。

        ⚠️ 系统提示词单独传给厂商（Anthropic 要单独字段），
           所以要能把它摘出来。
        """
        return tuple(message for message in self.messages if message.role is not MessageRole.SYSTEM)
