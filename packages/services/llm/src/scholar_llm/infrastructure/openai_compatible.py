"""OpenAI 兼容协议适配器。

⚠️ **一个适配器覆盖多个厂商** —— 因为它们的 API 大同小异：

    OpenAI / 智谱 / 通义 / DeepSeek / Groq / Together
    都是 POST {base_url}/chat/completions，body 结构一样。

    只有 base_url 和模型名不同。

⚠️ Anthropic 不兼容（system 是独立字段）——
   它需要单独的适配器（`anthropic.py`）。
   **不要为了「统一」把 Anthropic 硬塞进这个协议** ——
   那种统一会让两边都变别扭。
"""

from __future__ import annotations

import json
from typing import Any

from scholar_llm.application.ports import CompletionResult
from scholar_llm.domain.errors import (
    ContextTooLongError,
    ProviderAuthError,
    ProviderRateLimitError,
    ProviderServerError,
)
from scholar_llm.domain.models import CompletionRequest, TokenUsage

__all__ = ["OpenAICompatibleProvider"]

# ⚠️ HTTP 状态码常量 —— 用名字代替魔法数字。
#    这里的每个数字都对应一种**重试策略**，写出来才看得出分类逻辑。
HTTP_BAD_REQUEST = 400
HTTP_UNAUTHORIZED = 401
HTTP_FORBIDDEN = 403
HTTP_TOO_MANY_REQUESTS = 429
HTTP_SERVER_ERROR = 500

#: 错误文本截断长度 —— 厂商有时返回超长 HTML 错误页。
MAX_ERROR_TEXT = 500


class OpenAICompatibleProvider:
    """OpenAI 兼容协议适配器。

    ⚠️ **HTTP 客户端由外部注入** —— 本类不 import httpx。
       这样：
       · 领域层与应用层零外部依赖
       · 测试可以塞一个假客户端，不需要起服务
       · 换 HTTP 库不影响业务代码
    """

    def __init__(
        self,
        client: Any,
        base_url: str,
        api_key: str,
        provider_name: str = "openai",
        timeout: float = 60.0,
    ) -> None:
        self._client = client
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key
        self._provider_name = provider_name
        self._timeout = timeout

    @property
    def provider_name(self) -> str:
        """厂商名。"""
        return self._provider_name

    async def complete(self, request: CompletionRequest, model_id: str) -> CompletionResult:
        """执行一次补全。

        :param request 请求
        :param model_id 厂商侧的模型名
        """
        body = self._build_body(request, model_id)

        response = await self._client.post(
            f"{self._base_url}/chat/completions",
            json=body,
            headers={
                "Authorization": f"Bearer {self._api_key}",
                "Content-Type": "application/json",
            },
            timeout=self._timeout,
        )

        self._raise_for_status(response.status_code, response.text)

        payload = response.json()
        return self._parse(payload, model_id)

    def _build_body(self, request: CompletionRequest, model_id: str) -> dict[str, Any]:
        """构造请求体。

        ⚠️ **结构化输出走 `response_format`** —— OpenAI 兼容协议里
           这是标准字段（`json_schema` 或 `json_object`）。
           不是靠提示词求模型「请返回 JSON」。
        """
        body: dict[str, Any] = {
            "model": model_id,
            "messages": [message.to_dict() for message in request.messages],
            "temperature": request.temperature,
        }

        if request.max_tokens is not None:
            body["max_tokens"] = request.max_tokens

        if request.stop:
            body["stop"] = list(request.stop)

        if request.response_schema is not None:
            body["response_format"] = {
                "type": "json_schema",
                "json_schema": {
                    "name": "structured_output",
                    "schema": request.response_schema,
                    "strict": True,
                },
            }

        return body

    def _raise_for_status(self, status: int, text: str) -> None:
        """按状态码分类错误。

        ⚠️ **分类决定能不能重试** —— 这是整个错误体系的核心。

            401/403 → 不可重试（配置错了，重试没用）
            429     → 可重试（限流，等一会）
            5xx     → 可重试（厂商临时故障）
            400     → 不可重试（参数错）
            超长     → 不可重试（要换模型，不是重试）
        """
        if status < HTTP_BAD_REQUEST:
            return

        message = text[:MAX_ERROR_TEXT] if text else f"HTTP {status}"

        if status in (HTTP_UNAUTHORIZED, HTTP_FORBIDDEN):
            raise ProviderAuthError(
                f"鉴权失败（{status}）：{message}",
                provider=self._provider_name,
            )

        if status == HTTP_TOO_MANY_REQUESTS:
            raise ProviderRateLimitError(
                f"触发限流（{status}）：{message}",
                provider=self._provider_name,
            )

        if status >= HTTP_SERVER_ERROR:
            raise ProviderServerError(
                f"厂商服务异常（{status}）：{message}",
                provider=self._provider_name,
            )

        if (
            status == HTTP_BAD_REQUEST
            and "context" in message.lower()
            and "length" in message.lower()
        ):
            # ⚠️ 上下文超长 —— 换模型才能解决，重试没用
            raise ContextTooLongError(model_id="unknown", needed=0, available=0)

        # 其它 4xx —— 不可重试
        raise ProviderAuthError(
            f"请求被拒绝（{status}）：{message}",
            provider=self._provider_name,
        )

    def _parse(self, payload: dict[str, Any], model_id: str) -> CompletionResult:
        """解析响应。

        ⚠️ **超时可能伪装成 200 + 空 choices** ——
           某些网关会返回 200 但 body 里没有 choices。
           这里显式检查，不让下游拿到 IndexError。
        """
        choices = payload.get("choices")
        if not choices:
            raise ProviderServerError(
                f"响应里没有 choices：{json.dumps(payload)[:300]}",
                provider=self._provider_name,
            )

        first = choices[0]
        message = first.get("message") or {}
        content = message.get("content") or ""

        usage_raw = payload.get("usage") or {}
        usage = TokenUsage(
            prompt_tokens=int(usage_raw.get("prompt_tokens", 0)),
            completion_tokens=int(usage_raw.get("completion_tokens", 0)),
        )

        return CompletionResult(
            content=content,
            model_id=model_id,
            usage=usage,
            finish_reason=first.get("finish_reason") or "stop",
            raw=payload,
        )


class FakeProvider:
    """假适配器 —— 测试用。

    ⚠️ **放在 infrastructure 层** —— 因为它实现的是端口（应用层定义）。
       业务代码用它做测试，不需要真调 API。
    """

    def __init__(
        self,
        responses: list[str] | None = None,
        provider_name: str = "fake",
        errors: list[Exception] | None = None,
    ) -> None:
        self.responses = responses or []
        self.errors = errors or []
        self.provider_name = provider_name
        self.calls: list[CompletionRequest] = []

    async def complete(self, request: CompletionRequest, model_id: str) -> CompletionResult:
        """按顺序返回预设响应。"""
        self.calls.append(request)

        if self.errors:
            error = self.errors.pop(0)
            raise error

        content = self.responses.pop(0) if self.responses else ""

        return CompletionResult(
            content=content,
            model_id=model_id,
            usage=TokenUsage(prompt_tokens=10, completion_tokens=20),
        )
