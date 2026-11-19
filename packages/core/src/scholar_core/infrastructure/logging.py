"""结构化日志 —— 全部后端子项目共用。

用 structlog：开发期输出彩色可读格式，生产期输出 JSON。

⚠️ 不打印密钥。`SecretStr` 类型在渲染时自动脱敏。
"""

from __future__ import annotations

import logging
import sys
from typing import Any

import structlog

__all__ = ["bind_request_id", "configure_logging", "get_logger"]


def configure_logging(
    *,
    service_name: str = "scholarspace",
    level: str = "INFO",
    json_format: bool = True,
) -> None:
    """配置日志系统。

    Args:
        service_name: 服务名（作为日志字段注入）
        level: 日志级别
        json_format: True=JSON（生产）/ False=彩色可读（开发）
    """
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=level.upper(),
        force=True,
    )

    # 第三方库的噪音日志降级
    for noisy in ("httpx", "httpcore", "urllib3", "asyncio", "sqlalchemy.engine"):
        logging.getLogger(noisy).setLevel(logging.WARNING)

    processors: list[Any] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.UnicodeDecoder(),
    ]

    if json_format:
        processors.append(structlog.processors.format_exc_info)
        processors.append(structlog.processors.JSONRenderer(ensure_ascii=False))
    else:
        processors.append(structlog.dev.ConsoleRenderer(colors=True))

    structlog.configure(
        processors=processors,
        wrapper_class=structlog.make_filtering_bound_logger(
            logging.getLevelName(level.upper()),
        ),
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )

    # 让 structlog 的日志也带上 service_name
    structlog.contextvars.bind_contextvars(service=service_name)


def get_logger(name: str | None = None) -> structlog.stdlib.BoundLogger:
    """取 logger。

    Args:
        name: logger 名（通常是 `__name__`）
    """
    return structlog.get_logger(name)  # type: ignore[no-any-return]


def bind_request_id(request_id: str) -> None:
    """把 request_id 绑到当前上下文（后续日志自动带上）。"""
    structlog.contextvars.bind_contextvars(request_id=request_id)
