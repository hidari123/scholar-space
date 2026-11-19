"""测试共用工具。

⚠️ 用 dataclass 而不是一堆关键字参数 ——
   ruff 的 PLR0913 限制参数个数（5 个），
   而构造一个测试模型天然需要 6 个参数。
   打包成 dataclass 既满足规则，调用处也更清晰。
"""

from __future__ import annotations

from dataclasses import dataclass, field

from scholar_llm.domain.models import Capability, ModelSpec, ModelTier


@dataclass(slots=True)
class ModelOptions:
    """构造测试模型的选项。"""

    #: 档位
    tier: ModelTier = ModelTier.BALANCED
    #: 能力
    capabilities: frozenset[Capability] = field(
        default_factory=lambda: frozenset({Capability.TEXT})
    )
    #: 上下文窗口
    context_window: int = 128_000
    #: 厂商
    provider: str = "test"
    #: 输入单价
    input_price: float = 1.0


def make_model(model_id: str, options: ModelOptions | None = None) -> ModelSpec:
    """构造一个测试用模型规格。

    :param model_id 模型 ID
    :param options 可选项
    """
    opts = options or ModelOptions()

    return ModelSpec(
        id=model_id,
        provider=opts.provider,
        provider_model=model_id,
        display_name=model_id,
        tier=opts.tier,
        capabilities=opts.capabilities,
        context_window=opts.context_window,
        price_per_million_input=opts.input_price,
        price_per_million_output=opts.input_price * 2,
    )
