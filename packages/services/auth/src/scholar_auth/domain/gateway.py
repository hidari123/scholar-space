"""网关签名校验 —— 让「能直连后端」不再等于「能伪造身份」。

⚠️ 背景（nanobuddy 的短板）：

   nanobuddy 用明文 header 传管理员身份：

       r.Header.Set("X-AtomOS-Admin", "true")

   它自己的文档写明了这个风险：

       "Directly supplying those headers to an Agent server for
        ordinary application traffic forges identity."

   也就是说 —— **只要能直连后端，就能当管理员**。
   nanobuddy 靠网络隔离防这个，但我们不能只靠这个。

---

## 本方案

网关验证完 token 后，注入**带签名**的 header：

       X-Scholar-User-Id: <uuid>
       X-Scholar-Roles: admin,editor
       X-Scholar-Ts: <unix ts>
       X-Scholar-Sig: <HMAC-SHA256(user_id:roles:ts, GATEWAY_SECRET)>

下游服务用同一把密钥验签：

       ① 时间戳在 60 秒窗口内  → 防重放
       ② HMAC 匹配              → 防伪造
       ③ 角色符合预期            → 防越权
"""

from __future__ import annotations

import hmac
import time
from dataclasses import dataclass
from hashlib import sha256
from uuid import UUID

__all__ = [
    "DEFAULT_SIGNATURE_TTL",
    "GatewayHeaders",
    "GatewaySignatureError",
    "GatewaySignatureExpiredError",
    "sign_gateway_headers",
    "verify_gateway_signature",
]

#: 签名有效期（秒）—— 超时的签名一律拒绝，防止重放
DEFAULT_SIGNATURE_TTL = 60


class GatewaySignatureError(Exception):
    """网关签名无效。"""


class GatewaySignatureExpiredError(GatewaySignatureError):
    """网关签名已过期。"""


@dataclass(frozen=True, slots=True)
class GatewayHeaders:
    """网关传递的身份头。"""

    user_id: str
    roles: str
    timestamp: str
    signature: str

    @property
    def role_list(self) -> list[str]:
        """角色列表。"""
        if not self.roles:
            return []
        return [role.strip() for role in self.roles.split(",") if role.strip()]


def _sign(payload: str, secret: str) -> str:
    """计算 HMAC-SHA256 签名。

    ⚠️ 用 `compare_digest` 比较 —— 防时序攻击。
    """
    return hmac.new(
        secret.encode("utf8"),
        payload.encode("utf8"),
        sha256,
    ).hexdigest()


def sign_gateway_headers(
    user_id: UUID | str,
    roles: list[str] | tuple[str, ...],
    secret: str,
    timestamp: int | None = None,
) -> GatewayHeaders:
    """生成网关签名头。

    ⚠️ **只有网关能调用这个** —— 下游服务只调用 verify。

    Args:
        user_id: 用户 ID
        roles: 角色列表
        secret: 网关密钥
        timestamp: Unix 时间戳（默认当前）

    Returns:
        可直接放进 HTTP header 的值
    """
    if not secret:
        raise ValueError("网关密钥不能为空")

    user_id_str = str(user_id)
    roles_str = ",".join(roles)
    ts = str(timestamp if timestamp is not None else int(time.time()))

    signature = _sign(f"{user_id_str}:{roles_str}:{ts}", secret)

    return GatewayHeaders(
        user_id=user_id_str,
        roles=roles_str,
        timestamp=ts,
        signature=signature,
    )


def verify_gateway_signature(
    headers: GatewayHeaders,
    secret: str,
    ttl: int = DEFAULT_SIGNATURE_TTL,
    expected_user_id: UUID | str | None = None,
    now: float | None = None,
) -> None:
    """校验网关签名。

    校验三件事：
      ① 时间戳在有效期内 —— 防重放
      ② HMAC 匹配        —— 防伪造
      ③ user_id 一致      —— 防串号

    Args:
        headers: 从 HTTP 头解析出的签名
        secret: 网关密钥
        ttl: 有效期（秒）
        expected_user_id: 期望的用户 ID（从别处解析时用来比对）
        now: 当前时间（测试注入用）

    Raises:
        GatewaySignatureExpiredError: 签名过期
        GatewaySignatureError: 签名不匹配 / 字段缺失
    """
    if not secret:
        raise GatewaySignatureError("网关密钥未配置")

    # ── 字段完整性 ────────────────────────────────────────
    if not headers.user_id or not headers.timestamp or not headers.signature:
        raise GatewaySignatureError("签名头不完整")

    # ── ① 时间戳窗口 ─────────────────────────────────────
    try:
        signed_at = int(headers.timestamp)
    except ValueError as error:
        raise GatewaySignatureError("时间戳格式非法") from error

    current = now if now is not None else time.time()
    age = current - signed_at

    if age > ttl:
        raise GatewaySignatureExpiredError(f"签名已过期（{int(age)} 秒前）")

    # ⚠️ 未来时间戳也要拒 —— 否则可以签一个「永远不过期」的时间
    if age < -ttl:
        raise GatewaySignatureError("时间戳在未来")

    # ── ② 签名匹配 ───────────────────────────────────────
    expected = _sign(f"{headers.user_id}:{headers.roles}:{headers.timestamp}", secret)
    if not hmac.compare_digest(expected, headers.signature):
        raise GatewaySignatureError("签名不匹配")

    # ── ③ user_id 一致 ───────────────────────────────────
    if expected_user_id is not None and str(expected_user_id) != headers.user_id:
        raise GatewaySignatureError("user_id 不一致")
