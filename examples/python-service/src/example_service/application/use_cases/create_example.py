"""用例 —— 业务编排。

用例只依赖 domain 与 ports，不碰 infrastructure。
"""

from __future__ import annotations

from example_service.application.ports.repositories import ExampleRepositoryPort
from example_service.domain.entities import Example
from example_service.domain.errors import ValidationError


class CreateExample:
    """创建示例用例。"""

    def __init__(self, repository: ExampleRepositoryPort) -> None:
        self._repository = repository

    async def execute(self, name: str) -> Example:
        """执行创建。"""
        if not name or not name.strip():
            raise ValidationError("name 不能为空", field="name")

        example = Example.create(example_id="demo-001", name=name)
        return await self._repository.save(example)
