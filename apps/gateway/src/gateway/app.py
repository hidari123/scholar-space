"""网关应用 —— 聚合各服务 + 路由分发。

⚠️ **网关是「唯一对外入口」** ——
前端只跟网关说话，不直接调各个独立仓的服务。

⚠️ **但网关不合并服务** ——
各服务是独立部署的（独立仓），
网关通过 HTTP 反向代理转发，
**不 import 它们的代码**。

⚠️ **这样各服务才能独立发布** ——
改 PPT 不需要重启社区服务。
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, Response

from gateway.flags import FeatureFlags, StaticFeatureFlags
from gateway.routing import Router, RoutingConfig

__all__ = ["Gateway", "ServiceTarget", "create_app"]


@dataclass(frozen=True, slots=True)
class ServiceTarget:
    """一个后端服务."""

    #: 服务名
    name: str
    #: 基础 URL
    base_url: str


@dataclass
class Gateway:
    """网关.

    ⚠️ **转发用 httpx** ——
    不用它的话要自己处理连接池、重试、超时。
    """

    #: 路由配置
    routing: RoutingConfig = field(default_factory=RoutingConfig)
    #: 特性开关
    flags: FeatureFlags = field(default_factory=StaticFeatureFlags)
    #: 后端服务
    targets: dict[str, ServiceTarget] = field(default_factory=dict)
    #: HTTP 客户端
    client: Any = None

    def router(self) -> Router:
        """造路由器。"""
        return Router(config=self.routing, flags=dict(self.flags.all_flags()))

    def target_for(self, path: str) -> str:
        """路径 → 目标服务名."""
        return self.router().target_for(path)

    def rewrite(self, path: str) -> str:
        """路径重写（没匹配到就原样返回）。"""
        resolved = self.router().resolve(path)
        return resolved[1] if resolved else path

    def base_url_for(self, service: str) -> str | None:
        """服务的基础 URL."""
        target = self.targets.get(service)
        return target.base_url if target else None


def create_app(gateway: Gateway | None = None) -> FastAPI:
    """创建网关应用.

    :param gateway: 网关配置
    :return: 应用实例
    """
    app = FastAPI(
        title="scholarspace-gateway",
        description="scholarspace API 网关 —— 聚合各独立服务",
        version="0.1.0",
    )

    active = gateway or Gateway()

    # ⚠️ **总是设置**（包括 None）——
    # 只在传了值时才设的话，上一个 app 留下的依赖会**泄漏到下一个 app**。
    app.state.gateway = active

    @app.get("/health")
    async def health() -> dict[str, str]:
        """健康检查."""
        return {"status": "ok"}

    @app.get("/__routes")
    async def list_routes() -> dict[str, Any]:
        """列出路由映射（调试用）。

        ⚠️ **只返回映射，不返回开关状态** ——
        开关状态可能包含运营信息。
        """
        return {
            "default_target": active.routing.default_target,
            "rules": [
                {
                    "legacy_path": rule.legacy_path,
                    "target_path": rule.target_path,
                    "target": rule.target,
                    "flag": rule.flag,
                }
                for rule in active.routing.rules
            ],
        }

    @app.get("/__flags")
    async def list_flags() -> dict[str, bool]:
        """列出开关状态（调试用）。"""
        return active.flags.all_flags()

    @app.api_route(
        "/{path:path}",
        methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    )
    async def proxy(path: str, request: Request) -> Response:
        """转发到后端服务.

        ⚠️ **没匹配到路由 → 404** ——
        网关不处理未知的路径，
        让调用方知道「这个接口不存在」。
        """
        full_path = f"/{path}"
        service = active.target_for(full_path)

        base_url = active.base_url_for(service)
        if base_url is None:
            return JSONResponse(
                status_code=404,
                content={
                    "code": 40400,
                    "message": f"没有路由到服务：{full_path}",
                    "request_id": request.headers.get("x-request-id", ""),
                    "timestamp": "",
                },
            )

        rewritten = active.rewrite(full_path)
        url = f"{base_url}{rewritten}"

        # ⚠️ **原样转发请求体** ——
        body = await request.body()

        headers = {
            key: value
            for key, value in request.headers.items()
            if key.lower() not in ("host", "content-length")
        }

        client = active.client
        if client is None:
            return JSONResponse(
                status_code=503,
                content={
                    "code": 50300,
                    "message": "网关没有配置 HTTP 客户端",
                    "request_id": request.headers.get("x-request-id", ""),
                    "timestamp": "",
                },
            )

        response = await client.request(
            request.method,
            url,
            content=body,
            headers=headers,
            params=dict(request.query_params),
        )

        # ⚠️ **原样回传状态码和内容** ——
        # 网关不改业务响应。
        return Response(
            content=response.content,
            status_code=response.status_code,
            media_type=response.headers.get("content-type"),
        )

    return app
