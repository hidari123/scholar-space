"""账本服务 —— 记账、查余额、预占结算。

⚠️ **所有余额都从账目算出来** ——
   不维护「当前余额」这种可变状态。

⚠️ **幂等** ——
   同一个 `idempotency_key` 重复提交只会记一次。
   这是重试安全的前提。
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable
from uuid import uuid4

from scholar_billing.domain.ledger import (
    Account,
    Balance,
    EntryKind,
    LedgerEntry,
    Reservation,
)

__all__ = [
    "AccountRepositoryPort",
    "BillingError",
    "InsufficientBalanceError",
    "LedgerRepositoryPort",
    "LedgerService",
    "ReservationNotFoundError",
]


class BillingError(Exception):
    """计费错误基类."""


class InsufficientBalanceError(BillingError):
    """额度不足.

    ⚠️ **单独一个异常** ——
    调用方要区分「额度不足」（提示用户充值）
    和「系统出错」（重试）。
    """


class ReservationNotFoundError(BillingError):
    """预占不存在."""


@runtime_checkable
class AccountRepositoryPort(Protocol):
    """账户仓储端口."""

    async def get_or_create(self, owner_id: int, unit: str = "credit") -> Account:
        """取账户（不存在就建）."""
        ...

    async def get(self, account_id: str) -> Account | None:
        """取账户."""
        ...


@runtime_checkable
class LedgerRepositoryPort(Protocol):
    """账目仓储端口."""

    async def append(self, entry: LedgerEntry) -> LedgerEntry:
        """追加账目."""
        ...

    async def list_entries(
        self,
        account_id: str,
        limit: int = 1000,
    ) -> tuple[LedgerEntry, ...]:
        """列出账目（按时间倒序）."""
        ...

    async def find_by_idempotency_key(self, key: str) -> LedgerEntry | None:
        """按幂等键查找."""
        ...

    async def list_reservations(
        self,
        account_id: str,
        status: str = "active",
    ) -> tuple[Reservation, ...]:
        """列出预占."""
        ...

    async def save_reservation(self, reservation: Reservation) -> Reservation:
        """保存预占."""
        ...

    async def get_reservation(self, reservation_id: str) -> Reservation | None:
        """取预占."""
        ...


class LedgerService:
    """账本服务."""

    def __init__(
        self,
        accounts: AccountRepositoryPort,
        ledger: LedgerRepositoryPort,
    ) -> None:
        """初始化.

        :param accounts: 账户仓储
        :param ledger: 账目仓储
        """
        self._accounts = accounts
        self._ledger = ledger

    # ══════════════════════════════════════════════════
    # 余额
    # ══════════════════════════════════════════════════

    async def balance(self, owner_id: int, unit: str = "credit") -> Balance:
        """查余额.

        ⚠️ **从账目算出来** —— 不读任何「当前余额」字段。
        """
        account = await self._accounts.get_or_create(owner_id, unit)
        return await self._balance_of(account.account_id)

    async def _balance_of(self, account_id: str) -> Balance:
        """算余额."""
        entries = await self._ledger.list_entries(account_id)
        reservations = await self._ledger.list_reservations(account_id)

        total = 0
        consumed = 0

        # ⚠️ **先建索引** —— 冲正时要找原账目
        by_id = {entry.entry_id: entry for entry in entries}

        for entry in entries:
            if entry.kind in (EntryKind.CREDIT, EntryKind.REFUND):
                total += entry.amount
            elif entry.kind is EntryKind.DEBIT:
                consumed += abs(entry.amount)
            elif entry.kind is EntryKind.REVERSAL:
                # ⚠️ **冲正要「按原账目的语义」回退** ——
                #    不是简单地加减总额。
                #
                #    冲正一条 DEBIT(-30)  → consumed -= 30
                #    冲正一条 CREDIT(+100) → total   -= 100
                #
                #    ⚠️ 写死「只减 consumed」的话，
                #    冲正充值时余额不会变对。
                original = by_id.get(entry.reverses_entry_id)
                if original is None:
                    # ⚠️ **找不到原账目** —— 跳过，不乱算
                    continue

                if original.kind in (EntryKind.CREDIT, EntryKind.REFUND):
                    total -= abs(original.amount)
                elif original.kind is EntryKind.DEBIT:
                    consumed -= abs(original.amount)

        reserved = sum(
            reservation.amount for reservation in reservations if reservation.status == "active"
        )

        return Balance(
            account_id=account_id,
            total=total,
            consumed=max(consumed, 0),
            reserved=reserved,
            available=total - max(consumed, 0) - reserved,
        )

    # ══════════════════════════════════════════════════
    # 记账
    # ══════════════════════════════════════════════════

    async def credit(
        self,
        owner_id: int,
        amount: int,
        description: str = "",
        idempotency_key: str = "",
        unit: str = "credit",
    ) -> LedgerEntry:
        """入账（充值 / 赠送）.

        :param owner_id: 用户 ID
        :param amount: 金额（正整数）
        :param description: 说明
        :param idempotency_key: 幂等键
        :param unit: 计量单位
        :raises ValueError: 金额不是正数
        """
        if amount <= 0:
            raise ValueError("入账金额必须大于 0")

        account = await self._accounts.get_or_create(owner_id, unit)

        return await self._append(
            account_id=account.account_id,
            kind=EntryKind.CREDIT,
            amount=amount,
            description=description,
            idempotency_key=idempotency_key,
            unit=unit,
        )

    async def debit(  # noqa: PLR0913, PLR0917
        self,
        owner_id: int,
        amount: int,
        description: str = "",
        idempotency_key: str = "",
        unit: str = "credit",
        allow_negative: bool = False,
    ) -> LedgerEntry:
        """消费.

        ⚠️ **默认不允许超额** ——
        额度不足就抛 `InsufficientBalanceError`。

        :param allow_negative: 是否允许透支（管理员补录时用）
        :raises InsufficientBalanceError: 额度不足
        :raises ValueError: 金额不是正数
        """
        if amount <= 0:
            raise ValueError("消费金额必须大于 0")

        account = await self._accounts.get_or_create(owner_id, unit)

        if not allow_negative:
            balance = await self._balance_of(account.account_id)
            if not balance.can_afford(amount):
                raise InsufficientBalanceError(
                    f"额度不足：可用 {balance.available}，需要 {amount}",
                )

        return await self._append(
            account_id=account.account_id,
            kind=EntryKind.DEBIT,
            amount=-abs(amount),
            description=description,
            idempotency_key=idempotency_key,
            unit=unit,
        )

    async def refund(
        self,
        owner_id: int,
        amount: int,
        description: str = "",
        idempotency_key: str = "",
        unit: str = "credit",
    ) -> LedgerEntry:
        """退款.

        ⚠️ **退款是加钱** —— 不是撤销原消费。
        """
        if amount <= 0:
            raise ValueError("退款金额必须大于 0")

        account = await self._accounts.get_or_create(owner_id, unit)

        return await self._append(
            account_id=account.account_id,
            kind=EntryKind.REFUND,
            amount=abs(amount),
            description=description,
            idempotency_key=idempotency_key,
            unit=unit,
        )

    async def reverse(
        self,
        owner_id: int,
        entry_id: str,
        reason: str = "",
        unit: str = "credit",
    ) -> LedgerEntry:
        """冲正一条账目.

        ⚠️ **不删原账目** —— 写一条相反的。
        账本是只追加的。

        :raises ValueError: 找不到原账目
        """
        account = await self._accounts.get_or_create(owner_id, unit)
        entries = await self._ledger.list_entries(account.account_id)

        original = next((item for item in entries if item.entry_id == entry_id), None)
        if original is None:
            raise ValueError(f"账目不存在：{entry_id}")

        return await self._append(
            account_id=account.account_id,
            kind=EntryKind.REVERSAL,
            amount=-original.amount,
            description=reason or f"冲正 {entry_id}",
            idempotency_key="",
            unit=unit,
            reverses_entry_id=entry_id,
        )

    # ══════════════════════════════════════════════════
    # 预占
    # ══════════════════════════════════════════════════

    async def reserve(
        self,
        owner_id: int,
        amount: int,
        description: str = "",
        unit: str = "credit",
    ) -> Reservation:
        """预占额度.

        ⚠️ **预占前先检查够不够** ——
        不然用户可以同时开 100 个任务。

        :raises InsufficientBalanceError: 额度不足
        :raises ValueError: 金额不是正数
        """
        del description  # ⚠️ 预占本身不记账，说明用不上

        if amount <= 0:
            raise ValueError("预占金额必须大于 0")

        account = await self._accounts.get_or_create(owner_id, unit)
        balance = await self._balance_of(account.account_id)

        if not balance.can_afford(amount):
            raise InsufficientBalanceError(
                f"额度不足：可用 {balance.available}，需要 {amount}",
            )

        reservation = Reservation(
            # ⚠️ **用 UUID** —— 余额里的 reserved 是 int 不是 list，
            #    拿它当计数会报错，而且就算能算也会撞。
            reservation_id=f"res-{uuid4()}",
            account_id=account.account_id,
            amount=amount,
            status="active",
        )

        return await self._ledger.save_reservation(reservation)

    async def settle(
        self,
        owner_id: int,
        reservation_id: str,
        actual_amount: int,
        description: str = "",
        unit: str = "credit",
    ) -> LedgerEntry:
        """结算预占.

        ⚠️ **实际消耗可能比预占多或少** ——
        多退少补：预占 100 实际用了 60，
        就只扣 60，剩下 40 自动释放。

        :raises ReservationNotFoundError: 预占不存在
        :raises ValueError: 实际金额是负数
        """
        account = await self._accounts.get_or_create(owner_id, unit)
        reservation = await self._ledger.get_reservation(reservation_id)

        if reservation is None:
            raise ReservationNotFoundError(f"预占不存在：{reservation_id}")

        if actual_amount < 0:
            raise ValueError("实际消耗不能是负数")

        # ⚠️ **先把预占标记成已结算** —— 否则可用额度一直扣着
        await self._ledger.save_reservation(
            Reservation(
                reservation_id=reservation.reservation_id,
                account_id=reservation.account_id,
                amount=reservation.amount,
                status="settled",
                created_at=reservation.created_at,
            )
        )

        if actual_amount == 0:
            # ⚠️ **没用完也没超** —— 全部释放，不记账
            return LedgerEntry(
                entry_id="",
                account_id=account.account_id,
                kind=EntryKind.RELEASE,
                amount=0,
                description=description or "预占释放（未消耗）",
                unit=unit,
            )

        # ⚠️ **超了预占也要扣** —— 否则能靠预占绕过额度检查
        balance = await self._balance_of(account.account_id)
        if actual_amount > balance.available + reservation.amount:
            raise InsufficientBalanceError(
                f"结算金额超出可用额度：需要 {actual_amount}",
            )

        return await self._append(
            account_id=account.account_id,
            kind=EntryKind.DEBIT,
            amount=-abs(actual_amount),
            description=description or f"结算预占 {reservation_id}",
            idempotency_key="",
            unit=unit,
        )

    async def release(
        self,
        owner_id: int,
        reservation_id: str,
        unit: str = "credit",
    ) -> None:
        """释放预占（不用了）.

        :raises ReservationNotFoundError: 预占不存在
        """
        await self._accounts.get_or_create(owner_id, unit)
        reservation = await self._ledger.get_reservation(reservation_id)

        if reservation is None:
            raise ReservationNotFoundError(f"预占不存在：{reservation_id}")

        await self._ledger.save_reservation(
            Reservation(
                reservation_id=reservation.reservation_id,
                account_id=reservation.account_id,
                amount=reservation.amount,
                status="released",
                created_at=reservation.created_at,
            )
        )

    # ══════════════════════════════════════════════════
    # 内部
    # ══════════════════════════════════════════════════

    async def _append(  # noqa: PLR0913, PLR0917
        self,
        account_id: str,
        kind: EntryKind,
        amount: int,
        description: str,
        idempotency_key: str,
        unit: str,
        reverses_entry_id: str = "",
    ) -> LedgerEntry:
        """追加账目.

        ⚠️ **幂等检查在追加之前** ——
        重复提交同一个键不重复记账。
        """
        if idempotency_key:
            existing = await self._ledger.find_by_idempotency_key(idempotency_key)
            if existing is not None:
                return existing

        # ⚠️ **账目 ID 必须唯一** ——
        # 用「账户 + 类型 + 金额」拼 ID 会撞：
        # 两次扣 30 的 ID 完全一样。
        # ⚠️ **用 UUID** —— 唯一性由它保证，不靠拼接。
        entry = LedgerEntry(
            entry_id=f"ent-{uuid4()}",
            account_id=account_id,
            kind=kind,
            amount=amount,
            unit=unit,
            description=description,
            idempotency_key=idempotency_key,
            reverses_entry_id=reverses_entry_id,
        )

        return await self._ledger.append(entry)
