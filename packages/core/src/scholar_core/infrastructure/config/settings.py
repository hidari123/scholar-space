"""配置 —— 所有后端子项目共用。

⚠️ 位于 **infrastructure** 层而非 domain 层：
   配置必须读环境变量（pydantic_settings），而 domain 层禁止任何外部依赖（G2 护栏）。
   业务代码通过 `scholar_core.get_settings()` 使用，不需要知道它在哪一层。

设计要点：
1. **12-Factor**：全部配置来自环境变量，不读配置文件里的密钥
2. **嵌套分组**：用 `env_nested_delimiter` 做 `SCHOLAR_DB__HOST` 这类结构
3. **类型安全**：pydantic-settings 启动即校验，配置错了立刻崩，不等到请求时
4. **不硬编码环境分支**：杜绝旧系统 `if RUN_ENV == 'xxx'` 那种写法
"""

from __future__ import annotations

import os
from functools import lru_cache
from typing import Any, Literal

from pydantic import AliasChoices, Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

__all__ = [
    "AuthSettings",
    "CoreSettings",
    "DatabaseSettings",
    "Environment",
    "LLMSettings",
    "RedisSettings",
    "StorageSettings",
    "get_settings",
    "reload_settings",
]

Environment = Literal["local", "dev", "staging", "prod"]


class DatabaseSettings(BaseSettings):
    """数据库配置。"""

    model_config = SettingsConfigDict(env_prefix="SCHOLAR_DB__", env_nested_delimiter="__")

    host: str = "localhost"
    port: int = 5432
    user: str = "scholar"
    password: SecretStr = SecretStr("")
    database: str = "scholarspace"
    pool_size: int = 10
    max_overflow: int = 20
    pool_timeout: float = 30.0
    echo: bool = False

    @field_validator("host")
    @classmethod
    def _validate_host(cls, value: str) -> str:
        """主机名不能为空。"""
        if not value.strip():
            raise ValueError("database host 不能为空")
        return value.strip()

    @property
    def async_url(self) -> str:
        """异步连接串（asyncpg）。"""
        password = self.password.get_secret_value()
        return (
            f"postgresql+asyncpg://{self.user}:{password}@{self.host}:{self.port}/{self.database}"
        )


class RedisSettings(BaseSettings):
    """Redis 配置。"""

    model_config = SettingsConfigDict(env_prefix="SCHOLAR_REDIS__", env_nested_delimiter="__")

    host: str = "localhost"
    port: int = 6379
    password: SecretStr = SecretStr("")
    db: int = 0
    url: str | None = None

    @property
    def dsn(self) -> str:
        """连接串。显式 url 优先。"""
        if self.url:
            return self.url
        password = self.password.get_secret_value()
        auth = f":{password}@" if password else ""
        return f"redis://{auth}{self.host}:{self.port}/{self.db}"


class StorageSettings(BaseSettings):
    """对象存储配置。"""

    model_config = SettingsConfigDict(env_prefix="SCHOLAR_STORAGE__", env_nested_delimiter="__")

    backend: Literal["local", "minio", "s3"] = "local"
    endpoint: str = "localhost:9000"
    access_key: str = ""
    secret_key: SecretStr = SecretStr("")
    bucket: str = "scholarspace"
    region: str = "us-east-1"
    local_root: str = "./.data/storage"
    use_ssl: bool = False


class LLMSettings(BaseSettings):
    """模型网关配置。

    ⚠️ 只放**通用**配置；具体模型清单在 `llm` 子项目里。
    """

    model_config = SettingsConfigDict(env_prefix="SCHOLAR_LLM__", env_nested_delimiter="__")

    base_url: str = ""
    api_key: SecretStr = SecretStr("")
    default_model: str = ""
    timeout: float = 60.0
    max_retries: int = 2


class AuthSettings(BaseSettings):
    """认证配置。"""

    model_config = SettingsConfigDict(env_prefix="SCHOLAR_AUTH__", env_nested_delimiter="__")

    jwt_secret: SecretStr = SecretStr("")
    jwt_algorithm: str = "HS256"
    access_token_ttl: int = 3600
    refresh_token_ttl: int = 604800
    allowed_origins: list[str] = Field(default_factory=list)

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def _parse_origins(cls, value: Any) -> Any:
        """允许用逗号分隔的字符串。"""
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value


class CoreSettings(BaseSettings):
    """平台通用配置。"""

    model_config = SettingsConfigDict(
        env_prefix="SCHOLAR_",
        env_file=".env",
        env_file_encoding="utf-8",
        env_nested_delimiter="__",
        extra="ignore",
    )

    #: 运行环境。⚠️ 不用它做分支判断，只用于日志与监控标签。
    #:
    #: ⚠️ 用 AliasChoices 而非单一 validation_alias：
    #:    单一 alias 会让 `CoreSettings(environment="prod")` 这个构造入参失效
    #:    （pydantic-settings 只认 alias，不再认字段名）。
    #:    AliasChoices 让两种写法都能用：
    #:      · 环境变量  SCHOLAR_ENV=prod
    #:      · 构造入参 CoreSettings(environment="prod")
    environment: Environment = Field(
        default="local",
        validation_alias=AliasChoices("SCHOLAR_ENV", "environment"),
    )

    service_name: str = "scholarspace"
    debug: bool = False
    log_level: str = "INFO"
    log_format: Literal["json", "console"] = "json"
    timezone: str = "UTC"

    #: 统一响应里是否带 request_id
    enable_request_id: bool = True

    #: 服务发现（可选）
    api_gateway_url: str = ""

    db: DatabaseSettings = Field(default_factory=DatabaseSettings)
    redis: RedisSettings = Field(default_factory=RedisSettings)
    storage: StorageSettings = Field(default_factory=StorageSettings)
    llm: LLMSettings = Field(default_factory=LLMSettings)
    auth: AuthSettings = Field(default_factory=AuthSettings)

    @property
    def is_production(self) -> bool:
        """是否生产环境。"""
        return self.environment == "prod"

    @property
    def log_json(self) -> bool:
        """是否输出 JSON 日志。"""
        return self.log_format == "json"


@lru_cache(maxsize=1)
def get_settings() -> CoreSettings:
    """获取配置（单例）。

    ⚠️ 首次调用会校验全部配置；配置非法 → 启动即失败（这是有意的）。
    """
    return CoreSettings()


def reload_settings() -> CoreSettings:
    """重新加载配置（测试用）。"""
    get_settings.cache_clear()
    return get_settings()


def current_environment() -> Environment:
    """当前环境名。"""
    raw = os.getenv("SCHOLAR_ENV", "local").strip().lower()
    if raw in {"local", "dev", "staging", "prod"}:
        return raw  # type: ignore[return-value]
    return "local"
