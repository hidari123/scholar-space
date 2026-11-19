"""内存存储实现 —— 开发与测试用。

⚠️ 生产环境用 PostgreSQL 实现（接口完全一致）。

刻意加锁 —— 测试并发跑时不加锁会偶发失败。
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from uuid import UUID

from scholar_auth.domain.audit import AdminAction, AdminActionResult, AuditRecord
from scholar_auth.domain.models import AdminGrant, RoleName, UserStatus

__all__ = [
    "InMemoryAccountRepository",
    "InMemoryAuditRepository",
    "InMemoryGrantRepository",
]


class InMemoryAccountRepository:
    """内存账号表。"""

    def __init__(self) -> None:
        """初始化。"""
        self._statuses: dict[UUID, UserStatus] = {}
        self._lock = asyncio.Lock()

    async def get_status(self, user_id: UUID) -> UserStatus | None:
        """取账号状态。"""
        async with self._lock:
            return self._statuses.get(user_id)

    async def set_status(self, user_id: UUID, status: UserStatus) -> None:
        """设置账号状态。"""
        async with self._lock:
            self._statuses[user_id] = status

    async def exists(self, user_id: UUID) -> bool:
        """账号是否存在。"""
        async with self._lock:
            return user_id in self._statuses


class InMemoryGrantRepository:
    """内存授权表。"""

    def __init__(self) -> None:
        """初始化。"""
        self._grants: list[AdminGrant] = []
        self._lock = asyncio.Lock()

    async def list_active(self, user_id: UUID) -> tuple[AdminGrant, ...]:
        """列出生效的授权。"""
        async with self._lock:
            return tuple(
                grant for grant in self._grants if grant.user_id == user_id and grant.is_active
            )

    async def grant(self, grant: AdminGrant) -> AdminGrant:
        """新增授权。

        ⚠️ 同一用户同一角色重复授权 → 视为续期（更新原记录的时间与原因）。
        """
        async with self._lock:
            for index, existing in enumerate(self._grants):
                if (
                    existing.user_id == grant.user_id
                    and existing.role == grant.role
                    and existing.tenant_id == grant.tenant_id
                    and existing.is_active
                ):
                    self._grants[index] = grant
                    return grant

            self._grants.append(grant)
            return grant

    async def revoke(self, user_id: UUID, role: RoleName, actor_id: UUID) -> bool:
        """撤销授权。"""
        async with self._lock:
            for index, existing in enumerate(self._grants):
                if existing.user_id == user_id and existing.role == role and existing.is_active:
                    self._grants[index] = existing.revoke(actor_id)
                    return True

            return False

    async def has_role(self, user_id: UUID, role: RoleName) -> bool:
        """用户是否有该角色。"""
        active = await self.list_active(user_id)
        return any(grant.role is role for grant in active)

    async def list_admins(self, tenant_id: str | None = None) -> tuple[AdminGrant, ...]:
        """列出管理员。

        ⚠️ `tenant_id=None` 表示**列出所有租户**的管理员。
           调用方要清楚区分「不限租户」与「本租户」——
           租户管理员调用时必须传自己的 tenant_id。
        """
        async with self._lock:
            return tuple(
                grant
                for grant in self._grants
                if grant.is_active
                and grant.role in (RoleName.PLATFORM_ADMIN, RoleName.TENANT_ADMIN)
                and (tenant_id is None or grant.tenant_id == tenant_id)
            )


class InMemoryAuditRepository:
    """内存审计表。"""

    def __init__(self) -> None:
        """初始化。"""
        self._actions: list[AdminAction] = []
        self._lock = asyncio.Lock()

    async def record(self, action: AdminAction) -> AdminAction:
        """写入审计记录。

        ⚠️ 失败的操作也记录 —— 审计要能看到「尝试过」。
        """
        async with self._lock:
            self._actions.append(action)
            return action

    async def query(
        self,
        actor_id: UUID | None = None,
        target_id: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> AuditRecord:
        """查询审计记录。"""
        async with self._lock:
            filtered = [
                action
                for action in self._actions
                if (actor_id is None or action.actor_id == actor_id)
                and (target_id is None or action.target_id == target_id)
            ]

            # 新的在前
            filtered.reverse()

            page = filtered[offset : offset + limit]

            return AuditRecord(
                actions=tuple(page),
                total=len(filtered),
                has_more=offset + len(page) < len(filtered),
            )


@dataclass
class AuthRepositories:
    """三个仓储的容器 —— 方便整体注入。"""

    accounts: InMemoryAccountRepository = field(default_factory=InMemoryAccountRepository)
    grants: InMemoryGrantRepository = field(default_factory=InMemoryGrantRepository)
    audit: InMemoryAuditRepository = field(default_factory=InMemoryAuditRepository)


__all__ += ["AdminActionResult", "AuthRepositories"]
