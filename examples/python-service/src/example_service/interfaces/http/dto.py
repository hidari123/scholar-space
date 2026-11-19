"""HTTP 接口层 —— 只做「校验 → 调用例 → 映射响应」。

⚠️ 不含业务逻辑（G4 护栏：interfaces 不依赖 infrastructure）。
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class ExampleCreateReq(BaseModel):
    """创建请求。"""

    name: str = Field(..., min_length=1, max_length=128, description="示例名称")


class ExampleResp(BaseModel):
    """示例响应。"""

    example_id: str
    name: str
    tags: list[str]


def to_resp(example: object) -> ExampleResp:
    """领域实体 → 响应 DTO。

    单独抽出映射函数，避免接口层碰领域实现细节。
    """
    return ExampleResp(
        example_id=example.example_id,  # type: ignore[attr-defined]
        name=example.name,  # type: ignore[attr-defined]
        tags=list(example.tags),  # type: ignore[attr-defined]
    )
