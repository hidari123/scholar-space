"""应用入口 —— 组装（create_app）。

组装根：在这里把 infrastructure 的实现注入 application 的端口。
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from example_service.domain.errors import AppError
from example_service.infrastructure.repositories.in_memory_example_repository import (
    InMemoryExampleRepository,
)
from example_service.interfaces.http.router import get_repository, router as example_router


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """生命周期 —— 启动/关闭时的资源准备。"""
    yield


def create_app() -> FastAPI:
    """应用工厂。"""
    app = FastAPI(
        title="Example Service",
        description="示例子项目 —— 验证 conventions extends 生效",
        version="0.1.0",
        lifespan=lifespan,
    )

    # ── 组装：把 infrastructure 的实现注入 interfaces 的端口依赖 ──
    # 这是唯一允许 interfaces ↔ infrastructure 接触的地方（在组装根）
    app.dependency_overrides[get_repository] = InMemoryExampleRepository

    app.include_router(example_router)

    @app.exception_handler(AppError)
    async def handle_app_error(request: Request, exc: AppError) -> JSONResponse:
        """全局异常处理 —— 替代每处 try/except。"""
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "code": exc.code,
                "message": exc.message,
                "data": exc.details or None,
                "request_id": request.headers.get("x-request-id", ""),
                "timestamp": "",
            },
        )

    @app.get("/health")
    async def health() -> dict[str, str]:
        """健康检查。"""
        return {"status": "ok"}

    return app


app = create_app()
