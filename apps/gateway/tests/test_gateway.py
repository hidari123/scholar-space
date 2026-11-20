"""网关测试。

⚠️ **重点验证「切流语义」**：
    · 开关关 → 走旧服务
    · 开关开 → 走新服务
    · 路径重写正确
    · 通配符
"""

from __future__ import annotations

from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from gateway.app import Gateway, ServiceTarget, create_app
from gateway.flags import StaticFeatureFlags
from gateway.routing import Router, RouteRule, RoutingConfig, load_routing_config


@pytest.fixture
def routing() -> RoutingConfig:
    """路由配置."""
    return RoutingConfig(
        rules=(
            RouteRule(
                legacy_path="/api/v2/agent/flows",
                target_path="/api/v1/orchestra/flows",
                target="orchestra",
                flag="orchestra.flows",
            ),
            RouteRule(
                legacy_path="/api/v2/social/statuses",
                target_path="/api/v1/community/statuses",
                target="community",
                flag="community.statuses",
            ),
            RouteRule(
                legacy_path="/api/v2/paperinsight/*",
                target_path="/api/v1/papers/insight/*",
                target="paper",
                flag="paper.insight",
            ),
            RouteRule(
                legacy_path="/api/v2/payment/alipay/callback",
                target_path="/api/v1/billing/alipay/callback",
                target="billing",
                flag=None,
            ),
        )
    )


class TestRouteRule:
    """路由规则."""

    def test_matches_exact(self) -> None:
        """精确匹配."""
        rule = RouteRule("/a/b", "/c/d", "svc")

        assert rule.matches("/a/b")
        assert not rule.matches("/a/b/c")

    def test_matches_wildcard(self) -> None:
        """通配符匹配."""
        rule = RouteRule("/api/v2/paperinsight/*", "/api/v1/papers/insight/*", "paper")

        assert rule.matches("/api/v2/paperinsight/123")

    def test_rewrite_exact(self) -> None:
        """精确重写."""
        rule = RouteRule("/a/b", "/c/d", "svc")

        assert rule.rewrite("/a/b") == "/c/d"

    def test_rewrite_wildcard(self) -> None:
        """⚠️ **通配符部分原样带过去**。"""
        rule = RouteRule("/api/v2/paperinsight/*", "/api/v1/papers/insight/*", "paper")

        assert rule.rewrite("/api/v2/paperinsight/123") == "/api/v1/papers/insight/123"


class TestRouter:
    """路由器."""

    def test_flag_off_keeps_legacy(self, routing: RoutingConfig) -> None:
        """⚠️ **开关关 → 走旧服务** —— 这是「逐步切流」的关键。"""
        router = Router(config=routing, flags={})

        assert router.resolve("/api/v2/agent/flows") is None

    def test_flag_on_switches(self, routing: RoutingConfig) -> None:
        """开关开 → 走新服务。"""
        router = Router(config=routing, flags={"orchestra.flows": True})

        resolved = router.resolve("/api/v2/agent/flows")

        assert resolved is not None
        assert resolved[0] == "orchestra"
        assert resolved[1] == "/api/v1/orchestra/flows"

    def test_no_flag_always_switches(self, routing: RoutingConfig) -> None:
        """⚠️ **没有开关 = 无条件切换**。"""
        router = Router(config=routing, flags={})

        resolved = router.resolve("/api/v2/payment/alipay/callback")

        assert resolved is not None
        assert resolved[0] == "billing"

    def test_unknown_flag_is_off(self, routing: RoutingConfig) -> None:
        """不存在的开关 = 关闭。

        ⚠️ 「未知 = 关闭」比「未知 = 开启」安全。
        """
        router = Router(config=routing, flags={"community.statuses": True})

        # ⚠️ community.statuses 是开的，但 paper.insight 没设置
        assert router.resolve("/api/v2/paperinsight/1") is None

    def test_unmatched_path_is_legacy(self, routing: RoutingConfig) -> None:
        """没匹配到 → 走旧的。"""
        router = Router(config=routing, flags={})

        assert router.resolve("/api/v2/unknown") is None
        assert router.target_for("/api/v2/unknown") == "legacy"


class TestLoadRoutingConfig:
    """加载配置."""

    def test_loads_rules(self, tmp_path: Path) -> None:
        """⚠️ **映射表是数据不是代码**。"""
        config_file = tmp_path / "routing.yaml"
        config_file.write_text(
            "\n".join(
                [
                    "# 注释",
                    "default_target: legacy",
                    "",
                    "routes:",
                    "  /api/v2/a | /api/v1/a | svc_a | flag.a",
                    "  /api/v2/b | /api/v1/b | svc_b |",
                ]
            ),
            encoding="utf-8",
        )

        config = load_routing_config(config_file)

        assert config.default_target == "legacy"
        assert len(config.rules) == 2
        assert config.rules[0].flag == "flag.a"
        assert config.rules[1].flag is None

    def test_missing_file_returns_empty(self, tmp_path: Path) -> None:
        """文件不存在 → 空配置（不崩）。"""
        config = load_routing_config(tmp_path / "ghost.yaml")

        assert config.rules == ()
        assert config.default_target == "legacy"

    def test_real_config_file_parses(self) -> None:
        """⚠️ **真实的配置文件要能解析** —— 护栏级的检查。"""
        config_path = Path(__file__).parent.parent / "config" / "routing.yaml"

        config = load_routing_config(config_path)

        assert len(config.rules) > 0
        # ⚠️ 每条规则都要有旧路径、新路径、目标服务
        for rule in config.rules:
            assert rule.legacy_path.startswith("/")
            assert rule.target_path.startswith("/")
            assert rule.target


class TestGatewayApp:
    """网关应用."""

    def test_health(self) -> None:
        """健康检查."""
        with TestClient(create_app()) as client:
            response = client.get("/health")

        assert response.status_code == 200
        assert response.json() == {"status": "ok"}

    def test_lists_routes(self, routing: RoutingConfig) -> None:
        """⚠️ **路由映射要能查** —— 调试切流问题用。"""
        gateway = Gateway(routing=routing)
        app = create_app(gateway)

        with TestClient(app) as client:
            response = client.get("/__routes")

        body = response.json()
        assert body["default_target"] == "legacy"
        assert len(body["rules"]) == 4

    def test_lists_flags(self) -> None:
        """开关状态要能查。"""
        gateway = Gateway(flags=StaticFeatureFlags(values={"orchestra.flows": True}))
        app = create_app(gateway)

        with TestClient(app) as client:
            response = client.get("/__flags")

        assert response.json() == {"orchestra.flows": True}

    def test_unrouted_path_returns_404(self, routing: RoutingConfig) -> None:
        """没匹配到路由 → 404。

        ⚠️ 网关不处理未知路径。
        """
        gateway = Gateway(routing=routing)
        app = create_app(gateway)

        with TestClient(app) as client:
            response = client.get("/api/v2/unknown")

        assert response.status_code == 404
        assert response.json()["code"] == 40400

    def test_no_client_returns_503(self, routing: RoutingConfig) -> None:
        """⚠️ **没配 HTTP 客户端 → 503** —— 不是 500。"""
        gateway = Gateway(
            routing=routing,
            flags=StaticFeatureFlags(values={"orchestra.flows": True}),
            targets={"orchestra": ServiceTarget("orchestra", "http://svc")},
        )
        app = create_app(gateway)

        with TestClient(app) as client:
            response = client.get("/api/v2/agent/flows")

        assert response.status_code == 503
        assert response.json()["code"] == 50300

    def test_proxies_to_target(self, routing: RoutingConfig) -> None:
        """⚠️ **转发到后端** —— 并重写路径。"""
        captured: dict[str, str] = {}

        def handler(request: httpx.Request) -> httpx.Response:
            captured["url"] = str(request.url)
            captured["method"] = request.method
            return httpx.Response(200, json={"ok": True})

        client = httpx.AsyncClient(transport=httpx.MockTransport(handler))

        gateway = Gateway(
            routing=routing,
            flags=StaticFeatureFlags(values={"orchestra.flows": True}),
            targets={"orchestra": ServiceTarget("orchestra", "http://svc")},
            client=client,
        )
        app = create_app(gateway)

        with TestClient(app) as test_client:
            response = test_client.get("/api/v2/agent/flows")

        assert response.status_code == 200
        assert response.json() == {"ok": True}
        # ⚠️ **路径被重写了**
        assert captured["url"] == "http://svc/api/v1/orchestra/flows"
