"""领域实体 —— 纯领域模型，零外部依赖。

⚠️ 本层禁止 import fastapi / sqlalchemy / requests 等（G2 护栏强制）。
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime


@dataclass(frozen=True, slots=True)
class Example:
    """示例实体。

    用 frozen dataclass 而非 Pydantic —— 领域模型不应依赖边界校验库。
    """

    example_id: str
    name: str
    created_at: datetime
    tags: tuple[str, ...] = field(default_factory=tuple)

    @classmethod
    def create(cls, example_id: str, name: str) -> Example:
        """工厂方法 —— 领域规则收在此处。"""
        if not name.strip():
            raise ValueError("name 不能为空")
        return cls(
            example_id=example_id,
            name=name.strip(),
            created_at=datetime.now(UTC),
        )
