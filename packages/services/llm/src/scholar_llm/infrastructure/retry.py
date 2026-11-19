"""重试策略 —— 只对可重试的错误重试。

⚠️ **为什么要有这一层**：

    LLM 调用失败的原因分两类：
    · 网络抖动、限流、5xx → 重试有意义
    · 401 鉴权失败、参数错、上下文超长 → 重试是**烧钱**

    所以重试逻辑必须看错误的 `retryable` 标志，
    而不是「捕获所有异常重试 N 次」。
"""

from __future__ import annotations

import asyncio
import random
from collections.abc import Awaitable, Callable
from typing import TypeVar

from scholar_llm.domain.errors import LLMProviderError, ProviderRateLimitError

__all__ = ["RetryPolicy", "with_retry"]

T = TypeVar("T")


class RetryPolicy:
    """重试策略。

    ⚠️ **指数退避 + 抖动** —— 固定间隔重试在限流时会火上浇油
       （所有客户端同时重试 → 再一次限流）。
    """

    def __init__(
        self,
        max_attempts: int = 3,
        base_delay: float = 0.5,
        max_delay: float = 8.0,
        jitter: bool = True,
    ) -> None:
        self.max_attempts = max_attempts
        self.base_delay = base_delay
        self.max_delay = max_delay
        self.jitter = jitter

    def delay_for(self, attempt: int, retry_after: float | None = None) -> float:
        """算第 N 次重试前等多久。

        :param attempt 从 0 开始的尝试序号
        :param retry_after 厂商指定的等待时间（有就优先用）
        """
        # ⚠️ 厂商说等多久就等多久 —— 它最清楚自己的限流窗口
        if retry_after is not None:
            return min(retry_after, self.max_delay)

        # ⚠️ 显式标注 float —— mypy --strict 会把
        #    `self.base_delay * (2**attempt)` 的结果推断成 Any
        #    （因为 2**attempt 在 attempt 为负时可能是 float），
        #    导致 no-any-return。标一次就够。
        delay: float = self.base_delay * (2**attempt)
        delay = min(delay, self.max_delay)

        if self.jitter:
            # ⚠️ 抖动 ±25% —— 打散重试，避免同时打厂商
            #    ⚠️ 用 `random` 而不是时钟 ——
            #    时钟的 `% 0.5` 在同一毫秒内会算出完全相同的值，
            #    那样就没有抖动效果了。随机源才是对的。
            #    ⚠️ S311（非密码学随机）在这里是**正确的** ——
            #    抖动只是打散重试时间，不需要不可预测性。
            #
            #    ⚠️ 必须显式 float() —— random.random() 的返回类型是 Any，
            #    直接参与运算会让 delay 变成 Any，
            #    mypy --strict 会报 no-any-return。
            jitter_factor = 0.75 + float(random.random()) * 0.5  # noqa: S311
            delay = delay * jitter_factor

        return delay


async def with_retry[T](
    operation: Callable[[], Awaitable[T]],
    policy: RetryPolicy | None = None,
) -> T:
    """带重试地执行操作。

    ⚠️ **只重试 `retryable=True` 的错误** ——
       不可重试的错误直接抛出去。

    :param operation 要执行的操作
    :param policy 重试策略
    :raises LLMProviderError: 最终失败
    """
    active = policy or RetryPolicy()
    last_error: Exception | None = None

    for attempt in range(active.max_attempts):
        try:
            return await operation()
        except LLMProviderError as exc:
            last_error = exc

            if not exc.retryable:
                # ⚠️ 不可重试 —— 立刻抛出，别烧钱
                raise

            if attempt == active.max_attempts - 1:
                # 最后一次了 —— 抛出去
                break

            retry_after = exc.retry_after if isinstance(exc, ProviderRateLimitError) else None
            await asyncio.sleep(active.delay_for(attempt, retry_after))

    # ⚠️ mypy 需要明确的 raise —— 循环正常结束不会到这里
    raise last_error or LLMProviderError("重试失败")
