"""用例测试 —— 路由、语言注入、结构化输出。"""

from __future__ import annotations

import pytest

from scholar_llm.application.use_cases import (
    GenerateStructuredRequest,
    GenerateTextRequest,
    LLMContext,
    estimate_tokens,
    generate_structured,
    generate_text,
)
from scholar_llm.domain.errors import (
    ContextTooLongError,
    NoSuitableModelError,
    StructuredOutputError,
    UnsupportedCapabilityError,
)
from scholar_llm.domain.languages import ContentLanguage
from scholar_llm.domain.models import (
    Capability,
    CompletionRequest,
    Message,
    MessageRole,
    ModelSpec,
    ModelTier,
)
from scholar_llm.domain.registry import ModelRegistry
from scholar_llm.infrastructure.openai_compatible import FakeProvider
from tests.conftest import ModelOptions, make_model

#: 结构化输出测试用的 schema。
SCHEMA = {
    "type": "object",
    "properties": {
        "method": {"type": "string"},
        "limitations": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["method", "limitations"],
}

#: 支持结构化输出的模型选项。
STRUCTURED_OPTIONS = ModelOptions(
    capabilities=frozenset({Capability.TEXT, Capability.STRUCTURED_OUTPUT})
)


def make_context(
    provider: FakeProvider | None = None,
    models: tuple[ModelSpec, ...] | None = None,
) -> LLMContext:
    """构造用例上下文。"""
    fake = provider or FakeProvider(responses=["生成的内容"])
    specs = models or (make_model("m1"),)
    return LLMContext(
        registry=ModelRegistry(specs),
        providers={"test": fake},
    )


class TestGenerateText:
    """文本生成。"""

    @pytest.mark.asyncio
    async def test_returns_provider_content(self) -> None:
        """返回厂商给的内容。"""
        provider = FakeProvider(responses=["你好，这是摘要"])
        context = make_context(provider)

        result = await generate_text(context, GenerateTextRequest(prompt="总结这篇论文"))

        assert result.content == "你好，这是摘要"

    @pytest.mark.asyncio
    async def test_injects_language_instruction(self) -> None:
        """⚠️ 语言指令要进系统提示词。

        这是「内容语言」功能的落地点 ——
        不注入的话，模型大概率就用默认语言回答了。
        """
        provider = FakeProvider(responses=["ok"])
        context = make_context(provider)

        await generate_text(
            context,
            GenerateTextRequest(
                prompt="总结",
                language=ContentLanguage.ZH_CN,
            ),
        )

        system = provider.calls[0].system_prompt()
        assert "简体中文" in system
        assert "Simplified Chinese" in system

    @pytest.mark.asyncio
    async def test_language_instruction_is_last_in_system_prompt(self) -> None:
        """⚠️ 语言指令放在系统提示词**最后**。

        模型对末尾的指令更敏感 —— 放在中间容易被前面的长文本淹没。
        """
        provider = FakeProvider(responses=["ok"])
        context = make_context(provider)

        await generate_text(
            context,
            GenerateTextRequest(
                prompt="总结",
                system="你是学术助手。请严谨。",
                language=ContentLanguage.JA,
            ),
        )

        system = provider.calls[0].system_prompt()
        # 原本的系统提示词在最前
        assert system.startswith("你是学术助手。请严谨。")
        # 语言指令在最后
        assert "日本語" in system
        assert system.rstrip().endswith("输出内容。")

    @pytest.mark.asyncio
    async def test_auto_language_uses_detected(self) -> None:
        """⚠️ auto + 检测到的语言 → 注入对应语言指令。"""
        provider = FakeProvider(responses=["ok"])
        context = make_context(provider)

        await generate_text(
            context,
            GenerateTextRequest(
                prompt="summarize",
                language=ContentLanguage.AUTO,
                detected_input_language="en",
            ),
        )

        assert "English" in provider.calls[0].system_prompt()

    @pytest.mark.asyncio
    async def test_routes_by_tier(self) -> None:
        """按档位路由。"""
        provider = FakeProvider(responses=["ok"])
        context = make_context(
            provider,
            models=(
                make_model("fast", ModelOptions(tier=ModelTier.FAST, input_price=0.1)),
                make_model("quality", ModelOptions(tier=ModelTier.QUALITY, input_price=100.0)),
            ),
        )

        await generate_text(context, GenerateTextRequest(prompt="x", tier=ModelTier.FAST))

        assert provider.calls[0].model == "fast"

    @pytest.mark.asyncio
    async def test_raises_context_too_long(self) -> None:
        """⚠️ 上下文超长要报错，不是静默截断。

        截断会让模型「看起来回答了」但漏掉关键内容。
        """
        provider = FakeProvider(responses=["ok"])
        context = make_context(
            provider, models=(make_model("small", ModelOptions(context_window=10)),)
        )

        # ⚠️ 提示词必须**真的**超过窗口 —— 否则测的是别的东西
        with pytest.raises(ContextTooLongError):
            await generate_text(context, GenerateTextRequest(prompt="很长的文本" * 1000))

    @pytest.mark.asyncio
    async def test_picks_bigger_model_when_needed(self) -> None:
        """⚠️ 小模型不够 → 自动换窗口大的。

        只在「没指定模型」时换 —— 用户指定的就不动。
        """
        provider = FakeProvider(responses=["ok"])
        context = make_context(
            provider,
            models=(
                make_model("small", ModelOptions(context_window=10, input_price=0.1)),
                make_model("big", ModelOptions(context_window=200_000, input_price=100.0)),
            ),
        )

        # ⚠️ 提示词要超过 small 的窗口（10），才能触发升级
        await generate_text(context, GenerateTextRequest(prompt="x" * 200))

        assert provider.calls[0].model == "big"

    @pytest.mark.asyncio
    async def test_explicit_model_not_swapped_even_if_too_small(self) -> None:
        """⚠️ 显式指定的模型**不会被偷偷换掉**。

        用户明确指定了就用 —— 窗口不够就报错，
        换成别的模型等于「没按我说的做」。
        """
        provider = FakeProvider(responses=["ok"])
        context = make_context(
            provider,
            models=(
                make_model("small", ModelOptions(context_window=10)),
                make_model("big", ModelOptions(context_window=200_000)),
            ),
        )

        with pytest.raises(ContextTooLongError):
            await generate_text(context, GenerateTextRequest(prompt="x" * 200, model="small"))

    @pytest.mark.asyncio
    async def test_raises_when_provider_missing(self) -> None:
        """⚠️ 厂商没注册适配器 → 报错。

        静默跳过会导致「配错了但看起来能用」。
        """
        context = LLMContext(
            registry=ModelRegistry((make_model("m1", ModelOptions(provider="unknown")),)),
            providers={},
        )

        with pytest.raises(UnsupportedCapabilityError, match="没有注册适配器"):
            await generate_text(context, GenerateTextRequest(prompt="x"))


class TestGenerateStructured:
    """结构化输出。"""

    @pytest.mark.asyncio
    async def test_parses_json(self) -> None:
        """解析 JSON。"""
        provider = FakeProvider(responses=['{"method": "A", "limitations": []}'])
        context = make_context(provider, models=(make_model("structured", STRUCTURED_OPTIONS),))

        result = await generate_structured(
            context,
            GenerateStructuredRequest(prompt="分析", schema=SCHEMA),
        )

        assert result.data["method"] == "A"

    @pytest.mark.asyncio
    async def test_strips_markdown_fence(self) -> None:
        r"""⚠️ 容忍 markdown 代码块包裹。

        模型经常返回 ```json\n{...}\n```，直接 json.loads 会失败。
        """
        provider = FakeProvider(responses=['```json\n{"method": "A", "limitations": []}\n```'])
        context = make_context(provider, models=(make_model("structured", STRUCTURED_OPTIONS),))

        result = await generate_structured(
            context,
            GenerateStructuredRequest(prompt="分析", schema=SCHEMA),
        )

        assert result.data["method"] == "A"

    @pytest.mark.asyncio
    async def test_raises_on_invalid_json(self) -> None:
        """不是合法 JSON → 报错。"""
        provider = FakeProvider(responses=["这不是 JSON"])
        context = make_context(provider, models=(make_model("structured", STRUCTURED_OPTIONS),))

        with pytest.raises(StructuredOutputError, match="不是合法 JSON"):
            await generate_structured(
                context,
                GenerateStructuredRequest(prompt="分析", schema=SCHEMA),
            )

    @pytest.mark.asyncio
    async def test_raises_on_missing_required_field(self) -> None:
        """⚠️ 缺少必填字段 → 报错。

        schema 说 required 的字段不在结果里 —— 下游会 KeyError。
        """
        provider = FakeProvider(responses=['{"method": "A"}'])
        context = make_context(provider, models=(make_model("structured", STRUCTURED_OPTIONS),))

        with pytest.raises(StructuredOutputError, match="缺少必填字段"):
            await generate_structured(
                context,
                GenerateStructuredRequest(prompt="分析", schema=SCHEMA),
            )

    @pytest.mark.asyncio
    async def test_requires_structured_capable_model(self) -> None:
        """⚠️ 必须路由到支持结构化输出的模型。

        不支持的话模型只能「尽量返回 JSON」—— 那不是结构化输出。
        """
        provider = FakeProvider(responses=["ok"])
        context = make_context(provider, models=(make_model("plain"),))

        with pytest.raises(NoSuitableModelError):
            await generate_structured(
                context,
                GenerateStructuredRequest(prompt="分析", schema=SCHEMA),
            )

    @pytest.mark.asyncio
    async def test_passes_schema_to_provider(self) -> None:
        """⚠️ schema 要真的传给厂商（约束解码），不是靠提示词求。"""
        provider = FakeProvider(responses=['{"method": "A", "limitations": []}'])
        context = make_context(provider, models=(make_model("structured", STRUCTURED_OPTIONS),))

        await generate_structured(
            context,
            GenerateStructuredRequest(prompt="分析", schema=SCHEMA),
        )

        assert provider.calls[0].response_schema == SCHEMA


class TestEstimateTokens:
    """token 估算。"""

    def test_empty_string(self) -> None:
        """空串 → 0。"""
        assert estimate_tokens("") == 0

    def test_english_costs_less_than_chinese(self) -> None:
        """⚠️ 同样字符数，中文的 token 更多。

        因为中文 1 字 ≈ 0.67 token，英文 1 字符 ≈ 0.29 token。
        ⚠️ 两边**字符数必须相等** —— 否则比的是长度不是密度。
        """
        chinese = estimate_tokens("学" * 300)
        english = estimate_tokens("a" * 300)
        assert chinese > english

    def test_cjk_ratio_is_about_three_times(self) -> None:
        """⚠️ CJK 的 token 密度约为英文的三倍。

        这决定了「上下文超长」的判断准不准 ——
        估得太松会让请求发出去才被厂商拒绝。
        """
        cjk = estimate_tokens("学" * 300)
        latin = estimate_tokens("a" * 300)
        # 300 个汉字 ≈ 200 token；300 个字母 ≈ 85 token
        assert 190 <= cjk <= 210
        assert 80 <= latin <= 90

    def test_longer_text_costs_more(self) -> None:
        """越长越多。"""
        assert estimate_tokens("a" * 1000) > estimate_tokens("a" * 100)


class TestMessageRoles:
    """消息角色分离。"""

    def test_system_prompt_extracted(self) -> None:
        """系统提示词能单独摘出来。"""
        request = CompletionRequest(
            messages=(
                Message(role=MessageRole.SYSTEM, content="sys"),
                Message(role=MessageRole.USER, content="user"),
            )
        )

        assert request.system_prompt() == "sys"
        assert len(request.conversation()) == 1
