# scholar-billing

scholarspace 计费服务 —— **账本是唯一真相源**。

## 为什么账本是只追加的

⚠️ **可变状态会跟流水对不上**：

```python
# ❌ 可变状态 —— 并发扣费时丢更新、失败重试时重复扣
account.balance -= 100
```

```python
# ✅ 只追加的账本 —— 余额算出来
entries = [credit(100), debit(-30)]
balance = sum(e.amount for e in entries)
```

⚠️ **记错了不能改** —— 要写一条「冲正」条目（reversal），
原来的还在。审计要求原样保留。

## 金额用整数

⚠️ `0.1 + 0.2 != 0.3`。金额一律用**最小单位**的整数（比如「分」）。

## 预占（reservation）

⚠️ **预占不是扣款** —— 用户点了「生成 PPT」，
先冻结预估额度，实际消耗按真实用量结算，多出来的释放。

⚠️ **不预占的话**，用户可以同时开 100 个任务，
额度根本不够，但每个任务都以为自己有额度。

```python
reservation = await service.reserve(owner_id=1, amount=100)
entry = await service.settle(
    owner_id=1, reservation_id=reservation.reservation_id, actual_amount=60
)
# 实际扣 60，释放 40
```

## 幂等

⚠️ **同一个 `idempotency_key` 重复提交只记一次** ——
这是重试安全的前提。

```python
await service.debit(1, 100, idempotency_key="req-abc")
await service.debit(1, 100, idempotency_key="req-abc")  # 不重复扣
```
