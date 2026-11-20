"""组装根 —— 把基础设施实现接到应用层端口上。

⚠️ **为什么要有这个模块** ——
   `interfaces`（HTTP 路由）**不许** import `infrastructure`。
   路由只认「一个能拿到 `AuthContext` 的依赖」，
   具体用内存实现还是 PostgreSQL，由这里决定。

⚠️ **这就是「端口在应用层，实现在基础设施层」的价值** ——
   路由代码一行都不用改，换实现只改这一处。

⚠️ **放在包的最外层** —— 它不属于任何一层，
   是把所有层拼起来的地方（composition root）。
"""

from __future__ import annotations

from scholar_auth.application.use_cases import AuthContext
from scholar_auth.infrastructure.memory import (
    AuthRepositories,
    InMemoryAccountRepository,
    InMemoryAuditRepository,
    InMemoryGrantRepository,
)

__all__ = ["build_auth_context"]


def build_auth_context() -> AuthContext:
    """组装用例上下文.

    ⚠️ **默认是内存实现** —— 生产环境在这里换成 PostgreSQL 仓储。
    路由和其他层都不需要改。

    ⚠️ **用 `functools.cache` 做单例** ——
       比 global 干净，不会有并发初始化的竞态。
       测试通过 `dependency_overrides` 覆盖。
    """
    repositories = AuthRepositories(
        accounts=InMemoryAccountRepository(),
        grants=InMemoryGrantRepository(),
        audit=InMemoryAuditRepository(),
    )

    return AuthContext(
        grants=repositories.grants,
        accounts=repositories.accounts,
        audit=repositories.audit,
    )
