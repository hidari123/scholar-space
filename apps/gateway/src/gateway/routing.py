"""路由映射 —— 旧路径 → 新路径。

⚠️ **切流靠「路径映射 + 特性开关」** ——
前端零改动，后端逐步切。

⚠️ **映射表是数据，不是代码** ——
放在 `config/routing.yaml` 里，
改路由不用改代码、不用重新部署。

⚠️ **通配符支持** —— `/api/v2/paperinsight/*` 要能匹配
`/api/v2/paperinsight/123`。
"""

from __future__ import annotations

from dataclasses import dataclass, field
from fnmatch import fnmatch
from pathlib import Path

#: ⚠️ **一条规则最少几个字段** —— 旧路径 | 新路径 | 目标服务
MIN_RULE_PARTS = 3

#: ⚠️ **特性开关在第几个字段**（0 基）
FLAG_INDEX = 3

__all__ = [
    "RouteRule",
    "Router",
    "RoutingConfig",
    "load_routing_config",
]


@dataclass(frozen=True, slots=True)
class RouteRule:
    """一条路由规则.

    ⚠️ **特性开关为 None 表示「总是走新服务」** ——
    没有开关 = 已经切完了。
    """

    #: 旧路径（可含 `*`）
    legacy_path: str
    #: 新路径（可含 `*`）
    target_path: str
    #: 目标服务名
    target: str
    #: 特性开关名（None = 无条件切换）
    flag: str | None = None

    def matches(self, path: str) -> bool:
        """这个路径命中吗."""
        return fnmatch(path, self.legacy_path)

    def rewrite(self, path: str) -> str:
        """把旧路径改成新路径.

        ⚠️ **通配符部分原样带过去** ——
        `/api/v2/paperinsight/123` → `/api/v1/paper/insight/123`。
        """
        if "*" not in self.legacy_path:
            return self.target_path

        # ⚠️ **取通配符匹配到的那一段** ——
        prefix = self.legacy_path.split("*", 1)[0]
        suffix = path[len(prefix) :] if path.startswith(prefix) else ""

        target_prefix = self.target_path.split("*", 1)[0]
        return f"{target_prefix}{suffix}"


@dataclass(frozen=True, slots=True)
class RoutingConfig:
    """路由配置."""

    #: 规则列表（按顺序匹配，**先匹配到的赢**）
    rules: tuple[RouteRule, ...] = ()
    #: 默认目标（没匹配到任何规则时）
    default_target: str = "legacy"

    def find(self, path: str) -> RouteRule | None:
        """找匹配的规则.

        ⚠️ **按顺序，第一个命中的赢** ——
        具体路径要排在通配符前面。
        """
        for rule in self.rules:
            if rule.matches(path):
                return rule

        return None


@dataclass
class Router:
    """路由器.

    ⚠️ **特性开关是注入的** ——
    路由层不该关心开关存哪儿（数据库？配置中心？）。
    """

    #: 路由配置
    config: RoutingConfig = field(default_factory=RoutingConfig)
    #: 特性开关取值（True = 已切换）
    flags: dict[str, bool] = field(default_factory=dict)

    def resolve(self, path: str) -> tuple[str, str] | None:
        """解析路径.

        :param path: 请求路径
        :return: (目标服务, 新路径)；走旧服务返回 None
        """
        rule = self.config.find(path)

        # ⚠️ **没匹配到 → 走默认（旧的）**
        if rule is None:
            return None

        # ⚠️ **开关没开 → 走旧的** ——
        # 这是「逐步切流」的关键。
        if rule.flag is not None and not self.flags.get(rule.flag, False):
            return None

        return rule.target, rule.rewrite(path)

    def target_for(self, path: str) -> str:
        """目标服务名（不重写路径）。"""
        resolved = self.resolve(path)
        return resolved[0] if resolved else self.config.default_target


def load_routing_config(path: Path | str) -> RoutingConfig:
    """从 YAML 加载路由配置.

    ⚠️ **不引入 PyYAML** ——
    这个文件结构很简单，自己解析更轻。
    真要用 YAML 就加 `pyyaml` 依赖。

    ⚠️ **格式**（每行一条规则）：
    ```
    routes:
      /api/v2/agent/flows | /api/v1/orchestra/flows | orchestra | orchestra.flows
      /api/v2/social/*    | /api/v1/community/* | community |
    ```

    :param path: 配置文件路径
    :return: 路由配置
    """
    config_path = Path(path)
    if not config_path.exists():
        return RoutingConfig()

    rules: list[RouteRule] = []
    default_target = "legacy"
    in_routes = False

    for raw_line in config_path.read_text(encoding="utf-8").split("\n"):
        line = raw_line.strip()

        if not line or line.startswith("#"):
            continue

        if line.startswith("default_target:"):
            default_target = line.split(":", 1)[1].strip()
            continue

        if line.startswith("routes:"):
            in_routes = True
            continue

        if not in_routes:
            continue

        # ⚠️ **管道分隔** —— 比 YAML 的嵌套列表好读
        parts = [part.strip() for part in line.split("|")]
        if len(parts) < MIN_RULE_PARTS:
            continue

        rules.append(
            RouteRule(
                legacy_path=parts[0] or "",
                target_path=parts[1] or "",
                target=parts[2] or "",
                flag=parts[FLAG_INDEX] if len(parts) > FLAG_INDEX and parts[FLAG_INDEX] else None,
            )
        )

    return RoutingConfig(rules=tuple(rules), default_target=default_target)
