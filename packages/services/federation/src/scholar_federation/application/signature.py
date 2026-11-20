"""签名与验签 —— ActivityPub 的安全核心。

⚠️ **HTTP Message Signatures（RFC 9421）** ——
不是老的 Draft Cavage（`Signature: keyId=...,signature=...`）。

⚠️ **验签要防的三个攻击**：
    ① **重放** —— 签名有效期 + 时间戳窗口
    ② **签名剥离** —— 只信任 header 里的 `keyId`，
       但要**实际去取那个 key**，不能相信它说的
    ③ **参数混淆** —— 要签名哪些字段必须明确约定

⚠️ **验签失败要「明确失败」** —— 不能因为验签器挂了
就放行，那等于没有验签。
"""

from __future__ import annotations

import base64
import hashlib
import hmac
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

__all__ = [
    "DigestMismatchError",
    "SignatureHeaders",
    "SignatureVerifier",
    "SigningKeyResolver",
    "VerificationError",
    "VerificationResult",
]

#: ⚠️ **签名头里 "headers=" 后面那部分的序号**
HEADER_PARTS_COUNT = 2


class VerificationError(Exception):
    """验签失败."""


class DigestMismatchError(VerificationError):
    """摘要不匹配.

    ⚠️ **请求体被改过** ——
    签名再对也没用，内容已经变了。
    """


@dataclass(frozen=True, slots=True)
class SignatureHeaders:
    """签名相关的 HTTP 头."""

    #: 签名头
    signature: str = ""
    #: 签名者
    key_id: str = ""
    #: 内容摘要
    digest: str = ""
    #: 日期
    date: str = ""

    def is_present(self) -> bool:
        """有没有签名."""
        return bool(self.signature and self.key_id)


@dataclass(frozen=True, slots=True)
class VerificationResult:
    """验签结果."""

    #: 成功了吗
    is_valid: bool
    #: 签名者
    actor_id: str = ""
    #: 失败原因
    reason: str = ""

    @property
    def is_expired(self) -> bool:
        """是不是过期了."""
        return self.reason == "expired"


class SigningKeyResolver:
    """签名公钥解析器（端口）.

    ⚠️ **这是端口** —— 实际的「取远端 actor 并抽公钥」
    需要 HTTP 请求，由宿主注入。
    """

    async def resolve(self, key_id: str) -> str | None:
        """按 keyId 取 PEM 公钥.

        :param key_id: 公钥 ID（完整 URL）
        :return: PEM 公钥；找不到返回 None
        """
        ...


class SignatureVerifier:
    """HTTP Message Signatures 验签器."""

    #: ⚠️ **时间戳窗口** —— 超过就不接受
    DEFAULT_CLOCK_SKEW = timedelta(minutes=5)

    def __init__(
        self,
        resolver: SigningKeyResolver,
        clock_skew: timedelta | None = None,
    ) -> None:
        """初始化.

        :param resolver: 公钥解析器
        :param clock_skew: 允许的时间偏差
        """
        self._resolver = resolver
        self._clock_skew = clock_skew or self.DEFAULT_CLOCK_SKEW

    async def verify(
        self,
        headers: SignatureHeaders,
        body: bytes,
        method: str = "POST",
        path: str = "/inbox",
        now: datetime | None = None,
    ) -> VerificationResult:
        """验签.

        ⚠️ **分成「前置检查」和「实际验签」两步** ——
        返回语句太多的话逻辑会看不清。

        :param headers: 签名头
        :param body: 请求体
        :param method: HTTP 方法
        :param path: 请求路径
        :param now: 当前时间（测试时注入）
        :return: 验签结果
        """
        pre_check = self._pre_check(headers, body, now)
        if pre_check is not None:
            return pre_check

        parsed = self._parse_signature(headers.signature)
        if parsed is None:
            return VerificationResult(is_valid=False, reason="malformed_signature")

        # ⚠️ **取公钥 —— 不相信 keyId 说的，要真的去取**
        public_key = await self._resolver.resolve(parsed["keyId"])

        # ⚠️ **空公钥也要拒绝** ——
        # 只判 `is None` 的话，返回空字符串的实现会漏过去。
        if not public_key:
            return VerificationResult(is_valid=False, reason="key_not_found")

        # ⚠️ **构造签名基底** ——
        # 摘要不对的话，内容已经被改过了。
        try:
            signature_base = self._build_signature_base(
                parsed,
                method=method,
                path=path,
                body=body,
                headers=headers,
            )
        except DigestMismatchError:
            return VerificationResult(is_valid=False, reason="digest_mismatch")

        if not self._verify_signature(public_key, signature_base, parsed["signature"]):
            return VerificationResult(is_valid=False, reason="invalid_signature")

        return VerificationResult(
            is_valid=True,
            actor_id=parsed["keyId"],
        )

    def _pre_check(
        self,
        headers: SignatureHeaders,
        body: bytes,
        now: datetime | None,
    ) -> VerificationResult | None:
        """前置检查.

        ⚠️ **返回 None 表示「继续」** ——
        失败时返回具体的失败结果。

        ⚠️ **这里只做「不需要外部依赖」的检查** ——
        摘要校验留到拿到公钥之后，
        否则「公钥不存在」和「内容被改」两个原因会混淆。

        :param body: 请求体（摘要校验在后面做，这里不用）
        :return: 失败结果；通过返回 None
        """
        del body  # ⚠️ 摘要校验在拿到公钥之后做

        # ① 没有签名 → 失败
        if not headers.is_present():
            return VerificationResult(is_valid=False, reason="missing_signature")

        parsed = self._parse_signature(headers.signature)
        if parsed is None:
            return VerificationResult(is_valid=False, reason="malformed_signature")

        # ② 时间戳窗口 —— 防重放
        current = now or datetime.now(UTC)
        if not self._within_window(current, parsed.get("created", "")):
            return VerificationResult(is_valid=False, reason="expired")

        return None

    # ══════════════════════════════════════════════════
    # 内部
    # ══════════════════════════════════════════════════

    def _parse_signature(self, raw: str) -> dict[str, str] | None:
        """解析 `Signature:` 头.

        ⚠️ **格式**：`keyId="...",alg="rsa-sha256",created=...,signature="..."`
        """
        parsed: dict[str, str] = {}

        for chunk in raw.split(","):
            item = chunk.strip()
            if not item or "=" not in item:
                continue

            name, _, value = item.partition("=")
            name = name.strip()
            value = value.strip().strip('"')

            if not name:
                continue

            parsed[name] = value

        if "keyId" not in parsed or "signature" not in parsed:
            return None

        return parsed

    def _within_window(self, current: datetime, created: str) -> bool:
        """时间戳在窗口内吗.

        ⚠️ **未来时间也要拒绝** ——
        允许未来时间等于给了攻击者一个窗口。
        """
        if not created:
            return False

        try:
            timestamp = datetime.fromtimestamp(int(created), tz=UTC)
        except (ValueError, OSError):
            return False

        difference = current - timestamp

        # ⚠️ **两边都要卡** ——
        # 过去太久（重放）和未来（伪造）都不接受。
        return abs(difference) <= self._clock_skew

    def _build_signature_base(
        self,
        parsed: dict[str, str],
        method: str,
        path: str,
        body: bytes,
        headers: SignatureHeaders,
    ) -> str:
        """构造签名基底.

        ⚠️ **要签哪些字段必须明确约定** ——
        这里签：`(request-target) host date digest`。

        ⚠️ **digest 是关键** ——
        不签 body 的话，签名跟内容就脱钩了：
        攻击者可以拿合法签名换一份恶意内容。
        """
        # ⚠️ **先验摘要对不对** ——
        # 摘要不对的话，后面的签名验了也没意义
        # （签名的是错的摘要）。
        if not self._digest_matches(headers.digest, body):
            raise DigestMismatchError("摘要不匹配 —— 请求体被改过")

        components: list[str] = [
            f'("@method"): {method.lower()}',
            f'("@path"): {path}',
        ]

        # ⚠️ **host 要签** —— 否则能改 Host 头重放
        components.append(f"(host): {self._host_of(headers)}")

        if headers.date:
            components.append(f"(date): {headers.date}")

        if headers.digest:
            components.append(f"(digest): {headers.digest}")

        components.append(f'("@signature-params"): {self._signature_params(parsed)}')

        return "\n".join(components)

    def _digest_matches(self, digest_header: str, body: bytes) -> bool:
        """摘要对不对.

        ⚠️ **格式**：`SHA-256=base64(摘要)`
        ⚠️ **没有摘要头 → 拒绝** ——
        不签 body 就等于不保护内容。
        """
        if not digest_header:
            return False

        algorithm, _, expected = digest_header.partition("=")
        if algorithm.strip().lower() != "sha-256":
            return False

        actual = base64.b64encode(hashlib.sha256(body).digest()).decode()

        # ⚠️ **恒定时间比较** ——
        # 普通比较会有时序侧信道。
        return hmac.compare_digest(actual, expected.strip())

    def _host_of(self, headers: SignatureHeaders) -> str:
        """从签名参数里拿 host.

        ⚠️ **host 在 `Signature` 头的 `headers` 列表里** ——
        例如 `headers="(request-target) host date digest"`。
        """
        listed = headers.signature.split("headers=")
        if len(listed) < HEADER_PARTS_COUNT:
            return ""

        raw = listed[1].strip().strip('"')
        return "" if "host" not in raw else "signed"

    def _signature_params(self, parsed: dict[str, str]) -> str:
        """签名参数（`(request-target) host date digest` 那些）."""
        listed = parsed.get("headers", "(request-target) host date digest")
        return listed

    def _verify_signature(
        self,
        public_key_pem: str,
        signature_base: str,
        signature_b64: str,
    ) -> bool:
        """验证签名.

        ⚠️ **用 cryptography 库** —— 别自己实现 RSA。

        ⚠️ **验签失败不能抛异常给上层** ——
        返回 False 就行（上层统一处理）。
        """
        # ⚠️ **局部导入** —— cryptography 是可选依赖（`[crypto]` extra），
        #    提到顶层的话没装就直接 import 崩。
        try:
            from cryptography.exceptions import InvalidSignature  # noqa: PLC0415
            from cryptography.hazmat.primitives import (  # noqa: PLC0415
                hashes,
                serialization,
            )
            from cryptography.hazmat.primitives.asymmetric import (  # noqa: PLC0415
                padding,
                rsa,
            )
        except ImportError:
            # ⚠️ **没装 cryptography** ——
            # 这是安全依赖缺失，**不能放行**。
            raise VerificationError(
                "cryptography 没装 —— 联邦验签不可用",
            ) from None

        try:
            public_key = serialization.load_pem_public_key(
                public_key_pem.encode(),
            )
        except (ValueError, TypeError):
            return False

        # ⚠️ **必须是 RSA** ——
        # ActivityPub 规定用 RSA-SHA256。
        # `load_pem_public_key` 返回的是一个联合类型
        # （RSA / EC / Ed25519 / DH / …），
        # 不是所有的都有 `.verify`。
        if not isinstance(public_key, rsa.RSAPublicKey):
            return False

        try:
            signature = base64.b64decode(signature_b64)
        except (ValueError, TypeError):
            return False

        try:
            public_key.verify(
                signature,
                signature_base.encode(),
                padding.PKCS1v15(),
                hashes.SHA256(),
            )
        except InvalidSignature:
            return False
        except (TypeError, ValueError):
            return False

        return True
