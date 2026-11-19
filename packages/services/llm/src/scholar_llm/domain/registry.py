"""模型注册表与路由。

⚠️ 路由的决策顺序是**业务语义优先**，不是「哪个模型最强」：

    ① 显式指定 model → 就用它（用户明确要了）
    ② 需要结构化输出 → 只找支持 STRUCTURED_OUTPUT 的
    ③ 上下文超了 → 找 context_window 够大的
    ④ 按档位（fast/balanced/quality）选
    ⑤ 都找不到 → 报错

⚠️ **为什么不「总是选最强的」**：
    摘要任务用最强模型 = 成本翻十倍，效果提升有限。
    档位路由让「用户选快速/精细」真正有意义。
"""

from __future__ import annotations

from scholar_llm.domain.errors import ModelNotFoundError, NoSuitableModelError
from scholar_llm.domain.models import Capability, ModelSpec, ModelTier

__all__ = [
    "ModelNotFoundError",
    "ModelRegistry",
    "NoSuitableModelError",
]


# ⚠️ 错误类**只在 errors.py 定义一次**，这里再导出。
#    之前在 registry.py 里重复定义了一遍 —— 导致
#    `except NoSuitableModelError` 在不同模块捕获的是**不同的类**，
#    异常就「捕不住」了。这是同名类重复定义的经典坑。


class ModelRegistry:
    """模型注册表。

    ⚠️ 不可变 —— 注册后不能改。
       并发环境下「注册中改一半」会让路由结果不可预测。
    """

    def __init__(self, models: tuple[ModelSpec, ...] = ()) -> None:
        self._models: dict[str, ModelSpec] = {model.id: model for model in models}

    def register(self, model: ModelSpec) -> None:
        """注册一个模型。"""
        if model.id in self._models:
            raise ValueError(f"模型已注册：{model.id}")
        self._models[model.id] = model

    def get(self, model_id: str) -> ModelSpec:
        """按 ID 取模型。

        :raises ModelNotFoundError: 未注册
        """
        model = self._models.get(model_id)
        if model is None:
            available = ", ".join(sorted(self._models))
            raise ModelNotFoundError(f"未知模型：{model_id}（可用：{available}）")
        return model

    def all(self) -> tuple[ModelSpec, ...]:
        """全部模型。"""
        return tuple(self._models.values())

    def by_tier(self, tier: ModelTier) -> tuple[ModelSpec, ...]:
        """按档位取模型。"""
        return tuple(model for model in self._models.values() if model.tier is tier)

    def supports(self, capability: Capability) -> tuple[ModelSpec, ...]:
        """取支持某能力的模型。"""
        return tuple(model for model in self._models.values() if model.supports(capability))

    def route(
        self,
        tier: ModelTier = ModelTier.BALANCED,
        required_capabilities: tuple[Capability, ...] = (),
        min_context: int = 0,
        preferred_model: str | None = None,
    ) -> ModelSpec:
        """选一个模型。

        :param tier 档位偏好
        :param required_capabilities 必须支持的能力
        :param min_context 最小上下文窗口
        :param preferred_model 显式指定的模型（优先级最高）
        :raises ModelNotFoundError: 指定了但未注册
        :raises NoSuitableModelError: 没有满足条件的
        """
        # ① 显式指定 —— 用户明确要了，不做替换
        if preferred_model:
            model = self.get(preferred_model)
            # ⚠️ 显式指定也要校验能力 ——
            #    用户要结构化输出却指定了一个不支持的模型，
            #    报错比默默降级好。
            missing = [
                capability for capability in required_capabilities if not model.supports(capability)
            ]
            if missing:
                names = ", ".join(item.value for item in missing)
                raise NoSuitableModelError(f"模型 {preferred_model} 不支持：{names}")
            return model

        # ② 候选集 —— 能力过滤
        candidates = list(self._models.values())

        for capability in required_capabilities:
            candidates = [model for model in candidates if model.supports(capability)]

        # ③ 上下文过滤
        if min_context > 0:
            candidates = [model for model in candidates if model.context_window >= min_context]

        if not candidates:
            raise NoSuitableModelError(
                "没有满足条件的模型（"
                f"能力：{[item.value for item in required_capabilities]}，"
                f"最小上下文：{min_context}）"
            )

        # ④ 档位 —— 同档位里挑便宜的（成本优化）
        same_tier = [model for model in candidates if model.tier is tier]
        if same_tier:
            return min(same_tier, key=_total_price)

        # ⑤ 该档位没有 → 用所有候选里最便宜的
        #    ⚠️ 不报错 —— 有能用的模型总比没有强。
        return min(candidates, key=_total_price)


def _total_price(model: ModelSpec) -> float:
    """排序用：输入输出单价之和。"""
    return model.price_per_million_input + model.price_per_million_output
