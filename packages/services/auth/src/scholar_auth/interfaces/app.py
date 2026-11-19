"""FastAPI 应用工厂。

⚠️ 用**工厂函数**而不是模块级 app 实例 ——
   测试时可以建多个隔离的实例，依赖覆盖互不干扰。
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI

from scholar_auth.interfaces.routers import admin

__all__ = ["create_app"]


@asynccontextmanager
async def _lifespan(app: FastAPI) -> AsyncIterator[None]:
    """生命周期钩子。

    ⚠️ 生产环境在这里初始化数据库连接池、检查配置。

    Args:
        app: 应用实例（目前不用，但 FastAPI 要求这个签名）
    """
    del app  # ⚠️ 显式标记未使用 —— 避免 ARG001 告警
    yield


def create_app(**kwargs: Any) -> FastAPI:
    """创建 FastAPI 应用。

    Args:
        kwargs: 传给 FastAPI 构造函数的参数

    Returns:
        应用实例
    """
    app = FastAPI(
        title="scholarspace-auth",
        description="scholarspace 鉴权与管理员服务",
        version="0.1.0",
        lifespan=_lifespan,
        **kwargs,
    )

    app.include_router(admin.router)

    @app.get("/health")
    async def health() -> dict[str, str]:
        """健康检查。"""
        return {"status": "ok"}

    return app
