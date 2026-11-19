"""端口（Port）—— 依赖倒置的抽象边界。

application 只依赖 Protocol，具体实现由 infrastructure 提供。
"""

from __future__ import annotations

from typing import Protocol

from example_service.domain.entities import Example


class ExampleRepositoryPort(Protocol):
    """示例仓储端口。"""

    async def save(self, example: Example) -> Example: ...

    async def get_by_id(self, example_id: str) -> Example | None: ...

    async def list_all(self) -> list[Example]: ...
