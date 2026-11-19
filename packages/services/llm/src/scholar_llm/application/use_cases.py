"""应用用例 —— LLM 调用的编排。

⚠️ 这一层做三件事：

    ① 路由 —— 决定用哪个模型
    ② 内容语言 —— 把 `auto` 解析成具体语言并写进提示词
    ③ 结构化输出 —— 校验模型返回的 JSON 符合 schema

这三件都是**业务语义**，不属于「怎么发 HTTP」。
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from scholar_llm.application.ports import CompletionResult, LLMProvider
from scholar_llm.domain.errors import (
    ContextTooLongError,
    StructuredOutputError,
    UnsupportedCapabilityError,
)
from scholar_llm.domain.languages import (
    LANGUAGE_NAMES,
    ContentLanguage,
    resolve_auto_language,
)
from scholar_llm.domain.models import (
    Capability,
    CompletionRequest,
    Message,
    MessageRole,
    ModelSpec,
    ModelTier,
)
from scholar_llm.domain.registry import ModelRegistry, NoSuitableModelError

__all__ = [
    "GenerateStructuredRequest",
    "GenerateTextRequest",
    "LLMContext",
    "StructuredContent",
    "estimate_tokens",
    "generate_structured",
    "generate_text",
]


@dataclass(frozen=True, slots=True)
class LLMContext:
    """用例上下文 —— 打包注册表与厂商适配器。

    ⚠️ 与 auth 服务的 `AuthContext` 同一个思路：
    参数打包后用例只依赖「能力」不依赖「一堆实例」。
    """

    #: 模型注册表
    registry: ModelRegistry
    #: 厂商适配器（provider 名 → 适配器）
    providers: dict[str, LLMProvider]


@dataclass(frozen=True, slots=True)
class GenerateTextRequest:
    """文本生成请求。"""

    #: 提示词
    prompt: str
    #: 系统提示词
    system: str | None = None
    #: 内容语言
    language: ContentLanguage = ContentLanguage.AUTO
    #: 检测到的输入语言（`auto` 时用）
    detected_input_language: str | None = None
    #: 档位
    tier: ModelTier = ModelTier.BALANCED
    #: 显式指定模型
    model: str | None = None
    #: 温度
    temperature: float = 0.7
    #: 最大输出 token
    max_tokens: int | None = None


@dataclass(frozen=True, slots=True)
class GenerateStructuredRequest:
    """结构化生成请求。"""

    #: 提示词
    prompt: str
    #: JSON Schema
    schema: dict[str, Any]
    #: 系统提示词
    system: str | None = None
    #: 内容语言
    language: ContentLanguage = ContentLanguage.AUTO
    #: 检测到的输入语言
    detected_input_language: str | None = None
    #: 档位
    tier: ModelTier = ModelTier.BALANCED
    #: 显式指定模型
    model: str | None = None
    #: 温度 —— 结构化输出默认更低
    temperature: float = 0.2
    #: 最大输出 token
    max_tokens: int | None = None


@dataclass(frozen=True, slots=True)
class StructuredContent:
    """结构化输出结果。"""

    #: 解析后的对象
    data: dict[str, Any]
    #: 原始文本
    raw_text: str
    #: 用的模型
    model_id: str
    #: token 用量
    usage: Any


def estimate_tokens(text: str) -> int:
    """粗略估算 token 数。

    ⚠️ **估算，不是精确**。

    精确数要调厂商的 tokenizer API，那是一次网络往返 ——
    每次请求都调不划算。

    这里的做法：按「字符数 / 每 token 字符数」估。
    不同语言的比值不同：

    · 英文约 4 字符/token
    · 中文约 1.5 字符/token
    · 代码约 3 字符/token

    ⚠️ 估多了 → 提前报错（保守，安全）
    ⚠️ 估少了 → 真的超了才报错（不理想，但不会误杀）
    """
    if not text:
        return 0

    # 统计 CJK 字符数
    cjk = sum(1 for char in text if "\u4e00" <= char <= "\u9fff")
    other = len(text) - cjk

    # CJK 按 1.5 字符/token，其他按 3.5
    return int(cjk / 1.5 + other / 3.5)


def _build_messages(
    prompt: str,
    system: str | None,
    language: ContentLanguage,
    detected: str | None,
) -> tuple[Message, ...]:
    """构造消息列表（含语言指令）。

    ⚠️ **语言指令要具体** —— 「用中文回答」不如「用简体中文（Simplified Chinese）回答」
       可靠。后者是模型训练数据里见过的表述。
    """
    resolved = resolve_auto_language(language, detected)
    name = LANGUAGE_NAMES.get(resolved, resolved)

    messages: list[Message] = []

    system_text = system or ""
    # ⚠️ 语言指令加在系统提示词的**最后** —— 模型对末尾的指令更敏感
    system_text = f"{system_text}\n\n请使用 {name} 输出内容。".strip()

    messages.append(Message(role=MessageRole.SYSTEM, content=system_text))
    messages.append(Message(role=MessageRole.USER, content=prompt))

    return tuple(messages)


def _select_model(
    context: LLMContext,
    tier: ModelTier,
    model: str | None,
    required: tuple[Capability, ...],
    prompt_tokens: int,
) -> ModelSpec:
    """选模型并检查上下文。

    :raises ContextTooLongError: 所有候选模型的窗口都不够
    """
    # ① 先按能力 + 档位选 —— 拿到「这个任务该用哪档模型」
    spec = context.registry.route(
        tier=tier,
        required_capabilities=required,
        preferred_model=model,
    )

    # ⚠️ 显式指定模型时也要查上下文 —— 用户指定不代表窗口够大
    if prompt_tokens <= spec.context_window:
        return spec

    # ② 窗口不够 → 换窗口更大的模型
    #    ⚠️ 只在「没指定模型」时换 —— 用户指定的不动，
    #    否则会出现「我明明指定了模型，却被偷偷换掉」。
    if model is None:
        try:
            bigger = context.registry.route(
                tier=tier,
                required_capabilities=required,
                min_context=prompt_tokens,
            )
        except NoSuitableModelError:
            # 没有更大的模型 → 报「上下文超长」
            raise ContextTooLongError(
                spec.id,
                needed=prompt_tokens,
                available=spec.context_window,
            ) from None

        if bigger.context_window >= prompt_tokens:
            return bigger

    # ③ 换不了 → 报「上下文超长」
    #    ⚠️ 不自动截断 —— 截断会让模型「看起来回答了」但漏掉关键内容。
    raise ContextTooLongError(
        spec.id,
        needed=prompt_tokens,
        available=spec.context_window,
    )


def _provider_for(context: LLMContext, spec: ModelSpec) -> LLMProvider:
    """取厂商适配器。"""
    provider = context.providers.get(spec.provider)
    if provider is None:
        raise UnsupportedCapabilityError(f"厂商 {spec.provider} 没有注册适配器（模型：{spec.id}）")
    return provider


async def generate_text(
    context: LLMContext,
    request: GenerateTextRequest,
) -> CompletionResult:
    """生成文本。"""
    messages = _build_messages(
        request.prompt,
        request.system,
        request.language,
        request.detected_input_language,
    )

    prompt_tokens = sum(estimate_tokens(message.content) for message in messages)

    spec = _select_model(
        context,
        request.tier,
        request.model,
        (),
        prompt_tokens,
    )

    completion = CompletionRequest(
        messages=messages,
        model=spec.id,
        temperature=request.temperature,
        max_tokens=request.max_tokens or spec.max_output_tokens,
    )

    provider = _provider_for(context, spec)
    return await provider.complete(completion, spec.provider_model)


async def generate_structured(
    context: LLMContext,
    request: GenerateStructuredRequest,
) -> StructuredContent:
    """生成结构化输出。

    ⚠️ **结构化输出必须找支持 `STRUCTURED_OUTPUT` 的模型** ——
       不支持的话模型只能「尽量返回 JSON」，那不是结构化输出。

    ⚠️ **解析失败不自动重试** —— 重试的代价是一次完整调用。
       解析失败通常意味着 prompt 没说清要什么字段，
       重试不会变好。抛错让调用方决定。
    """
    messages = _build_messages(
        request.prompt,
        request.system,
        request.language,
        request.detected_input_language,
    )

    prompt_tokens = sum(estimate_tokens(message.content) for message in messages)

    spec = _select_model(
        context,
        request.tier,
        request.model,
        (Capability.STRUCTURED_OUTPUT,),
        prompt_tokens,
    )

    completion = CompletionRequest(
        messages=messages,
        model=spec.id,
        temperature=request.temperature,
        max_tokens=request.max_tokens or spec.max_output_tokens,
        response_schema=request.schema,
    )

    provider = _provider_for(context, spec)
    result = await provider.complete(completion, spec.provider_model)

    data = _parse_structured(result.content, request.schema, spec.id)

    return StructuredContent(
        data=data,
        raw_text=result.content,
        model_id=spec.id,
        usage=result.usage,
    )


def _parse_structured(
    text: str,
    schema: dict[str, Any],
    model_id: str,
) -> dict[str, Any]:
    r"""解析并校验结构化输出。

    ⚠️ **容忍 markdown 代码块包裹** —— 模型经常返回
       ```json\n{...}\n```，直接 json.loads 会失败。
       先剥掉围栏再解析。
    """
    cleaned = text.strip()

    # 剥 markdown 围栏
    if cleaned.startswith("```"):
        # 去掉 ```json 或 ``` 开头
        first_newline = cleaned.find("\n")
        if first_newline != -1:
            cleaned = cleaned[first_newline + 1 :]
        # 去掉结尾的 ```
        if cleaned.rstrip().endswith("```"):
            cleaned = cleaned.rstrip()[:-3]

    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise StructuredOutputError(f"模型 {model_id} 返回的不是合法 JSON：{exc}") from exc

    if not isinstance(parsed, dict):
        raise StructuredOutputError(
            f"模型 {model_id} 返回的 JSON 不是对象：{type(parsed).__name__}"
        )

    # ⚠️ 校验必填字段 —— schema 里 required 的字段必须在
    required = schema.get("required", [])
    missing = [field for field in required if field not in parsed]
    if missing:
        raise StructuredOutputError(f"模型 {model_id} 返回缺少必填字段：{', '.join(missing)}")

    return parsed
