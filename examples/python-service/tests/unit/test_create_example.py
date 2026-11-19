"""单元测试 —— 领域层与应用层，零 IO。"""

from __future__ import annotations

import pytest

from example_service.application.use_cases.create_example import CreateExample
from example_service.domain.entities import Example
from example_service.domain.errors import ValidationError
from example_service.infrastructure.repositories.in_memory_example_repository import (
    InMemoryExampleRepository,
)


@pytest.fixture
def repository() -> InMemoryExampleRepository:
    return InMemoryExampleRepository()


@pytest.fixture
def use_case(repository: InMemoryExampleRepository) -> CreateExample:
    return CreateExample(repository)


async def test_create_example_success(
    use_case: CreateExample,
    repository: InMemoryExampleRepository,
) -> None:
    """正常创建。"""
    example = await use_case.execute("测试示例")

    assert example.name == "测试示例"
    assert example.example_id == "demo-001"
    assert await repository.get_by_id("demo-001") is not None


async def test_create_example_rejects_empty_name(use_case: CreateExample) -> None:
    """空名应被拒绝 —— 领域规则。"""
    with pytest.raises(ValidationError):
        await use_case.execute("   ")


def test_domain_entity_rejects_blank_name() -> None:
    """领域实体的工厂校验。"""
    with pytest.raises(ValueError, match="name"):
        Example.create(example_id="x", name="  ")
