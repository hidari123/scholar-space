"""错误体系 —— 全部后端子项目共用。

⚠️ 错误码与前端 `packages/conventions/api/error-codes.json` 必须严格一致。
   契约来源：packages/conventions/api/error-codes.json

分段规则：
    0        成功
    400xx    参数 / 校验
    401xx    认证
    403xx    授权
    404xx    资源不存在
    409xx    冲突
    422xx    业务规则拒绝
    429xx    限流
    500xx    服务内部错误
    502xx    上游依赖失败
    503xx    服务不可用
    600xx    计费 / 额度
"""

from __future__ import annotations

from typing import Any, Final

__all__ = [
    "AppError",
    "AuthenticationError",
    "BusinessRuleError",
    "ConflictError",
    "ErrorCode",
    "InsufficientBalanceError",
    "InternalError",
    "NotFoundError",
    "PermissionDeniedError",
    "RateLimitError",
    "ServiceUnavailableError",
    "UpstreamError",
    "ValidationError",
]


class ErrorCode:
    """错误码常量。

    ⚠️ 与 `packages/conventions/api/error-codes.json` 同步。
    """

    OK: Final = 0

    INVALID_ARGUMENT: Final = 40001
    VALIDATION_FAILED: Final = 40002

    UNAUTHENTICATED: Final = 40101
    TOKEN_EXPIRED: Final = 40102
    INVALID_CREDENTIALS: Final = 40103

    FORBIDDEN: Final = 40301
    QUOTA_EXCEEDED: Final = 40302

    NOT_FOUND: Final = 40401
    RESOURCE_DELETED: Final = 40402

    CONFLICT: Final = 40901
    DUPLICATE: Final = 40902
    VERSION_CONFLICT: Final = 40903

    BUSINESS_RULE: Final = 42201
    CONTENT_REJECTED: Final = 42202

    RATE_LIMITED: Final = 42901
    TOO_MANY_REQUESTS: Final = 42902

    INTERNAL: Final = 50001
    DATABASE_ERROR: Final = 50002

    UPSTREAM_FAILED: Final = 50201
    UPSTREAM_TIMEOUT: Final = 50202

    UNAVAILABLE: Final = 50301

    INSUFFICIENT_BALANCE: Final = 60001
    SUBSCRIPTION_REQUIRED: Final = 60002


#: 错误码 → HTTP 状态码
HTTP_STATUS_BY_CODE: Final[dict[int, int]] = {
    ErrorCode.OK: 200,
    ErrorCode.INVALID_ARGUMENT: 400,
    ErrorCode.VALIDATION_FAILED: 400,
    ErrorCode.UNAUTHENTICATED: 401,
    ErrorCode.TOKEN_EXPIRED: 401,
    ErrorCode.INVALID_CREDENTIALS: 401,
    ErrorCode.FORBIDDEN: 403,
    ErrorCode.QUOTA_EXCEEDED: 403,
    ErrorCode.NOT_FOUND: 404,
    ErrorCode.RESOURCE_DELETED: 404,
    ErrorCode.CONFLICT: 409,
    ErrorCode.DUPLICATE: 409,
    ErrorCode.VERSION_CONFLICT: 409,
    ErrorCode.BUSINESS_RULE: 422,
    ErrorCode.CONTENT_REJECTED: 422,
    ErrorCode.RATE_LIMITED: 429,
    ErrorCode.TOO_MANY_REQUESTS: 429,
    ErrorCode.INTERNAL: 500,
    ErrorCode.DATABASE_ERROR: 500,
    ErrorCode.UPSTREAM_FAILED: 502,
    ErrorCode.UPSTREAM_TIMEOUT: 504,
    ErrorCode.UNAVAILABLE: 503,
    ErrorCode.INSUFFICIENT_BALANCE: 402,
    ErrorCode.SUBSCRIPTION_REQUIRED: 402,
}


class AppError(Exception):
    """业务异常基类。

    全部服务统一继承它 —— 网关/中间件按此捕获并转成统一响应信封。

    关键设计：**消息是 i18n key，不是给人看的文案**。
    前端拿到 `common.error.notFound` 后按当前界面语言渲染。
    """

    #: 子类可覆盖
    code: int = ErrorCode.INTERNAL

    def __init__(
        self,
        message: str,
        *,
        code: int | None = None,
        details: dict[str, Any] | None = None,
        cause: Exception | None = None,
    ) -> None:
        """初始化。

        Args:
            message: i18n key 或人类可读消息。
            code: 错误码，默认取类属性。
            details: 结构化详情（如字段级校验错误）。
            cause: 原始异常（链式追踪）。
        """
        super().__init__(message)
        self.message = message
        self.code = code if code is not None else type(self).code
        self.details = details or {}
        self.cause = cause

    @property
    def http_status(self) -> int:
        """对应 HTTP 状态码。"""
        return HTTP_STATUS_BY_CODE.get(self.code, 500)

    def to_dict(self) -> dict[str, Any]:
        """转成响应体（不含 request_id / timestamp，由外层补）。"""
        return {
            "code": self.code,
            "message": self.message,
            "data": self.details or None,
        }

    def __repr__(self) -> str:
        """可读表示。"""
        return f"{type(self).__name__}(code={self.code}, message={self.message!r})"


class ValidationError(AppError):
    """参数校验失败。"""

    code = ErrorCode.VALIDATION_FAILED


class AuthenticationError(AppError):
    """未认证 / 凭证无效。"""

    code = ErrorCode.UNAUTHENTICATED


class PermissionDeniedError(AppError):
    """无权限。

    ⚠️ 不叫 `PermissionDeniedError` —— 那会遮蔽 Python 内置异常，
    业务代码写 `except PermissionDeniedError` 会意外抓到本异常。
    """

    code = ErrorCode.FORBIDDEN


class NotFoundError(AppError):
    """资源不存在。"""

    code = ErrorCode.NOT_FOUND


class ConflictError(AppError):
    """资源冲突。"""

    code = ErrorCode.CONFLICT


class BusinessRuleError(AppError):
    """业务规则拒绝。"""

    code = ErrorCode.BUSINESS_RULE


class RateLimitError(AppError):
    """触发限流。"""

    code = ErrorCode.RATE_LIMITED


class InternalError(AppError):
    """服务内部错误。"""

    code = ErrorCode.INTERNAL


class UpstreamError(AppError):
    """上游依赖失败。"""

    code = ErrorCode.UPSTREAM_FAILED


class ServiceUnavailableError(AppError):
    """服务不可用。"""

    code = ErrorCode.UNAVAILABLE


class InsufficientBalanceError(AppError):
    """余额不足。"""

    code = ErrorCode.INSUFFICIENT_BALANCE
