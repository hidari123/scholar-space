"""错误类型 —— 领域层。

⚠️ **分清「可重试」和「不可重试」** —— 这是 LLM 服务最关键的错误分类：

    可重试：网络超时、429 限流、5xx
    不可重试：401 鉴权失败、400 参数错、上下文超长

    对不可重试的错误做重试 = 白白烧钱 + 拖慢响应。
"""

from __future__ import annotations

__all__ = [
    "ContextTooLongError",
    "LLMError",
    "LLMProviderError",
    "ModelNotFoundError",
    "NoSuitableModelError",
    "ProviderAuthError",
    "ProviderRateLimitError",
    "ProviderServerError",
    "ProviderTimeoutError",
    "StructuredOutputError",
    "UnsupportedCapabilityError",
]


class LLMError(Exception):
    """LLM 服务的基础错误。"""


class ModelNotFoundError(LLMError, LookupError):
    """模型不存在。"""


class NoSuitableModelError(LLMError, LookupError):
    """没有满足条件的模型。"""


class UnsupportedCapabilityError(LLMError):
    """模型不支持所需能力。"""


class ContextTooLongError(LLMError):
    """上下文超长。

    ⚠️ **不自动截断** —— 截断会让模型看起来回答了但漏掉关键内容。
       让调用方决定：换模型、压缩输入、还是分批处理。
    """

    def __init__(self, model_id: str, needed: int, available: int) -> None:
        self.model_id = model_id
        self.needed = needed
        self.available = available
        super().__init__(f"上下文超长：{model_id} 最多 {available} token，需要 {needed}")


class StructuredOutputError(LLMError):
    """结构化输出解析失败。

    ⚠️ 模型返回的 JSON 不符合 schema —— 重试有时能过，
       但更常见的是 prompt 里没讲清楚要什么字段。
    """


class LLMProviderError(LLMError):
    """厂商调用失败。

    ⚠️ `retryable` 决定要不要重试。
    """

    def __init__(self, message: str, *, provider: str = "", retryable: bool = False) -> None:
        self.provider = provider
        self.retryable = retryable
        super().__init__(message)


class ProviderTimeoutError(LLMProviderError):
    """超时 —— 可重试。"""

    def __init__(self, message: str, *, provider: str = "") -> None:
        super().__init__(message, provider=provider, retryable=True)


class ProviderRateLimitError(LLMProviderError):
    """限流（429）—— 可重试。

    ⚠️ 带上 `retry_after` —— 厂商通常会告诉你等多久。
       按固定间隔重试会在限流时火上浇油。
    """

    def __init__(
        self, message: str, *, provider: str = "", retry_after: float | None = None
    ) -> None:
        self.retry_after = retry_after
        super().__init__(message, provider=provider, retryable=True)


class ProviderServerError(LLMProviderError):
    """厂商 5xx —— 可重试。"""

    def __init__(self, message: str, *, provider: str = "") -> None:
        super().__init__(message, provider=provider, retryable=True)


class ProviderAuthError(LLMProviderError):
    """鉴权失败（401/403）—— **不可重试**。

    ⚠️ 重试一万次也是 401。要做的是告警 + 让用户换配置。
    """

    def __init__(self, message: str, *, provider: str = "") -> None:
        super().__init__(message, provider=provider, retryable=False)
