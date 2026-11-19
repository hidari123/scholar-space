"""scholar-auth —— 平台鉴权与管理员服务。

⚠️ 回答的是「**你能做什么**」，不是「你是谁」。

    identity 仓（独立）  →  「你是谁」   → User / Identity / Credential
    auth 服务（本包）    →  「你能做什么」→ Role / Permission / AdminGrant

职责边界 —— identity **不需要知道** auth 的存在；
auth 通过消费 identity 的 `UserRegistered` 事件建内部账号。
"""

from scholar_auth.application.ports import (
    AccountRepository,
    AuditRepository,
    GrantRepository,
)
from scholar_auth.application.use_cases import (
    AuthContext,
    AuthorizationError,
    GrantRoleRequest,
    GrantRoleResult,
    SelfEscalationError,
    SuspendUserRequest,
    build_principal,
    build_principal_for,
    grant_role,
    reinstate_user,
    revoke_role,
    suspend_user,
)
from scholar_auth.domain.audit import (
    AdminAction,
    AdminActionResult,
    AdminActionType,
    AuditRecord,
)
from scholar_auth.domain.gateway import (
    DEFAULT_SIGNATURE_TTL,
    GatewayHeaders,
    GatewaySignatureError,
    GatewaySignatureExpiredError,
    sign_gateway_headers,
    verify_gateway_signature,
)
from scholar_auth.domain.models import (
    ROLES,
    AdminGrant,
    Permission,
    Principal,
    Role,
    RoleName,
    TenantScope,
    UnknownPermissionError,
    UnknownRoleError,
    UserStatus,
    get_role,
)
from scholar_auth.infrastructure.memory import (
    AuthRepositories,
    InMemoryAccountRepository,
    InMemoryAuditRepository,
    InMemoryGrantRepository,
)

__version__ = "0.1.0"

__all__ = [
    # 领域 —— 网关签名
    "DEFAULT_SIGNATURE_TTL",
    "ROLES",
    # 应用 —— 端口
    "AccountRepository",
    # 领域 —— 审计
    "AdminAction",
    "AdminActionResult",
    "AdminActionType",
    # 领域 —— 角色与权限
    "AdminGrant",
    "AuditRecord",
    "AuditRepository",
    # 应用 —— 用例
    "AuthContext",
    # 基础设施 —— 内存实现
    "AuthRepositories",
    "AuthorizationError",
    "GatewayHeaders",
    "GatewaySignatureError",
    "GatewaySignatureExpiredError",
    "GrantRepository",
    "GrantRoleRequest",
    "GrantRoleResult",
    "InMemoryAccountRepository",
    "InMemoryAuditRepository",
    "InMemoryGrantRepository",
    "Permission",
    "Principal",
    "Role",
    "RoleName",
    "SelfEscalationError",
    "SuspendUserRequest",
    "TenantScope",
    "UnknownPermissionError",
    "UnknownRoleError",
    "UserStatus",
    "__version__",
    "build_principal",
    "build_principal_for",
    "get_role",
    "grant_role",
    "reinstate_user",
    "revoke_role",
    "sign_gateway_headers",
    "suspend_user",
    "verify_gateway_signature",
]
