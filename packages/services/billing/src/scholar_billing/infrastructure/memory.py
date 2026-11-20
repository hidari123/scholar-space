"""内存实现 —— 开发与测试用。

⚠️ **并发安全靠锁** ——
   真实实现靠数据库事务。
"""

from __future__ import annotations

import asyncio

from scholar_billing.domain.ledger import Account, LedgerEntry, Reservation

__all__ = ["InMemoryAccountRepository", "InMemoryLedgerRepository"]


class InMemoryAccountRepository:
    """内存账户仓储."""

    def __init__(self) -> None:
        self._accounts: dict[str, Account] = {}
        self._lock = asyncio.Lock()

    async def get_or_create(self, owner_id: int, unit: str = "credit") -> Account:
        """取账户（不存在就建）.

        ⚠️ **一个用户一个账户** ——
        同一个 (owner_id, unit) 永远返回同一个账户。
        """
        account_id = f"acc-{owner_id}-{unit}"

        async with self._lock:
            existing = self._accounts.get(account_id)
            if existing is not None:
                return existing

            account = Account(account_id=account_id, owner_id=owner_id, unit=unit)
            self._accounts[account_id] = account
            return account

    async def get(self, account_id: str) -> Account | None:
        """取账户."""
        return self._accounts.get(account_id)


class InMemoryLedgerRepository:
    """内存账目仓储."""

    def __init__(self) -> None:
        self._entries: list[LedgerEntry] = []
        self._reservations: dict[str, Reservation] = {}
        self._lock = asyncio.Lock()

    async def append(self, entry: LedgerEntry) -> LedgerEntry:
        """追加账目.

        ⚠️ **账目 ID 要唯一** ——
        重复追加说明幂等没生效，要报错而不是静默接受。
        """
        async with self._lock:
            if any(item.entry_id == entry.entry_id for item in self._entries):
                # ⚠️ **同 ID 已存在** —— 说明是重复提交，
                # 幂等键没起作用。要报错，不能静默接受。
                raise ValueError(f"账目 ID 重复：{entry.entry_id}")

            self._entries.append(entry)

        return entry

    async def list_entries(
        self,
        account_id: str,
        limit: int = 1000,
    ) -> tuple[LedgerEntry, ...]:
        """列出账目（**按时间正序** —— 算余额要按顺序）."""
        matched = [entry for entry in self._entries if entry.account_id == account_id]

        # ⚠️ **正序** —— 冲正是靠「顺序」抵消的
        matched.sort(key=lambda entry: entry.created_at)

        return tuple(matched[-limit:])

    async def find_by_idempotency_key(self, key: str) -> LedgerEntry | None:
        """按幂等键查找."""
        for entry in self._entries:
            if entry.idempotency_key == key:
                return entry

        return None

    async def list_reservations(
        self,
        account_id: str,
        status: str = "active",
    ) -> tuple[Reservation, ...]:
        """列出预占."""
        return tuple(
            reservation
            for reservation in self._reservations.values()
            if reservation.account_id == account_id and reservation.status == status
        )

    async def save_reservation(self, reservation: Reservation) -> Reservation:
        """保存预占."""
        async with self._lock:
            self._reservations[reservation.reservation_id] = reservation

        return reservation

    async def get_reservation(self, reservation_id: str) -> Reservation | None:
        """取预占."""
        return self._reservations.get(reservation_id)
