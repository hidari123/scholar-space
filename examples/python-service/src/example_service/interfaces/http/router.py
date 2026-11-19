"""HTTP 路由 —— 薄层。

⚠️ 不含业务逻辑，且不 import infrastructure（G4 护栏）。
   依赖注入通过 FastAPI 的 dependency_overrides 在组装层完成。
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from example_service.application.ports.repositories import ExampleRepositoryPort
from example_service.application.use_cases.create_example import CreateExample
from example_service.interfaces.http.dto import ExampleCreateReq, ExampleResp, to_resp

router = APIRouter(prefix="/api/v1/examples", tags=["example"])


def get_repository() -> ExampleRepositoryPort:
    """依赖提供者。

    ⚠️ 这里返回的是**端口类型**，不是具体实现。
       具体实现由 main.py 通过 dependency_overrides 注入。
    """
    raise NotImplementedError("由 main.py 通过 dependency_overrides 注入")


@router.post("", response_model=ExampleResp)
async def create_example(
    body: ExampleCreateReq,
    repository: ExampleRepositoryPort = Depends(get_repository),
) -> ExampleResp:
    """创建示例。"""
    use_case = CreateExample(repository)
    example = await use_case.execute(body.name)
    return to_resp(example)
