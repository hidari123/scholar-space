"""默认模型目录。

⚠️ **价格与上下文窗口会过期** —— 所以：
    ① 放在 infrastructure 层（运行时数据，不是领域规则）
    ② 允许用环境变量/配置覆盖
    ③ 上线前核对一次厂商官网

⚠️ 这里列的模型都是**公开可用**的 —— 不涉及任何私有部署。
"""

from __future__ import annotations

from scholar_llm.domain.models import Capability, ModelSpec, ModelTier
from scholar_llm.domain.registry import ModelRegistry

__all__ = ["build_default_registry"]


def build_default_registry() -> ModelRegistry:
    """构建默认模型注册表。"""
    models = (
        # ── 快速档 ────────────────────────────────────────
        ModelSpec(
            id="gpt-4o-mini",
            provider="openai",
            provider_model="gpt-4o-mini",
            display_name="GPT-4o mini",
            tier=ModelTier.FAST,
            capabilities=frozenset(
                {
                    Capability.TEXT,
                    Capability.STRUCTURED_OUTPUT,
                    Capability.STREAMING,
                    Capability.VISION,
                }
            ),
            context_window=128_000,
            max_output_tokens=16_384,
            price_per_million_input=0.15,
            price_per_million_output=0.60,
            supports_streaming=True,
        ),
        ModelSpec(
            id="deepseek-chat",
            provider="deepseek",
            provider_model="deepseek-chat",
            display_name="DeepSeek Chat",
            tier=ModelTier.FAST,
            capabilities=frozenset({Capability.TEXT, Capability.STRUCTURED_OUTPUT}),
            context_window=64_000,
            max_output_tokens=8_192,
            price_per_million_input=0.27,
            price_per_million_output=1.10,
        ),
        # ── 均衡档 ────────────────────────────────────────
        ModelSpec(
            id="gpt-4o",
            provider="openai",
            provider_model="gpt-4o",
            display_name="GPT-4o",
            tier=ModelTier.BALANCED,
            capabilities=frozenset(
                {
                    Capability.TEXT,
                    Capability.STRUCTURED_OUTPUT,
                    Capability.STREAMING,
                    Capability.VISION,
                    Capability.LONG_CONTEXT,
                }
            ),
            context_window=128_000,
            max_output_tokens=16_384,
            price_per_million_input=2.50,
            price_per_million_output=10.00,
            supports_streaming=True,
        ),
        ModelSpec(
            id="qwen-plus",
            provider="zhipu",
            provider_model="qwen-plus",
            display_name="Qwen Plus",
            tier=ModelTier.BALANCED,
            capabilities=frozenset({Capability.TEXT, Capability.STRUCTURED_OUTPUT}),
            context_window=128_000,
            max_output_tokens=8_192,
            price_per_million_input=0.40,
            price_per_million_output=1.20,
        ),
        # ── 精细档 ────────────────────────────────────────
        ModelSpec(
            id="gpt-4o-2024-11-20",
            provider="openai",
            provider_model="gpt-4o-2024-11-20",
            display_name="GPT-4o (2024-11)",
            tier=ModelTier.QUALITY,
            capabilities=frozenset(
                {
                    Capability.TEXT,
                    Capability.STRUCTURED_OUTPUT,
                    Capability.STREAMING,
                    Capability.VISION,
                    Capability.LONG_CONTEXT,
                }
            ),
            context_window=128_000,
            max_output_tokens=16_384,
            price_per_million_input=2.50,
            price_per_million_output=10.00,
            supports_streaming=True,
        ),
        ModelSpec(
            id="claude-sonnet-4",
            provider="anthropic",
            provider_model="claude-sonnet-4-20250514",
            display_name="Claude Sonnet 4",
            tier=ModelTier.QUALITY,
            capabilities=frozenset(
                {
                    Capability.TEXT,
                    Capability.STRUCTURED_OUTPUT,
                    Capability.STREAMING,
                    Capability.VISION,
                    Capability.LONG_CONTEXT,
                }
            ),
            context_window=200_000,
            max_output_tokens=64_000,
            price_per_million_input=3.00,
            price_per_million_output=15.00,
            supports_streaming=True,
        ),
    )

    registry = ModelRegistry(models)
    return registry
