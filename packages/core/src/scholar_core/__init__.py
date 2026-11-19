"""scholarspace-core —— 共享 Python 底座。

⚠️ 公开 API 只从这里导出。禁止 `from scholar_core.domain.errors import ...`。
   （表面积最小原则，见 docs/05-代码规范.md）

⚠️ `__all__` 必须严格按字母序（RUF022），**不能加分组注释** ——
   注释不参与排序，ruff 会把注释挪到错误位置，分组反而误导人。
   分组说明放在本 docstring 里。
"""

from scholar_core.application.ports.storage import ObjectInfo, StoragePort
from scholar_core.domain.errors import (
    HTTP_STATUS_BY_CODE,
    AppError,
    AuthenticationError,
    BusinessRuleError,
    ConflictError,
    ErrorCode,
    InsufficientBalanceError,
    InternalError,
    NotFoundError,
    PermissionDeniedError,
    RateLimitError,
    ServiceUnavailableError,
    UpstreamError,
    ValidationError,
)
from scholar_core.infrastructure.config.settings import (
    AuthSettings,
    CoreSettings,
    DatabaseSettings,
    Environment,
    LLMSettings,
    RedisSettings,
    StorageSettings,
    current_environment,
    get_settings,
    reload_settings,
)
from scholar_core.infrastructure.logging import bind_request_id, configure_logging, get_logger
from scholar_core.infrastructure.storage.in_memory import InMemoryStorage

__version__ = "0.1.0"

__all__ = [
    "HTTP_STATUS_BY_CODE",
    "AppError",
    "AuthSettings",
    "AuthenticationError",
    "BusinessRuleError",
    "ConflictError",
    "CoreSettings",
    "DatabaseSettings",
    "Environment",
    "ErrorCode",
    "InMemoryStorage",
    "InsufficientBalanceError",
    "InternalError",
    "LLMSettings",
    "NotFoundError",
    "ObjectInfo",
    "PermissionDeniedError",
    "RateLimitError",
    "RedisSettings",
    "ServiceUnavailableError",
    "StoragePort",
    "StorageSettings",
    "UpstreamError",
    "ValidationError",
    "__version__",
    "bind_request_id",
    "configure_logging",
    "current_environment",
    "get_logger",
    "get_settings",
    "reload_settings",
]
