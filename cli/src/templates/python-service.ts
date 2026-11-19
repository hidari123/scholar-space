/**
 * `python-service` 模板 —— 四层 FastAPI 服务。
 *
 * ⚠️ 结构与 examples/python-service **完全一致** ——
 *    那份是 Step 0.3 实测验证过的形状。
 */

import type { Template } from '../templates';

export const pythonServiceTemplate: Template = {
  id: 'python-service',
  name: 'Python Service',
  description: '四层 FastAPI 服务（domain / application / infrastructure / interfaces）',
  language: 'python',
  verifyCommands: [
    'uv venv --python 3.13',
    'uv pip install -e ".[dev]" --no-deps',
    'uv pip install pydantic pydantic-settings structlog fastapi pytest pytest-asyncio ruff mypy import-linter',
    '.venv/Scripts/ruff.exe check src/ tests/',
    '.venv/Scripts/ruff.exe format --check src/ tests/',
    '.venv/Scripts/mypy.exe src/',
    '.venv/Scripts/import-linter.exe lint',
    '.venv/Scripts/python.exe -m pytest tests/ -q',
  ],

  files: [
    {
      path: 'pyproject.toml',
      content: `[project]
name = "{{packageName}}"
version = "0.1.0"
description = "{{description}}"
readme = "README.md"
requires-python = ">={{pythonVersion}}"
license = { text = "Proprietary" }

dependencies = [
    "pydantic>=2.9",
    "pydantic-settings>=2.6",
    "structlog>=24.4",
    "scholarspace-core>=0.1,<0.2",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.3",
    "pytest-asyncio>=0.24",
    "pytest-cov>=6.0",
    "ruff>=0.9",
    "mypy>=1.14",
    "import-linter>=2.3",
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/{{packageName}}"]

[tool.ruff]
extend = "./ruff.toml"

[tool.pytest.ini_options]
testpaths = ["tests"]
python_files = "test_*.py"
asyncio_mode = "auto"
asyncio_default_fixture_loop_scope = "function"
asyncio_default_test_loop_scope = "function"
addopts = "-ra --strict-markers --tb=short"
`,
    },

    {
      path: 'setup.cfg',
      content: `[importlinter]
root_package = {{packageName}}
include_external_packages = True

[importlinter:contract:1]
name = G1 layers: interfaces -> infrastructure -> application -> domain
type = layers
layers =
    {{packageName}}.interfaces
    {{packageName}}.infrastructure
    {{packageName}}.application
    {{packageName}}.domain

[importlinter:contract:2]
name = G2 domain layer has zero external dependencies
type = forbidden
source_modules =
    {{packageName}}.domain
forbidden_modules =
    fastapi
    starlette
    flask
    sqlalchemy
    alembic
    requests
    httpx
    aiohttp
    redis
    minio
    boto3
    celery
    arq
    pydantic_settings
    dotenv

[importlinter:contract:3]
name = G3 application does not depend on infrastructure
type = forbidden
source_modules =
    {{packageName}}.application
forbidden_modules =
    {{packageName}}.infrastructure

[importlinter:contract:4]
name = G4 interfaces does not depend on infrastructure
type = forbidden
source_modules =
    {{packageName}}.interfaces
forbidden_modules =
    {{packageName}}.infrastructure

[importlinter:contract:5]
name = G5 domain does not depend on application
type = forbidden
source_modules =
    {{packageName}}.domain
forbidden_modules =
    {{packageName}}.application
    {{packageName}}.infrastructure
    {{packageName}}.interfaces
`,
    },

    {
      path: 'src/{{packageName}}/__init__.py',
      content: `"""{{name}} —— scholarspace 子项目。"""

__version__ = "0.1.0"

__all__ = ["__version__"]
`,
    },

    {
      path: 'src/{{packageName}}/py.typed',
      content: '',
    },

    {
      path: 'src/{{packageName}}/domain/__init__.py',
      content: '',
    },

    {
      path: 'src/{{packageName}}/domain/errors.py',
      content: `"""领域异常。

⚠️ 继承 scholarspace-core 的 AppError —— 全平台统一错误码与响应信封。
"""

from __future__ import annotations

from scholar_core import AppError, ErrorCode

__all__ = ["ExampleError"]


class ExampleError(AppError):
    """{{name}} 业务异常。"""

    code = ErrorCode.BUSINESS_RULE
`,
    },

    {
      path: 'src/{{packageName}}/application/__init__.py',
      content: '',
    },

    {
      path: 'src/{{packageName}}/application/ports/__init__.py',
      content: '',
    },

    {
      path: 'src/{{packageName}}/application/ports/repositories.py',
      content: `"""端口定义 —— 只定义抽象，不含实现。

⚠️ 依赖倒置：application 只依赖 Protocol，
   infrastructure 提供实现，组装根注入。
"""

from __future__ import annotations

from typing import Protocol

__all__ = ["ExampleRepositoryPort"]


class ExampleRepositoryPort(Protocol):
    """示例仓储端口。"""

    async def save(self, example: str) -> str:
        """保存并返回 ID。"""
        ...
`,
    },

    {
      path: 'src/{{packageName}}/infrastructure/__init__.py',
      content: '',
    },

    {
      path: 'src/{{packageName}}/infrastructure/repositories/__init__.py',
      content: '',
    },

    {
      path: 'src/{{packageName}}/infrastructure/repositories/in_memory_example_repository.py',
      content: `"""内存仓储 —— 测试与本地开发用。"""

from __future__ import annotations

from uuid import uuid4

__all__ = ["InMemoryExampleRepository"]


class InMemoryExampleRepository:
    """内存实现。"""

    def __init__(self) -> None:
        """初始化。"""
        self._items: dict[str, str] = {}

    async def save(self, example: str) -> str:
        """保存并返回 ID。"""
        example_id = str(uuid4())
        self._items[example_id] = example
        return example_id
`,
    },

    {
      path: 'src/{{packageName}}/interfaces/__init__.py',
      content: '',
    },

    {
      path: 'src/{{packageName}}/interfaces/http/__init__.py',
      content: '',
    },

    {
      path: 'src/{{packageName}}/interfaces/http/router.py',
      content: `"""HTTP 路由 —— 薄层。

⚠️ 不含业务逻辑，且不 import infrastructure（G4 护栏）。
   依赖注入通过 main.py 的 dependency_overrides 完成。
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from {{packageName}}.application.ports.repositories import ExampleRepositoryPort

router = APIRouter(prefix="/api/v1/examples", tags=["example"])


def get_repository() -> ExampleRepositoryPort:
    """依赖提供者。

    ⚠️ 返回的是**端口类型**，不是具体实现。
       实现由 main.py 通过 dependency_overrides 注入。
    """
    raise NotImplementedError("由 main.py 通过 dependency_overrides 注入")


@router.get("")
async def list_examples(
    repository: ExampleRepositoryPort = Depends(get_repository),
) -> dict[str, str]:
    """列出示例。"""
    return {"status": "ok"}
`,
    },

    {
      path: 'src/{{packageName}}/main.py',
      content: `"""应用入口 —— 组装根。

⚠️ 唯一允许 interfaces ↔ infrastructure 接触的地方。
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from {{packageName}}.infrastructure.repositories.in_memory_example_repository import (
    InMemoryExampleRepository,
)
from {{packageName}}.interfaces.http.router import get_repository, router as example_router


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """生命周期。"""
    yield


def create_app() -> FastAPI:
    """应用工厂。"""
    app = FastAPI(title="{{name}}", version="0.1.0", lifespan=lifespan)

    # 组装：把 infrastructure 的实现注入 interfaces 的端口依赖
    app.dependency_overrides[get_repository] = InMemoryExampleRepository

    app.include_router(example_router)

    @app.get("/health")
    async def health() -> dict[str, str]:
        """健康检查。"""
        return {"status": "ok"}

    return app


app = create_app()
`,
    },

    {
      path: 'tests/unit/test_example.py',
      content: `"""单元测试。

⚠️ 测试函数名用英文 snake_case（ruff N802/PLC2401 禁止非 ASCII 函数名）。
"""

from __future__ import annotations

from scholar_core import AppError

from {{packageName}}.domain.errors import ExampleError
from {{packageName}}.infrastructure.repositories.in_memory_example_repository import (
    InMemoryExampleRepository,
)


class TestInMemoryExampleRepository:
    """内存仓储。"""

    async def test_save_returns_id(self) -> None:
        """保存返回 ID。"""
        repository = InMemoryExampleRepository()
        example_id = await repository.save("hello")
        assert example_id


class TestExampleError:
    """领域异常。"""

    def test_is_app_error(self) -> None:
        """继承统一异常基类。"""
        assert issubclass(ExampleError, AppError)
`,
    },

    {
      path: '.env.example',
      content: `# {{name}} 环境变量
#
# ⚠️ 复制为 .env 后填入真实值。.env 不要提交。

SCHOLAR_ENV=local
SCHOLAR_SERVICE_NAME={{name}}
SCHOLAR_LOG_FORMAT=console

# 数据库
SCHOLAR_DB__HOST=localhost
SCHOLAR_DB__PORT=5432
SCHOLAR_DB__USER=scholar
SCHOLAR_DB__PASSWORD=
SCHOLAR_DB__DATABASE={{packageName}}

# Redis
SCHOLAR_REDIS__HOST=localhost
SCHOLAR_REDIS__PORT=6379
`,
    },

    {
      path: '.gitignore',
      content: `.venv/
__pycache__/
*.py[cod]
.pytest_cache/
.mypy_cache/
.ruff_cache/
.coverage
htmlcov/
dist/
build/
*.egg-info/
.env
`,
    },

    {
      path: 'README.md',
      content: `# {{name}}

> {{description}}

---

## 快速开始

\`\`\`bash
uv venv --python {{pythonVersion}}
uv pip install -e ".[dev]" --no-deps
uv pip install pydantic pydantic-settings structlog fastapi pytest pytest-asyncio ruff mypy import-linter

.venv/Scripts/ruff.exe check src/ tests/
.venv/Scripts/mypy.exe src/
.venv/Scripts/import-linter.exe lint
.venv/Scripts/python.exe -m pytest tests/ -q
\`\`\`

---

## 架构

四层结构 —— 由 \`setup.cfg\` 的 import-linter 契约强制：

\`\`\`
interfaces/     薄 HTTP 层
infrastructure/ 实现 ports
application/    用例编排 + ports
domain/         纯领域，零外部依赖
\`\`\`

**规范基座**：\`ruff.toml\` 与 \`mypy.ini\` 是从主仓复制来的本地副本
（见 \`SYNC.md\`）。更新方式：\`npx @scholarspace/cli sync --kind python\`。
`,
    },
  ],
};
