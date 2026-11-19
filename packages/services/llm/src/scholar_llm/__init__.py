"""scholarspace LLM 服务 —— 多模型接入 + 内容语言 + 结构化输出。

⚠️ 四层架构：
    domain         → 模型定义 / 语言 / 路由 / 错误（零外部依赖）
    application    → 用例编排 + 端口协议
    infrastructure → HTTP 适配器 / 重试 / 模型目录

⚠️ **界面语言与内容语言解耦**（ADR-0006）：
    界面语言是用户看到的菜单语言；
    内容语言是 LLM 生成内容用的语言。两者互不影响。
"""

from scholar_llm.application.ports import CompletionResult, LLMProvider
from scholar_llm.application.use_cases import (
    GenerateStructuredRequest,
    GenerateTextRequest,
    LLMContext,
    StructuredContent,
    estimate_tokens,
    generate_structured,
    generate_text,
)
from scholar_llm.domain.errors import (
    ContextTooLongError,
    LLMError,
    LLMProviderError,
    ModelNotFoundError,
    NoSuitableModelError,
    ProviderAuthError,
    ProviderRateLimitError,
    ProviderServerError,
    ProviderTimeoutError,
    StructuredOutputError,
    UnsupportedCapabilityError,
)
from scholar_llm.domain.languages import (
    LANGUAGE_NAMES,
    ContentLanguage,
    resolve_auto_language,
    validate_content_language,
)
from scholar_llm.domain.models import (
    Capability,
    CompletionRequest,
    Message,
    MessageRole,
    ModelSpec,
    ModelTier,
    TokenUsage,
)
from scholar_llm.domain.registry import ModelRegistry

__all__ = [
    "LANGUAGE_NAMES",
    "Capability",
    "CompletionRequest",
    "CompletionResult",
    "ContentLanguage",
    "ContextTooLongError",
    "GenerateStructuredRequest",
    "GenerateTextRequest",
    "LLMContext",
    "LLMError",
    "LLMProvider",
    "LLMProviderError",
    "Message",
    "MessageRole",
    "ModelNotFoundError",
    "ModelRegistry",
    "ModelSpec",
    "ModelTier",
    "NoSuitableModelError",
    "ProviderAuthError",
    "ProviderRateLimitError",
    "ProviderServerError",
    "ProviderTimeoutError",
    "StructuredContent",
    "StructuredOutputError",
    "TokenUsage",
    "UnsupportedCapabilityError",
    "estimate_tokens",
    "generate_structured",
    "generate_text",
    "resolve_auto_language",
    "validate_content_language",
]
