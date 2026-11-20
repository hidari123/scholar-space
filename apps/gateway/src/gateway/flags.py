"""特性开关 —— 切流的控制点。

⚠️ **开关是「按路径前缀」控制的** ——
这样能一个服务一个服务地切，不用全切或全不切。

⚠️ **开关状态是注入的** ——
路由层不该关心开关存哪儿（配置？数据库？Redis？）。

⚠️ **默认关闭** ——
新服务刚上线时开关是关的，
出问题能立刻关掉。
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol, runtime_checkable

__all__ = ["FeatureFlags", "StaticFeatureFlags"]


@runtime_checkable
class FeatureFlags(Protocol):
    """特性开关端口."""

    def is_enabled(self, name: str) -> bool:
        """开关开了吗.

        ⚠️ **不存在的开关一律返回 False** ——
        「未知 = 关闭」比「未知 = 开启」安全。
        """
        ...

    def all_flags(self) -> dict[str, bool]:
        """全部开关（给调试接口用）。"""
        ...


@dataclass
class StaticFeatureFlags(FeatureFlags):
    """静态开关 —— 从配置读。

    ⚠️ **开发/测试用这个** ——
    生产环境应该用能热更新的实现。
    """

    #: 开关状态
    values: dict[str, bool] = field(default_factory=dict)

    def is_enabled(self, name: str) -> bool:
        """开关开了吗."""
        return self.values.get(name, False)

    def all_flags(self) -> dict[str, bool]:
        """全部开关."""
        return dict(self.values)
