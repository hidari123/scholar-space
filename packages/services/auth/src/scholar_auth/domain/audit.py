"""管理操作审计 —— nanobuddy 缺的那块。

⚠️ 为什么必须有：

   nanobuddy 的管理员操作（删用户、改费率、下架内容）**没要求填原因**。
   出了事只能靠翻日志猜 —— 运维体验极差。

   我们强制：
     · 每次写操作留一条 AdminAction
     · **reason 必填** —— 让操作可解释
     · 记录操作者、时间、目标、结果
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import StrEnum
from typing import Any
from uuid import UUID, uuid4

__all__ = ["AdminAction", "AdminActionResult", "AdminActionType", "AuditRecord"]


class AdminActionType(StrEnum):
    """管理操作类型。

    ⚠️ 用枚举而非自由字符串 —— 自由字符串一定会出现拼写变体。
    """

    # 用户
    USER_SUSPEND = "user.suspend"
    USER_REINSTATE = "user.reinstate"
    USER_DELETE = "user.delete"
    USER_RESET_PASSWORD = "user.reset_password"  # noqa: S105

    # 角色
    ROLE_GRANT = "role.grant"
    ROLE_REVOKE = "role.revoke"

    # 租户
    TENANT_UPDATE = "tenant.update"

    # 计费
    BILLING_ADJUST = "billing.adjust"
    BILLING_RATE_UPDATE = "billing.rate_update"

    # 内容
    CONTENT_APPROVE = "content.approve"
    CONTENT_REJECT = "content.reject"
    CONTENT_TAKEDOWN = "content.takedown"

    # 任务
    JOB_RETRY = "job.retry"
    JOB_CANCEL = "job.cancel"

    # 模型
    MODEL_UPDATE = "model.update"


class AdminActionResult(StrEnum):
    """操作结果。"""

    SUCCESS = "success"
    FAILED = "failed"
    DENIED = "denied"


@dataclass(frozen=True, slots=True)
class AdminAction:
    """一次管理操作。

    ⚠️ **不可变** —— 审计记录一旦写入就不能改。
    """

    #: 操作类型
    action: AdminActionType

    #: 操作者（管理员）
    actor_id: UUID

    #: 目标类型（user / tenant / role / billing_entry / content / job / model）
    target_type: str

    #: 目标 ID
    target_id: str

    #: ⚠️ 操作原因 —— **必填**，空字符串视为无效
    reason: str

    #: 结果
    result: AdminActionResult = AdminActionResult.SUCCESS

    #: 补充数据
    metadata: dict[str, Any] = field(default_factory=dict)

    #: 发生时间
    occurred_at: datetime = field(default_factory=lambda: datetime.now(UTC))

    #: ⚠️ 记录 ID —— 让外部可以精确引用一条审计记录。
    #:
    #:    ⚠️ 用 `field(default_factory=uuid4)` 而不是 `UUID(int=0)` ——
    #:       后者每次都一样，等于没有 ID。
    id: UUID = field(default_factory=uuid4)

    def __post_init__(self) -> None:
        """校验 —— reason 不能为空。

        ⚠️ 空 reason 的审计记录等于没有审计记录。
        """
        if not self.reason.strip():
            raise ValueError("审计记录必须填写 reason —— 无法解释的操作等于没有审计")

    @property
    def succeeded(self) -> bool:
        """是否成功。"""
        return self.result is AdminActionResult.SUCCESS


@dataclass(frozen=True, slots=True)
class AuditRecord:
    """审计查询结果。

    ⚠️ 分页返回 —— 审计表会很大，不能一次全拉。
    """

    actions: tuple[AdminAction, ...]
    total: int
    has_more: bool = False
