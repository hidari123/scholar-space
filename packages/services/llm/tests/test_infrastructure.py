"""基础设施层测试 —— 错误分类与重试。

⚠️ **错误分类是整个 LLM 服务的核心** ——
    对不可重试的错误重试 = 白白烧钱。
"""

from __future__ import annotations

import pytest

from scholar_llm.domain.errors import (
    LLMProviderError,
    ProviderAuthError,
    ProviderRateLimitError,
    ProviderServerError,
)
from scholar_llm.domain.models import CompletionRequest, Message, MessageRole
from scholar_llm.infrastructure.openai_compatible import OpenAICompatibleProvider
from scholar_llm.infrastructure.retry import RetryPolicy, with_retry


class FakeResponse:
    """假 HTTP 响应。"""

    def __init__(self, status_code: int, payload: dict | None = None, text: str = "") -> None:
        self.status_code = status_code
        self._payload = payload or {}
        self.text = text or str(payload)

    def json(self) -> dict:
        """返回 payload。"""
        return self._payload


class FakeClient:
    """假 HTTP 客户端 —— 记录请求并返回预设响应。"""

    def __init__(self, response: FakeResponse) -> None:
        self.response = response
        self.requests: list[dict] = []

    async def post(self, url: str, **kwargs: object) -> FakeResponse:
        """记录并返回响应。"""
        self.requests.append({"url": url, **kwargs})
        return self.response


def make_request() -> CompletionRequest:
    """构造一个简单请求。"""
    return CompletionRequest(
        messages=(Message(role=MessageRole.USER, content="hi"),),
        model="m1",
    )


def make_provider(client: FakeClient) -> OpenAICompatibleProvider:
    """构造适配器。"""
    return OpenAICompatibleProvider(
        client=client,
        base_url="https://api.example.com/v1",
        api_key="test-key",
        provider_name="test",
    )


class TestErrorClassification:
    """⚠️ 状态码 → 错误分类 → 能不能重试。"""

    @pytest.mark.asyncio
    async def test_401_is_not_retryable(self) -> None:
        """401 → 不可重试。"""
        client = FakeClient(FakeResponse(401, text="invalid api key"))
        provider = make_provider(client)

        with pytest.raises(ProviderAuthError) as exc_info:
            await provider.complete(make_request(), "m1")

        assert not exc_info.value.retryable

    @pytest.mark.asyncio
    async def test_403_is_not_retryable(self) -> None:
        """403 → 不可重试。"""
        client = FakeClient(FakeResponse(403, text="forbidden"))
        provider = make_provider(client)

        with pytest.raises(ProviderAuthError) as exc_info:
            await provider.complete(make_request(), "m1")

        assert not exc_info.value.retryable

    @pytest.mark.asyncio
    async def test_429_is_retryable(self) -> None:
        """429 → 可重试。"""
        client = FakeClient(FakeResponse(429, text="rate limited"))
        provider = make_provider(client)

        with pytest.raises(ProviderRateLimitError) as exc_info:
            await provider.complete(make_request(), "m1")

        assert exc_info.value.retryable

    @pytest.mark.asyncio
    async def test_500_is_retryable(self) -> None:
        """5xx → 可重试。"""
        client = FakeClient(FakeResponse(500, text="internal error"))
        provider = make_provider(client)

        with pytest.raises(ProviderServerError) as exc_info:
            await provider.complete(make_request(), "m1")

        assert exc_info.value.retryable

    @pytest.mark.asyncio
    async def test_400_is_not_retryable(self) -> None:
        """400 → 不可重试（参数错，重试没用）。"""
        client = FakeClient(FakeResponse(400, text="bad request"))
        provider = make_provider(client)

        with pytest.raises(ProviderAuthError) as exc_info:
            await provider.complete(make_request(), "m1")

        assert not exc_info.value.retryable


class TestRequestBuilding:
    """请求构造。"""

    @pytest.mark.asyncio
    async def test_sends_correct_url_and_auth(self) -> None:
        """URL 与鉴权头。"""
        payload = {
            "choices": [{"message": {"content": "hi"}, "finish_reason": "stop"}],
            "usage": {"prompt_tokens": 5, "completion_tokens": 3},
        }
        client = FakeClient(FakeResponse(200, payload))
        provider = make_provider(client)

        await provider.complete(make_request(), "gpt-4o")

        request = client.requests[0]
        assert request["url"] == "https://api.example.com/v1/chat/completions"
        assert request["headers"]["Authorization"] == "Bearer test-key"

    @pytest.mark.asyncio
    async def test_parses_content_and_usage(self) -> None:
        """解析内容与用量。"""
        payload = {
            "choices": [{"message": {"content": "内容"}, "finish_reason": "stop"}],
            "usage": {"prompt_tokens": 5, "completion_tokens": 3},
        }
        client = FakeClient(FakeResponse(200, payload))
        provider = make_provider(client)

        result = await provider.complete(make_request(), "gpt-4o")

        assert result.content == "内容"
        assert result.usage.prompt_tokens == 5
        assert result.usage.completion_tokens == 3
        assert result.usage.total_tokens == 8

    @pytest.mark.asyncio
    async def test_includes_response_format_when_schema_given(self) -> None:
        """⚠️ 结构化输出要走 response_format（约束解码）。"""
        payload = {"choices": [{"message": {"content": "{}"}}]}
        client = FakeClient(FakeResponse(200, payload))
        provider = make_provider(client)

        request = CompletionRequest(
            messages=(Message(role=MessageRole.USER, content="x"),),
            model="m1",
            response_schema={"type": "object", "properties": {"a": {"type": "string"}}},
        )
        await provider.complete(request, "gpt-4o")

        body = client.requests[0]["json"]
        assert body["response_format"]["type"] == "json_schema"
        assert body["response_format"]["json_schema"]["strict"] is True

    @pytest.mark.asyncio
    async def test_no_response_format_without_schema(self) -> None:
        """没有 schema → 不带 response_format。"""
        payload = {"choices": [{"message": {"content": "x"}}]}
        client = FakeClient(FakeResponse(200, payload))
        provider = make_provider(client)

        await provider.complete(make_request(), "gpt-4o")

        assert "response_format" not in client.requests[0]["json"]

    @pytest.mark.asyncio
    async def test_raises_on_empty_choices(self) -> None:
        """⚠️ 200 但没有 choices → 报错。

        某些网关会返回 200 + 空 body，
        让它流到下游会变成 IndexError，难排查。
        """
        client = FakeClient(FakeResponse(200, {"id": "x"}))
        provider = make_provider(client)

        with pytest.raises(ProviderServerError, match="没有 choices"):
            await provider.complete(make_request(), "gpt-4o")


class TestRetry:
    """重试策略。"""

    @pytest.mark.asyncio
    async def test_retries_retryable_error(self) -> None:
        """可重试的错误 → 重试。"""
        attempts = 0

        async def operation() -> str:
            nonlocal attempts
            attempts += 1
            if attempts < 3:
                raise ProviderServerError("boom", provider="test")
            return "ok"

        result = await with_retry(operation, RetryPolicy(base_delay=0.0, jitter=False))

        assert result == "ok"
        assert attempts == 3

    @pytest.mark.asyncio
    async def test_does_not_retry_non_retryable(self) -> None:
        """⚠️ 不可重试的错误 → 立刻抛出。

        这是「不白白烧钱」的关键。
        """
        attempts = 0

        async def operation() -> str:
            nonlocal attempts
            attempts += 1
            raise ProviderAuthError("bad key", provider="test")

        with pytest.raises(ProviderAuthError):
            await with_retry(operation, RetryPolicy(base_delay=0.0, jitter=False))

        assert attempts == 1, "不可重试的错误被重试了 —— 会白白烧钱"

    @pytest.mark.asyncio
    async def test_gives_up_after_max_attempts(self) -> None:
        """超过最大次数 → 抛最后的错误。"""
        attempts = 0

        async def operation() -> str:
            nonlocal attempts
            attempts += 1
            raise ProviderServerError("always fails", provider="test")

        with pytest.raises(ProviderServerError):
            await with_retry(
                operation,
                RetryPolicy(max_attempts=3, base_delay=0.0, jitter=False),
            )

        assert attempts == 3

    @pytest.mark.asyncio
    async def test_succeeds_first_try(self) -> None:
        """第一次就成功 → 不重试。"""
        attempts = 0

        async def operation() -> str:
            nonlocal attempts
            attempts += 1
            return "ok"

        await with_retry(operation, RetryPolicy(base_delay=0.0, jitter=False))

        assert attempts == 1


class TestRetryPolicy:
    """退避计算。"""

    def test_delay_grows_exponentially(self) -> None:
        """⚠️ 指数退避 —— 固定间隔在限流时会火上浇油。"""
        policy = RetryPolicy(base_delay=1.0, jitter=False)
        assert policy.delay_for(0) == 1.0
        assert policy.delay_for(1) == 2.0
        assert policy.delay_for(2) == 4.0

    def test_delay_capped_at_max(self) -> None:
        """有上限 —— 不能等太久。"""
        policy = RetryPolicy(base_delay=1.0, max_delay=5.0, jitter=False)
        assert policy.delay_for(10) == 5.0

    def test_retry_after_wins(self) -> None:
        """⚠️ 厂商指定的等待时间优先。

        它最清楚自己的限流窗口。
        """
        policy = RetryPolicy(base_delay=1.0, jitter=False)
        assert policy.delay_for(0, retry_after=3.0) == 3.0

    def test_retry_after_still_capped(self) -> None:
        """厂商说的再久也要受上限约束。"""
        policy = RetryPolicy(base_delay=1.0, max_delay=5.0, jitter=False)
        assert policy.delay_for(0, retry_after=100.0) == 5.0


class TestLLMProviderError:
    """基础错误。"""

    def test_retryable_flag(self) -> None:
        """可重试标志。"""
        assert LLMProviderError("x", retryable=True).retryable
        assert not LLMProviderError("x").retryable

    def test_rate_limit_carries_retry_after(self) -> None:
        """限流错误带上等待时间。"""
        error = ProviderRateLimitError("x", provider="test", retry_after=2.5)
        assert error.retry_after == 2.5
        assert error.retryable
