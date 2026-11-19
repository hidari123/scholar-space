"""值对象 —— 不可变、可比较、有校验。"""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID


@dataclass(frozen=True, slots=True)
class ExampleId:
    """示例 ID。"""

    value: UUID

    @classmethod
    def generate(cls) -> ExampleId:
        """生成新 ID。"""
        return cls(value=UUID(int=0))

    def __str__(self) -> str:
        """字符串表示。"""
        return str(self.value)
