"""账本服务测试。

⚠️ **重点验证「账本是真相源」**：
    · 余额从账目算出来
    · 冲正不是删除
    · 幂等不重复记账
    · 预占能防超额
"""

from __future__ import annotations

import pytest

from scholar_billing.application.service import (
    InsufficientBalanceError,
    LedgerService,
    ReservationNotFoundError,
)
from scholar_billing.domain.ledger import EntryKind
from scholar_billing.infrastructure.memory import (
    InMemoryAccountRepository,
    InMemoryLedgerRepository,
)


@pytest.fixture
def service() -> LedgerService:
    """账本服务."""
    return LedgerService(
        accounts=InMemoryAccountRepository(),
        ledger=InMemoryLedgerRepository(),
    )


class TestCreditDebit:
    """记账."""

    async def test_credit_increases_balance(self, service: LedgerService) -> None:
        """⚠️ **入账 → 余额增加**。"""
        await service.credit(1, 100)

        balance = await service.balance(1)

        assert balance.total == 100
        assert balance.available == 100

    async def test_debit_reduces_balance(self, service: LedgerService) -> None:
        """消费 → 余额减少。"""
        await service.credit(1, 100)
        await service.debit(1, 30)

        balance = await service.balance(1)

        assert balance.consumed == 30
        assert balance.available == 70

    async def test_debit_beyond_balance_raises(self, service: LedgerService) -> None:
        """⚠️ **超额要明确报错** —— 不能默默透支。"""
        await service.credit(1, 50)

        with pytest.raises(InsufficientBalanceError):
            await service.debit(1, 100)

    async def test_debit_without_credit_raises(self, service: LedgerService) -> None:
        """⚠️ **没充过钱不能消费**。"""
        with pytest.raises(InsufficientBalanceError):
            await service.debit(1, 1)

    async def test_allow_negative_bypasses_check(self, service: LedgerService) -> None:
        """⚠️ **管理员补录可以透支**。"""
        await service.debit(1, 100, allow_negative=True)

        balance = await service.balance(1)

        assert balance.consumed == 100
        assert balance.available == -100

    async def test_credit_rejects_non_positive(self, service: LedgerService) -> None:
        """⚠️ **金额必须大于 0**。"""
        with pytest.raises(ValueError, match="大于 0"):
            await service.credit(1, 0)

    async def test_debit_rejects_non_positive(self, service: LedgerService) -> None:
        """⚠️ **金额必须大于 0**。"""
        with pytest.raises(ValueError, match="大于 0"):
            await service.debit(1, -10)

    async def test_refund_adds_balance(self, service: LedgerService) -> None:
        """⚠️ **退款是加钱**。"""
        await service.credit(1, 100)
        await service.debit(1, 30)
        await service.refund(1, 30)

        balance = await service.balance(1)

        assert balance.available == 100


class TestIdempotency:
    """幂等."""

    async def test_same_key_does_not_double_charge(self, service: LedgerService) -> None:
        """⚠️ **重试安全** —— 同一个键只扣一次。"""
        await service.credit(1, 100)

        await service.debit(1, 30, idempotency_key="req-abc")
        await service.debit(1, 30, idempotency_key="req-abc")

        balance = await service.balance(1)

        assert balance.consumed == 30

    async def test_same_key_returns_same_entry(self, service: LedgerService) -> None:
        """⚠️ **返回同一条账目**。"""
        await service.credit(1, 100)

        first = await service.debit(1, 30, idempotency_key="req-abc")
        second = await service.debit(1, 30, idempotency_key="req-abc")

        assert first.entry_id == second.entry_id

    async def test_different_keys_charge_twice(self, service: LedgerService) -> None:
        """⚠️ **不同的键要真的扣两次**。"""
        await service.credit(1, 100)

        await service.debit(1, 30, idempotency_key="req-a")
        await service.debit(1, 30, idempotency_key="req-b")

        balance = await service.balance(1)

        assert balance.consumed == 60

    async def test_credit_is_idempotent_too(self, service: LedgerService) -> None:
        """⚠️ **充值也要幂等** —— 支付回调会重试。"""
        await service.credit(1, 100, idempotency_key="pay-abc")
        await service.credit(1, 100, idempotency_key="pay-abc")

        balance = await service.balance(1)

        assert balance.total == 100


class TestReversal:
    """冲正."""

    async def test_reversal_restores_balance(self, service: LedgerService) -> None:
        """⚠️ **冲正把余额恢复**。"""
        await service.credit(1, 100)
        entry = await service.debit(1, 30)

        await service.reverse(1, entry.entry_id, reason="误扣")

        balance = await service.balance(1)

        assert balance.available == 100

    async def test_reversal_keeps_original_entry(self, service: LedgerService) -> None:
        """⚠️ **原账目还在** —— 账本是只追加的。"""
        await service.credit(1, 100)
        entry = await service.debit(1, 30)

        await service.reverse(1, entry.entry_id)

        account = await service.balance(1)
        entries = await service._ledger.list_entries(account.account_id)

        kinds = [item.kind for item in entries]
        assert EntryKind.DEBIT in kinds
        assert EntryKind.REVERSAL in kinds

    async def test_reversal_of_unknown_entry_raises(self, service: LedgerService) -> None:
        """⚠️ **冲正不存在的账目要报错**。"""
        with pytest.raises(ValueError, match="不存在"):
            await service.reverse(1, "ghost-entry")

    async def test_reversal_of_credit_reduces_total(self, service: LedgerService) -> None:
        """⚠️ **冲正充值也要对** —— 充值记错了要能撤销。

        ⚠️ 写死「冲正只减 consumed」的话，
        冲正充值时余额不会变对。
        """
        entry = await service.credit(1, 100)

        await service.reverse(1, entry.entry_id, reason="充错账户")

        balance = await service.balance(1)

        assert balance.total == 0
        assert balance.available == 0


class TestReservation:
    """预占."""

    async def test_reserve_holds_quota(self, service: LedgerService) -> None:
        """⚠️ **预占要冻结额度**。"""
        await service.credit(1, 100)
        await service.reserve(1, 40)

        balance = await service.balance(1)

        assert balance.reserved == 40
        assert balance.available == 60

    async def test_reserve_beyond_balance_raises(self, service: LedgerService) -> None:
        """⚠️ **不能预占超过可用额度**。"""
        await service.credit(1, 50)

        with pytest.raises(InsufficientBalanceError):
            await service.reserve(1, 100)

    async def test_settle_charges_actual_amount(self, service: LedgerService) -> None:
        """⚠️ **按真实用量结算** —— 多退少补。"""
        await service.credit(1, 100)
        reservation = await service.reserve(1, 100)

        await service.settle(1, reservation.reservation_id, 60)

        balance = await service.balance(1)

        assert balance.consumed == 60
        assert balance.reserved == 0
        assert balance.available == 40

    async def test_settle_more_than_reserved(self, service: LedgerService) -> None:
        """⚠️ **超了预占也要扣** —— 不能靠预占绕过额度检查。"""
        await service.credit(1, 100)
        reservation = await service.reserve(1, 20)

        await service.settle(1, reservation.reservation_id, 50)

        balance = await service.balance(1)

        assert balance.consumed == 50
        assert balance.available == 50

    async def test_settle_zero_releases_all(self, service: LedgerService) -> None:
        """⚠️ **没用完也没超** —— 全部释放，不记账。"""
        await service.credit(1, 100)
        reservation = await service.reserve(1, 100)

        await service.settle(1, reservation.reservation_id, 0)

        balance = await service.balance(1)

        assert balance.reserved == 0
        assert balance.consumed == 0
        assert balance.available == 100

    async def test_release_frees_quota(self, service: LedgerService) -> None:
        """⚠️ **不用了就释放**。"""
        await service.credit(1, 100)
        reservation = await service.reserve(1, 40)

        await service.release(1, reservation.reservation_id)

        balance = await service.balance(1)

        assert balance.reserved == 0
        assert balance.available == 100

    async def test_settle_unknown_reservation_raises(self, service: LedgerService) -> None:
        """⚠️ **结算不存在的预占要报错**。"""
        await service.credit(1, 100)

        with pytest.raises(ReservationNotFoundError):
            await service.settle(1, "ghost-res", 10)

    async def test_release_unknown_reservation_raises(self, service: LedgerService) -> None:
        """释放不存在的预占要报错。"""
        with pytest.raises(ReservationNotFoundError):
            await service.release(1, "ghost-res")

    async def test_reserve_rejects_non_positive(self, service: LedgerService) -> None:
        """⚠️ **预占金额必须大于 0**。"""
        with pytest.raises(ValueError, match="大于 0"):
            await service.reserve(1, 0)

    async def test_reserve_blocks_concurrent_tasks(self, service: LedgerService) -> None:
        """⚠️ **预占能防「同时开 100 个任务」**。

        不预占的话，每个任务都以为自己有额度。
        """
        await service.credit(1, 100)

        await service.reserve(1, 80)

        # ⚠️ **只剩 20 了** —— 第二个任务预占 50 应该失败
        with pytest.raises(InsufficientBalanceError):
            await service.reserve(1, 50)


class TestBalance:
    """余额."""

    async def test_balance_of_unknown_account_is_zero(self, service: LedgerService) -> None:
        """⚠️ **新用户的余额是 0** —— 不是报错。"""
        balance = await service.balance(999)

        assert balance.total == 0
        assert balance.available == 0

    async def test_balance_is_exhausted(self, service: LedgerService) -> None:
        """额度用光的判断。"""
        await service.credit(1, 100)
        await service.debit(1, 100)

        balance = await service.balance(1)

        assert balance.is_exhausted()
        assert not balance.can_afford(1)

    async def test_balance_can_afford(self, service: LedgerService) -> None:
        """够不够的判断。"""
        await service.credit(1, 100)

        balance = await service.balance(1)

        assert balance.can_afford(100)
        assert not balance.can_afford(101)
