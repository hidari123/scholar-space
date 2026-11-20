"""S3 兼容实现 —— AWS S3 / MinIO 都能用。

⚠️ **为什么不用 `boto3`** ——
   boto3 是同步的，用在异步服务里要包线程池，
   而且它很重（依赖多、启动慢）。

⚠️ **用 `httpx` + AWS SigV4 签名** ——
   依赖少、纯异步、行为可预测。

⚠️ **SigV4 签名很繁琐但必须自己做** ——
   MinIO 和 S3 都要求，
   签名错了返回 403。
"""

from __future__ import annotations

import hashlib
import hmac
from collections.abc import AsyncIterator
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from urllib.parse import quote
from xml.etree import ElementTree

import httpx
from defusedxml import ElementTree as DefusedElementTree

from scholar_storage.domain.objects import (
    ContentType,
    ObjectInfo,
    ObjectKey,
    StorageNotFoundError,
    validate_key,
)
from scholar_storage.infrastructure.borrowed import BorrowedClient

__all__ = ["S3Credentials", "S3Storage"]

#: ⚠️ **HTTP 404** —— 对象不存在
HTTP_NOT_FOUND = 404

#: ⚠️ **HTTP 200** —— 成功
HTTP_OK = 200


@dataclass(frozen=True, slots=True)
class S3Credentials:
    """S3 凭证.

    ⚠️ **单独一个 dataclass** ——
    构造函数的参数不能超过 5 个（ruff PLR0913）。
    """

    #: 访问密钥
    access_key: str
    #: 私密密钥
    secret_key: str


class S3Storage:
    """S3 兼容对象存储.

    ⚠️ **同时支持 S3 和 MinIO** ——
    差别只是 endpoint 和 region。
    """

    def __init__(
        self,
        endpoint: str,
        bucket: str,
        credentials: S3Credentials,
        region: str = "us-east-1",
        client: httpx.AsyncClient | None = None,
    ) -> None:
        """初始化.

        :param endpoint: 服务地址（`https://s3.amazonaws.com` 或 `http://minio:9000`）
        :param bucket: 桶名
        :param credentials: 凭证
        :param region: 区域
        :param client: HTTP 客户端（注入以便测试）
        """
        self._endpoint = endpoint.rstrip("/")
        self._bucket = bucket
        self._credentials = credentials
        self._region = region
        self._client = client
        self._owns_client = client is None

    @property
    def _access_key(self) -> str:
        """访问密钥。"""
        return self._credentials.access_key

    @property
    def _secret_key(self) -> str:
        """私密密钥。"""
        return self._credentials.secret_key

    # ══════════════════════════════════════════════════
    # 写
    # ══════════════════════════════════════════════════

    async def put(
        self,
        key: ObjectKey,
        data: bytes,
        content_type: str = ContentType.BINARY.value,
        metadata: dict[str, str] | None = None,
    ) -> ObjectInfo:
        """写入对象."""
        validate_key(key)

        headers = {
            "Content-Type": content_type,
            "x-amz-content-sha256": hashlib.sha256(data).hexdigest(),
        }
        if metadata:
            # ⚠️ **自定义元数据要加前缀** —— S3 的规定
            headers.update({f"x-amz-meta-{name}": value for name, value in metadata.items()})

        await self._request("PUT", key, data=data, headers=headers)

        return ObjectInfo(
            key=key,
            size=len(data),
            content_type=content_type,
            etag=hashlib.sha256(data).hexdigest()[:32],
            last_modified=datetime.now(UTC).isoformat(),
            metadata=dict(metadata) if metadata else {},
        )

    # ══════════════════════════════════════════════════
    # 读
    # ══════════════════════════════════════════════════

    async def get(self, key: ObjectKey) -> bytes:
        """读对象.

        :raises StorageNotFoundError: 不存在
        """
        validate_key(key)

        response = await self._request("GET", key)

        if response.status_code == HTTP_NOT_FOUND:
            raise StorageNotFoundError(f"对象不存在：{key}")

        response.raise_for_status()
        return response.content

    async def get_info(self, key: ObjectKey) -> ObjectInfo:
        """取元数据（HEAD，不下载内容）."""
        validate_key(key)

        response = await self._request("HEAD", key)

        if response.status_code == HTTP_NOT_FOUND:
            raise StorageNotFoundError(f"对象不存在：{key}")

        response.raise_for_status()

        return ObjectInfo(
            key=key,
            size=int(response.headers.get("Content-Length", 0)),
            content_type=response.headers.get(
                "Content-Type",
                ContentType.BINARY.value,
            ),
            etag=response.headers.get("ETag", "").strip('"'),
            last_modified=response.headers.get("Last-Modified", ""),
        )

    async def exists(self, key: ObjectKey) -> bool:
        """对象是否存在."""
        validate_key(key)

        response = await self._request("HEAD", key)
        return response.status_code == HTTP_OK

    async def delete(self, key: ObjectKey) -> bool:
        """删除对象.

        :return: 是否真的删了
        """
        validate_key(key)

        response = await self._request("DELETE", key)

        # ⚠️ **DELETE 对不存在的对象也返回 204** ——
        # 所以要先 HEAD 一下才知道是不是真删了。
        if response.status_code == HTTP_NOT_FOUND:
            return False

        response.raise_for_status()
        return True

    async def list(
        self,
        prefix: str = "",
        limit: int = 100,
    ) -> tuple[ObjectInfo, ...]:
        """列出对象.

        ⚠️ **S3 的 list 是分页的** ——
        这里只取第一页（最多 1000 个）。
        """
        query = f"list-type=2&max-keys={limit}"
        if prefix:
            query += f"&prefix={quote(prefix)}"

        response = await self._request("GET", "", query=query)
        response.raise_for_status()

        return self._parse_list(response.text)

    async def stream(
        self,
        key: ObjectKey,
        chunk_size: int = 65536,
    ) -> AsyncIterator[bytes]:
        """流式读对象.

        ⚠️ **用 `aiter_bytes`** —— 不一次性进内存。
        """
        validate_key(key)

        async with (
            self._ensure_client() as client,
            client.stream("GET", self._url(key)) as response,
        ):
            if response.status_code == HTTP_NOT_FOUND:
                raise StorageNotFoundError(f"对象不存在：{key}")

            response.raise_for_status()

            async for chunk in response.aiter_bytes(chunk_size):
                yield chunk

    async def presigned_url(self, key: ObjectKey, expires_seconds: int = 3600) -> str:
        """生成临时下载链接.

        ⚠️ **签名方式跟普通请求不同** ——
        临时链接把签名放进 query string，
        不发 `Authorization` 头。
        """
        validate_key(key)

        now = datetime.now(UTC)
        stamp = now.strftime("%Y%m%dT%H%M%SZ")
        date = now.strftime("%Y%m%d")
        scope = f"{date}/{self._region}/s3/aws4_request"
        credential = f"{self._access_key}/{scope}"

        # ⚠️ **查询参数要按字典序** —— 签名算法要求
        query = (
            f"X-Amz-Algorithm=AWS4-HMAC-SHA256"
            f"&X-Amz-Credential={quote(credential)}"
            f"&X-Amz-Date={stamp}"
            f"&X-Amz-Expires={expires_seconds}"
            f"&X-Amz-SignedHeaders=host"
        )

        canonical_request = (
            f"GET\n{self._url_path(key)}\n{query}\nhost:{self._host()}\n\nhost\nUNSIGNED-PAYLOAD"
        )

        string_to_sign = f"AWS4-HMAC-SHA256\n{stamp}\n{scope}\n{self._sha256(canonical_request)}"

        signature = self._hmac(string_to_sign, date)

        return f"{self._url(key)}?{query}&X-Amz-Signature={signature}"

    async def usage(self) -> dict[str, int]:
        """用量统计.

        ⚠️ **S3 不直接给总用量** ——
        这里只能数当前这一页。
        """
        objects = await self.list(limit=1000)
        return {
            "objects": len(objects),
            "bytes": sum(item.size for item in objects),
        }

    # ══════════════════════════════════════════════════
    # 内部
    # ══════════════════════════════════════════════════

    async def _request(
        self,
        method: str,
        key: ObjectKey,
        data: bytes | None = None,
        headers: dict[str, str] | None = None,
        query: str = "",
    ) -> httpx.Response:
        """发一个签名的请求."""
        url = self._url(key)
        if query:
            url = f"{url}?{query}"

        request_headers = dict(headers or {})
        self._sign_request(method, url, request_headers, data)

        async with self._ensure_client() as client:
            response: httpx.Response = await client.request(
                method,
                url,
                content=data,
                headers=request_headers,
            )
            return response

    def _ensure_client(self) -> Any:
        """确保有 HTTP 客户端."""
        if self._client is not None:
            return BorrowedClient(self._client)

        return httpx.AsyncClient(timeout=60.0)

    def _url(self, key: ObjectKey) -> str:
        """对象 URL."""
        return f"{self._endpoint}/{self._bucket}/{quote(key)}"

    def _url_path(self, key: ObjectKey) -> str:
        """对象 URL 路径部分（签名用）."""
        return f"/{self._bucket}/{quote(key)}"

    def _host(self) -> str:
        """主机名（签名用）."""
        return self._endpoint.split("://", 1)[-1]

    def _sign_request(
        self,
        method: str,
        url: str,
        headers: dict[str, str],
        data: bytes | None,
    ) -> None:
        """加 SigV4 签名头.

        ⚠️ **就地修改 headers** —— 调用方传的字典。

        ⚠️ **头名要全小写** ——
        SigV4 的规范要求头名小写排序。
        ⚠️ **而且查找也必须用小写** ——
        只把「排序用的列表」小写，但查找时用原样，
        遇到 `Content-Type` 这种就会 `KeyError`。
        """
        now = datetime.now(UTC)
        stamp = now.strftime("%Y%m%dT%H%M%SZ")
        date = now.strftime("%Y%m%d")

        # ⚠️ **先全部小写** —— 后续的查找和排序都用小写名
        normalized = {key.lower(): value for key, value in headers.items()}
        headers.clear()
        headers.update(normalized)

        payload_hash = headers.get(
            "x-amz-content-sha256",
            self._sha256(data or b""),
        )
        headers["x-amz-content-sha256"] = payload_hash
        headers["x-amz-date"] = stamp
        headers["host"] = self._host()

        signed_headers = sorted(headers)
        canonical_headers = "".join(f"{name}:{headers[name].strip()}\n" for name in signed_headers)
        signed_header_list = ";".join(signed_headers)

        canonical_request = (
            f"{method}\n"
            f"{self._path_of(url)}\n"
            f"{self._query_of(url)}\n"
            f"{canonical_headers}\n"
            f"{signed_header_list}\n"
            f"{payload_hash}"
        )

        scope = f"{date}/{self._region}/s3/aws4_request"
        string_to_sign = f"AWS4-HMAC-SHA256\n{stamp}\n{scope}\n{self._sha256(canonical_request)}"

        signature = self._hmac(string_to_sign, date)
        headers["Authorization"] = (
            f"AWS4-HMAC-SHA256 Credential={self._access_key}/{scope}, "
            f"SignedHeaders={signed_header_list}, Signature={signature}"
        )

    def _hmac(self, string_to_sign: str, date: str) -> str:
        """计算签名.

        ⚠️ **两个变量不能重名** ——
        `secret` 是字符串，`derived_key` 是字节。
        用同一个变量名会让类型在循环里「变形」，
        mypy 会报错（而且读代码的人也会懵）。
        """
        secret = f"AWS4{self._secret_key}"

        derived_key = secret.encode()
        for part in (date, self._region, "s3", "aws4_request"):
            derived_key = hmac.new(derived_key, part.encode(), hashlib.sha256).digest()

        signature: str = hmac.new(
            derived_key,
            string_to_sign.encode(),
            hashlib.sha256,
        ).hexdigest()
        return signature

    def _sha256(self, text: str | bytes) -> str:
        """SHA256 十六进制."""
        raw = text.encode() if isinstance(text, str) else text
        return hashlib.sha256(raw).hexdigest()

    def _path_of(self, url: str) -> str:
        """URL 的路径部分."""
        without_scheme = url.split("://", 1)[-1]
        slash = without_scheme.find("/")
        return without_scheme[slash:] if slash >= 0 else "/"

    def _query_of(self, url: str) -> str:
        """URL 的查询部分."""
        _, _, query = url.partition("?")
        return query

    def _parse_list(self, xml_text: str) -> tuple[ObjectInfo, ...]:
        """解析 list 响应（S3 返回 XML）.

        ⚠️ **用 defusedxml** ——
        S3 的响应是不可信输入（虽然是自己发的请求），
        XML 实体扩展攻击照样能用。
        """
        namespace = {"s3": "http://s3.amazonaws.com/doc/2006-03-01/"}

        try:
            root = DefusedElementTree.fromstring(xml_text)
        except ElementTree.ParseError:
            return ()

        results: list[ObjectInfo] = []

        for node in root.findall("s3:Contents", namespace):
            key_node = node.find("s3:Key", namespace)
            size_node = node.find("s3:Size", namespace)
            etag_node = node.find("s3:ETag", namespace)
            modified_node = node.find("s3:LastModified", namespace)

            if key_node is None or key_node.text is None:
                continue

            results.append(
                ObjectInfo(
                    key=key_node.text,
                    size=int(size_node.text) if size_node is not None and size_node.text else 0,
                    etag=(etag_node.text or "").strip('"') if etag_node is not None else "",
                    last_modified=(
                        modified_node.text
                        if modified_node is not None and modified_node.text
                        else ""
                    ),
                )
            )

        return tuple(results)
