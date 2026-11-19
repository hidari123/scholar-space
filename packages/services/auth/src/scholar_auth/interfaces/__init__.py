"""接口层 —— HTTP 路由、依赖、请求/响应模型。

⚠️ 这一层**很薄** —— 只做协议转换，不含业务规则。
   业务规则在 application / domain 层。
"""

from scholar_auth.interfaces.app import create_app
from scholar_auth.interfaces.dependencies import (
    get_gateway_secret,
    require_principal,
    require_roles,
)
from scholar_auth.interfaces.schemas import (
    AuditRecordResponse,
    ErrorResponse,
    GrantRoleRequest,
    RevokeRoleRequest,
    SuspendUserRequest,
    UserAccountResponse,
)

__all__ = [
    "AuditRecordResponse",
    "ErrorResponse",
    "GrantRoleRequest",
    "RevokeRoleRequest",
    "SuspendUserRequest",
    "UserAccountResponse",
    "create_app",
    "get_gateway_secret",
    "require_principal",
    "require_roles",
]
