"""端口定义 —— 基础设施层要实现的接口。

⚠️ **端口在应用层，实现在基础设施层**（依赖倒置）。

    application 定义 `LLMProvider` 协议
    infrastructure 写 `OpenAIProvider` / `AnthropicProvider` 实现它

    这样应用层不依赖任何 HTTP 库 ——
    换厂商只加一个实现类，用例代码一行不改。
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable

from scholar_llm.domain.models import CompletionRequest, TokenUsage

__all__ = [
    "CompletionResult",
    "LLMProvider",
]


class CompletionResult:
    """补全结果。

    ⚠️ 单独一个类而不是 tuple —— 后面要加字段（比如 finish_reason）
       时不会破坏调用方。
    """

    __slots__ = ("content", "finish_reason", "model_id", "raw", "usage")

    def __init__(
        self,
        content: str,
        model_id: str,
        usage: TokenUsage | None = None,
        finish_reason: str = "stop",
        raw: object | None = None,
    ) -> None:
        self.content = content
        self.model_id = model_id
        self.usage = usage or TokenUsage()
        self.finish_reason = finish_reason
        self.raw = raw

    def __repr__(self) -> str:
        """调试用 —— 不打印完整内容（可能很长）。"""
        preview = self.content[:40]
        return (
            f"CompletionResult(model_id={self.model_id!r}, "
            f"finish_reason={self.finish_reason!r}, "
            f"usage={self.usage.total_tokens} tokens, content={preview!r}...)"
        )


@runtime_checkable
class LLMProvider(Protocol):
    """厂商适配器协议。

    ⚠️ **一个协议对应一个厂商**（不是一个协议带 provider 参数）——
       各厂商的参数差异太大（Anthropic 的 system 是独立字段，
       OpenAI 的 temperature 范围也不同），用参数塞进一个方法会失控。
    """

    @property
    def provider_name(self) -> str:
        """厂商名。"""
        ...

    async def complete(self, request: CompletionRequest, model_id: str) -> CompletionResult:
        """执行一次补全。

        :param request 请求
        :param model_id 具体用哪个模型（由路由决定）
        :raises LLMProviderError: 调用失败
        """
        ...
