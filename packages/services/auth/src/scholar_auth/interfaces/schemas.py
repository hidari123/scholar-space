"""请求/响应模型 —— Pydantic v2。

⚠️ **响应模型绝不含敏感字段** —— 密码哈希、第三方 token、
   网关密钥都不许出现在响应里。

⚠️ 用 `extra="forbid"` —— 多余字段直接拒绝。
   默认的「忽略」会让客户端以为字段生效了（比如传了个 `role` 想提权）。
"""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

__all__ = [
    "AuditRecordResponse",
    "ErrorResponse",
    "GrantRoleRequest",
    "ListUsersResponse",
    "RevokeRoleRequest",
    "SuspendUserRequest",
    "UserAccountResponse",
]


class _StrictModel(BaseModel):
    """严格模式的基类。

    ⚠️ `extra="forbid"` —— 拒绝多余字段。
    ⚠️ `from_attributes=True` —— 能从领域对象直接构造。
    """

    model_config = ConfigDict(extra="forbid", from_attributes=True)


class ErrorResponse(BaseModel):
    """统一错误响应。"""

    model_config = ConfigDict(extra="forbid")

    #: 错误码（如 "user_not_found"）
    code: str = Field(description="错误码")
    #: 人类可读的消息
    message: str = Field(description="错误描述")


class GrantRoleRequest(_StrictModel):
    """授予角色请求。"""

    #: 目标用户
    user_id: UUID = Field(description="目标用户 ID")
    #: 要授予的角色
    role: str = Field(description="角色名（platform_admin / tenant_admin / member / viewer）")
    #: 租户 ID —— 租户管理员必须提供
    tenant_id: UUID | None = Field(default=None, description="租户 ID")
    #: ⚠️ 审计原因 —— **必填**
    reason: str = Field(min_length=1, description="操作原因（必填，写入审计日志）")


class RevokeRoleRequest(_StrictModel):
    """撤销角色请求。"""

    user_id: UUID = Field(description="目标用户 ID")
    role: str = Field(description="要撤销的角色")
    tenant_id: UUID | None = Field(default=None, description="租户 ID")
    reason: str = Field(min_length=1, description="操作原因（必填，写入审计日志）")


class SuspendUserRequest(_StrictModel):
    """停用用户请求。"""

    user_id: UUID = Field(description="目标用户 ID")
    reason: str = Field(min_length=1, description="停用原因（必填，写入审计日志）")


class UserAccountResponse(_StrictModel):
    """用户账号响应。

    ⚠️ **不含**密码哈希、第三方 token、网关密钥。
    """

    user_id: UUID = Field(description="用户 ID")
    email: str | None = Field(default=None, description="邮箱")
    status: str = Field(description="账号状态（active / suspended / deleted）")
    roles: list[str] = Field(default_factory=list, description="已授予的角色")
    tenant_id: UUID | None = Field(default=None, description="所属租户")
    created_at: datetime | None = Field(default=None, description="创建时间")


class ListUsersResponse(_StrictModel):
    """用户列表响应。"""

    users: list[UserAccountResponse] = Field(default_factory=list, description="用户列表")
    total: int = Field(default=0, description="总数")


class AuditRecordResponse(_StrictModel):
    """审计记录响应。"""

    id: UUID = Field(description="审计记录 ID")
    actor_id: UUID = Field(description="操作人 ID")
    action: str = Field(description="操作类型")
    target_user_id: UUID | None = Field(default=None, description="目标用户")
    reason: str = Field(description="操作原因")
    result: str = Field(description="结果（success / denied / failed）")
    created_at: datetime = Field(description="发生时间")
    details: dict[str, Any] = Field(default_factory=dict, description="附加信息")
