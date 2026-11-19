"""模型注册表与路由测试。"""

from __future__ import annotations

import pytest

from scholar_llm.domain.models import Capability, ModelSpec, ModelTier
from scholar_llm.domain.registry import ModelNotFoundError, ModelRegistry, NoSuitableModelError
from tests.conftest import ModelOptions, make_model


class TestModelRegistry:
    """注册表基础行为。"""

    def test_get_returns_model(self) -> None:
        """按 ID 取模型。"""
        registry = ModelRegistry((make_model("a"),))
        assert registry.get("a").id == "a"

    def test_get_unknown_raises(self) -> None:
        """⚠️ 未注册的模型要报错，并列出可用的。"""
        registry = ModelRegistry((make_model("a"),))
        with pytest.raises(ModelNotFoundError) as exc_info:
            registry.get("nope")

        assert "a" in str(exc_info.value)

    def test_register_adds_model(self) -> None:
        """注册新模型。"""
        registry = ModelRegistry()
        registry.register(make_model("a"))
        assert registry.get("a").id == "a"

    def test_register_duplicate_raises(self) -> None:
        """⚠️ 重复注册要报错 —— 静默覆盖会让路由结果不可预测。"""
        registry = ModelRegistry((make_model("a"),))
        with pytest.raises(ValueError, match="已注册"):
            registry.register(make_model("a"))

    def test_by_tier_filters(self) -> None:
        """按档位筛选。"""
        registry = ModelRegistry(
            (
                make_model("fast1", ModelOptions(tier=ModelTier.FAST)),
                make_model("bal1", ModelOptions(tier=ModelTier.BALANCED)),
                make_model("fast2", ModelOptions(tier=ModelTier.FAST)),
            )
        )
        assert len(registry.by_tier(ModelTier.FAST)) == 2
        assert len(registry.by_tier(ModelTier.QUALITY)) == 0

    def test_supports_filters_by_capability(self) -> None:
        """按能力筛选。"""
        registry = ModelRegistry(
            (
                make_model("plain"),
                make_model(
                    "structured",
                    ModelOptions(
                        capabilities=frozenset({Capability.TEXT, Capability.STRUCTURED_OUTPUT})
                    ),
                ),
            )
        )
        assert len(registry.supports(Capability.STRUCTURED_OUTPUT)) == 1


class TestRouting:
    """路由决策。"""

    def test_preferred_model_wins(self) -> None:
        """⚠️ 显式指定的模型优先 —— 不做替换。"""
        registry = ModelRegistry(
            (
                make_model("cheap", ModelOptions(input_price=0.1)),
                make_model("explicit", ModelOptions(input_price=100.0)),
            )
        )
        chosen = registry.route(preferred_model="explicit")
        assert chosen.id == "explicit"

    def test_preferred_model_still_checks_capabilities(self) -> None:
        """⚠️ 显式指定也要校验能力。

        用户要结构化输出却指定了不支持的模型 —— 报错比默默降级好。
        """
        registry = ModelRegistry((make_model("plain"),))
        with pytest.raises(NoSuitableModelError, match="不支持"):
            registry.route(
                preferred_model="plain",
                required_capabilities=(Capability.STRUCTURED_OUTPUT,),
            )

    def test_filters_by_required_capability(self) -> None:
        """按能力过滤。"""
        registry = ModelRegistry(
            (
                make_model("plain"),
                make_model(
                    "structured",
                    ModelOptions(
                        capabilities=frozenset({Capability.TEXT, Capability.STRUCTURED_OUTPUT})
                    ),
                ),
            )
        )
        chosen = registry.route(required_capabilities=(Capability.STRUCTURED_OUTPUT,))
        assert chosen.id == "structured"

    def test_raises_when_no_model_has_capability(self) -> None:
        """没有模型支持所需能力 → 报错。"""
        registry = ModelRegistry((make_model("plain"),))
        with pytest.raises(NoSuitableModelError):
            registry.route(required_capabilities=(Capability.VISION,))

    def test_filters_by_min_context(self) -> None:
        """按上下文窗口过滤。"""
        registry = ModelRegistry(
            (
                make_model("small", ModelOptions(context_window=1_000)),
                make_model("big", ModelOptions(context_window=200_000)),
            )
        )
        chosen = registry.route(min_context=100_000)
        assert chosen.id == "big"

    def test_same_tier_picks_cheapest(self) -> None:
        """⚠️ 同档位里挑最便宜的。

        这就是「不总是选最强的」的实现 ——
        同档位的模型能力差不多，但价格能差十倍。
        """
        registry = ModelRegistry(
            (
                make_model("expensive", ModelOptions(input_price=10.0)),
                make_model("cheap", ModelOptions(input_price=0.1)),
            )
        )
        chosen = registry.route(tier=ModelTier.BALANCED)
        assert chosen.id == "cheap"

    def test_falls_back_to_other_tier_when_empty(self) -> None:
        """⚠️ 该档位没有模型 → 用所有候选里最便宜的，不报错。

        有能用的模型总比没有强。
        """
        registry = ModelRegistry((make_model("only_fast", ModelOptions(tier=ModelTier.FAST)),))
        chosen = registry.route(tier=ModelTier.QUALITY)
        assert chosen.id == "only_fast"

    def test_raises_when_registry_empty(self) -> None:
        """空注册表 → 报错。"""
        with pytest.raises(NoSuitableModelError):
            ModelRegistry().route()


class TestModelSpec:
    """模型规格。"""

    def test_supports_capability(self) -> None:
        """能力查询。"""
        model = make_model("a")
        assert model.supports(Capability.TEXT)
        assert not model.supports(Capability.VISION)

    def test_estimate_cost(self) -> None:
        """成本估算。"""
        model = make_model("a", ModelOptions(input_price=1.0))
        # 1000 token 输入 = 0.001 美元；1000 token 输出 = 0.002
        cost = model.estimate_cost(1_000, 1_000)
        assert cost == pytest.approx(0.003)

    def test_estimate_cost_zero_usage(self) -> None:
        """零用量 → 零成本。"""
        assert make_model("a").estimate_cost(0, 0) == 0.0


def test_make_model_returns_spec() -> None:
    """辅助函数返回正确的规格。"""
    model = make_model("x")
    assert isinstance(model, ModelSpec)
    assert model.id == "x"
