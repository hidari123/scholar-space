"""基础设施 —— 实现 application 定义的端口。

本示例用内存实现（无 DB 依赖），验证分层是否真的解耦。
"""

from __future__ import annotations

from example_service.domain.entities import Example


class InMemoryExampleRepository:
    """内存仓储 —— 实现 ExampleRepositoryPort。"""

    def __init__(self) -> None:
        self._items: dict[str, Example] = {}

    async def save(self, example: Example) -> Example:
        """保存示例。"""
        self._items[example.example_id] = example
        return example

    async def get_by_id(self, example_id: str) -> Example | None:
        """按 ID 查询。"""
        return self._items.get(example_id)

    async def list_all(self) -> list[Example]:
        """列出全部。"""
        return list(self._items.values())
