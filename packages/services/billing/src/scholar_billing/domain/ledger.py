"""账本 —— 计费的真相源。

⚠️ **账本是唯一真相** ——
   额度、余额、消耗量全部从账本算出来，
   不维护「当前余额」这种可变状态。

⚠️ **为什么要这样** ——
   可变状态（`balance = 100`）会跟实际流水对不上：
   并发扣费时丢更新、失败重试时重复扣、
   出了问题不知道哪一步错的。

⚠️ **账本是只追加的** ——
   记错了不能改，要写一条「冲正」条目（reversal）。

⚠️ **整数，不用浮点** ——
    `0.1 + 0.2 != 0.3`。金额一律用「最小单位」的整数
    （比如「分」）。
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import StrEnum

__all__ = [
    "Account",
    "EntryKind",
    "LedgerEntry",
    "Reservation",
]


class EntryKind(StrEnum):
    """账目类型."""

    #: 充值 / 赠送（正数）
    CREDIT = "credit"
    #: 消费（负数）
    DEBIT = "debit"
    #: 预占（冻结额度，不实际扣）
    RESERVE = "reserve"
    #: 释放预占
    RELEASE = "release"
    #: 冲正（把某一条账目抵消）
    REVERSAL = "reversal"
    #: 退款（正数）
    REFUND = "refund"


@dataclass(frozen=True, slots=True)
class LedgerEntry:
    """一条账目.

    ⚠️ **不可变** —— 记错了写冲正条目，不改这条。
    """

    #: 账目 ID
    entry_id: str
    #: 账户 ID
    account_id: str
    #: 类型
    kind: EntryKind
    #: 金额（最小单位的整数，负数表示支出）
    amount: int
    #: 币种 / 计量单位
    unit: str = "credit"
    #: 说明
    description: str = ""
    #: 关联的原始账目（冲正时指向被冲的那条）
    reverses_entry_id: str = ""
    #: 幂等键 —— 重复提交同一个键不会重复记账
    idempotency_key: str = ""
    #: 记账时间
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))

    @property
    def is_positive(self) -> bool:
        """是不是入账."""
        return self.amount > 0

    @property
    def is_negative(self) -> bool:
        """是不是支出."""
        return self.amount < 0


@dataclass(frozen=True, slots=True)
class Account:
    """账户.

    ⚠️ **只存 ID 和归属** ——
    余额是**算出来的**，不是存下来的。
    """

    #: 账户 ID
    account_id: str
    #: 拥有者（用户 ID）
    owner_id: int
    #: 计量单位
    unit: str = "credit"
    #: 创建时间
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))


@dataclass(frozen=True, slots=True)
class Reservation:
    """预占.

    ⚠️ **预占不是扣款** ——
    用户点了「生成 PPT」，先冻结预估额度，
    实际消耗按真实用量结算，多出来的释放。

    ⚠️ **为什么要预占** ——
    不预占的话，用户可以同时开 100 个任务，
    额度根本不够，但每个任务都以为自己有额度。
    """

    #: 预占 ID
    reservation_id: str
    #: 账户 ID
    account_id: str
    #: 预占的额度
    amount: int
    #: 状态
    status: str = "active"
    #: 创建时间
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))


@dataclass(frozen=True, slots=True)
class Balance:
    """余额快照.

    ⚠️ **这是算出来的结果** —— 不是存的状态。
    """

    #: 账户 ID
    account_id: str
    #: 总额度（所有 CREDIT 之和）
    total: int = 0
    #: 已消耗（所有 DEBIT 之和，取绝对值）
    consumed: int = 0
    #: 预占中（还没结算）
    reserved: int = 0
    #: 可用额度
    available: int = 0

    def can_afford(self, amount: int) -> bool:
        """够不够."""
        return self.available >= amount

    def is_exhausted(self) -> bool:
        """额度用光了吗."""
        return self.available <= 0
