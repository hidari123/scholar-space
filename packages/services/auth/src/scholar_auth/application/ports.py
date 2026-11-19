"""应用层端口 —— 存储与外部系统的契约。

⚠️ 端口在**应用层**，实现放在**基础设施层**。

好处：
  · 用例层不依赖 SQLAlchemy —— 换数据库不改业务逻辑
  · 测试塞内存实现，不用起数据库
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable
from uuid import UUID

from scholar_auth.domain.audit import AdminAction, AuditRecord
from scholar_auth.domain.models import AdminGrant, RoleName, UserStatus

__all__ = ["AccountRepository", "AuditRepository", "GrantRepository"]


@runtime_checkable
class AccountRepository(Protocol):
    """内部账号存储端口。

    ⚠️ 这是 auth 服务的**内部账号** —— 与 identity 仓的 User 表**分开**。

    identity 说「你是谁」，auth 说「你在这个平台有什么角色」。
    两者用 user_id 关联。
    """

    async def get_status(self, user_id: UUID) -> UserStatus | None:
        """取账号状态。

        ⚠️ 返回 None 表示**这个 user_id 在 auth 侧还没有账号** ——
        通常是刚注册、事件还没消费到。
        """
        ...

    async def set_status(self, user_id: UUID, status: UserStatus) -> None:
        """设置账号状态（封禁 / 解封 / 删除）。"""
        ...

    async def exists(self, user_id: UUID) -> bool:
        """账号是否存在。"""
        ...


@runtime_checkable
class GrantRepository(Protocol):
    """角色授权存储端口。"""

    async def list_active(self, user_id: UUID) -> tuple[AdminGrant, ...]:
        """列出用户当前生效的授权。"""
        ...

    async def grant(self, grant: AdminGrant) -> AdminGrant:
        """新增授权。"""
        ...

    async def revoke(self, user_id: UUID, role: RoleName, actor_id: UUID) -> bool:
        """撤销授权。

        Returns:
            是否真的撤销了（原本就没有则返回 False）
        """
        ...

    async def has_role(self, user_id: UUID, role: RoleName) -> bool:
        """用户是否有该角色。"""
        ...

    async def list_admins(self, tenant_id: str | None = None) -> tuple[AdminGrant, ...]:
        """列出管理员。

        Args:
            tenant_id: 限定租户（None = 全平台）
        """
        ...


@runtime_checkable
class AuditRepository(Protocol):
    """审计存储端口。"""

    async def record(self, action: AdminAction) -> AdminAction:
        """写入审计记录。"""
        ...

    async def query(
        self,
        actor_id: UUID | None = None,
        target_id: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> AuditRecord:
        """查询审计记录。"""
        ...
