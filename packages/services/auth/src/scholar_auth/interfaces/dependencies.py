"""FastAPI 依赖 —— 网关签名校验与主体构建。

⚠️ **这一层是「外部世界」与「内部领域」的边界**。

    外部请求（带签名头） → 依赖校验签名 → Principal（内部主体）

    没有通过校验的请求，**根本进不了路由**。
"""

from __future__ import annotations

import os
from collections.abc import Awaitable, Callable
from functools import cache
from typing import Annotated
from uuid import UUID

from fastapi import Depends, Header, HTTPException, status

from scholar_auth.domain.gateway import (
    DEFAULT_SIGNATURE_TTL,
    GatewayHeaders,
    GatewaySignatureError,
    GatewaySignatureExpiredError,
    verify_gateway_signature,
)
from scholar_auth.domain.models import Principal, RoleName, TenantScope, UserStatus

__all__ = [
    "GATEWAY_SECRET_ENV",
    "get_gateway_secret",
    "require_principal",
    "require_roles",
]

#: 网关密钥的环境变量名。
# ⚠️ S105（硬编码密码）在这里是**误报** ——
#    这是**环境变量名**，不是密码本身。
GATEWAY_SECRET_ENV = "SCHOLARSPAWN_GATEWAY_SECRET"  # noqa: S105


@cache
def get_gateway_secret() -> str:
    """取网关密钥。

    ⚠️ **没有默认值** —— 忘记配置就抛异常，不是用空字符串。

    空密钥意味着「任何人都能算出合法签名」——
    那比没有鉴权更危险（看起来有鉴权，实际没有）。

    Raises:
        RuntimeError: 环境变量未配置
    """
    secret = os.environ.get(GATEWAY_SECRET_ENV, "")
    if not secret:
        raise RuntimeError(f"网关密钥未配置：请设置环境变量 {GATEWAY_SECRET_ENV}")
    return secret


def _extract_headers(
    x_scholar_user_id: str | None,
    x_scholar_roles: str | None,
    x_scholar_ts: str | None,
    x_scholar_sig: str | None,
) -> GatewayHeaders:
    """把 HTTP 头组装成签名对象。"""
    return GatewayHeaders(
        user_id=x_scholar_user_id or "",
        roles=x_scholar_roles or "",
        timestamp=x_scholar_ts or "",
        signature=x_scholar_sig or "",
    )


async def require_principal(
    x_scholar_user_id: Annotated[str | None, Header()] = None,
    x_scholar_roles: Annotated[str | None, Header()] = None,
    x_scholar_ts: Annotated[str | None, Header()] = None,
    x_scholar_sig: Annotated[str | None, Header()] = None,
) -> Principal:
    """校验网关签名并构建主体。

    ⚠️ **这是所有受保护端点的依赖** —— 签名不通过就 401，
    请求根本进不了路由函数。

    Args:
        x_scholar_user_id: 用户 ID 头
        x_scholar_roles: 角色头
        x_scholar_ts: 时间戳头
        x_scholar_sig: 签名头

    Returns:
        已认证的主体

    Raises:
        HTTPException: 签名缺失 / 无效 / 过期
    """
    headers = _extract_headers(
        x_scholar_user_id,
        x_scholar_roles,
        x_scholar_ts,
        x_scholar_sig,
    )

    try:
        verify_gateway_signature(
            headers,
            secret=get_gateway_secret(),
            ttl=DEFAULT_SIGNATURE_TTL,
        )
    except GatewaySignatureExpiredError as error:
        # ⚠️ 过期单独处理 —— 客户端可以重新签名再试
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"网关签名已过期：{error}",
        ) from error
    except GatewaySignatureError as error:
        # ⚠️ 其他签名问题 —— 401，不告诉客户端具体哪里错了
        #    （告诉他「角色没对上」等于给攻击者调试信息）
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="网关签名无效",
        ) from error

    # 角色解析 —— 认不出的角色直接忽略（不报错）
    roles: list[RoleName] = []
    for role_name in headers.role_list:
        try:
            roles.append(RoleName(role_name))
        except ValueError:
            # ⚠️ 未知角色忽略 —— 向前兼容：
            #    新网关加了新角色时，旧服务不该整个挂掉
            continue

    # ⚠️ user_id 必须是合法 UUID —— 网关签名保证了「没被篡改」，
    #    但**不保证格式正确**（网关自己写错了也会到这）。
    #    解析失败要 401，不能让它变成 500。
    try:
        user_id = UUID(headers.user_id)
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="网关签名无效",
        ) from error

    return Principal(
        user_id=user_id,
        roles=frozenset(roles),
        tenant_scope=TenantScope(),
        status=UserStatus.ACTIVE,
    )


def require_roles(*required: RoleName) -> Callable[..., Awaitable[Principal]]:
    """生成「要求指定角色」的依赖。

    ⚠️ **角色检查在依赖层做，不在路由里** ——
       忘记加依赖的路由就是裸奔。

    Args:
        required: 需要的角色（任一即可）

    Returns:
        依赖函数
    """

    async def _dependency(
        principal: Annotated[Principal, Depends(require_principal)],
    ) -> Principal:
        """校验主体是否具备所需角色。

        Raises:
            HTTPException: 权限不足（403）
        """
        if not set(required) & set(principal.roles):
            names = ", ".join(item.value for item in required)
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"需要以下角色之一：{names}",
            )
        return principal

    return _dependency
