"""领域异常 —— 继承 core.errors.AppError。

本示例用本地定义演示形状；真实子项目从 @scholarspace.core 导入。
"""

from __future__ import annotations


class AppError(Exception):
    """所有业务异常的基类。

    全局异常处理器据此产出统一响应信封（见 docs/05-代码规范.md）。
    """

    code: str
    message: str
    status_code: int
    details: dict[str, object]

    def __init__(
        self,
        message: str,
        *,
        code: str,
        status_code: int = 500,
        **details: object,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code
        self.details = details


class NotFoundError(AppError):
    """资源不存在。"""

    def __init__(self, message: str = "资源不存在", **details: object) -> None:
        super().__init__(message, code="40401", status_code=404, **details)


class ValidationError(AppError):
    """参数校验失败。"""

    def __init__(self, message: str = "参数校验失败", **details: object) -> None:
        super().__init__(message, code="42201", status_code=422, **details)
