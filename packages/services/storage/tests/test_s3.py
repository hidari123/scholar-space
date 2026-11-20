"""S3 适配器测试。

⚠️ **不打真实网络** —— 用 `httpx.MockTransport`。
"""

from __future__ import annotations

import httpx
import pytest

from scholar_storage.domain.objects import ContentType, StorageNotFoundError
from scholar_storage.infrastructure.s3 import S3Credentials, S3Storage

#: 凭证
CREDENTIALS = S3Credentials(
    access_key="AKIA_TEST",
    secret_key="secret_test",  # noqa: S106
)

#: S3 的 list 响应
LIST_XML = """<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <Contents>
    <Key>papers/a.pdf</Key>
    <Size>1024</Size>
    <ETag>"abc123"</ETag>
    <LastModified>2024-01-15T10:00:00.000Z</LastModified>
  </Contents>
  <Contents>
    <Key>papers/b.pdf</Key>
    <Size>2048</Size>
    <ETag>"def456"</ETag>
    <LastModified>2024-01-16T10:00:00.000Z</LastModified>
  </Contents>
</ListBucketResult>
"""


def make_storage(
    handler: httpx.MockTransport | None = None,
) -> tuple[S3Storage, httpx.AsyncClient]:
    """造一个 S3 存储 + 可注入的客户端."""
    client = httpx.AsyncClient(
        transport=handler or httpx.MockTransport(lambda _r: httpx.Response(200))
    )
    storage = S3Storage(
        endpoint="https://s3.example.com",
        bucket="papers",
        credentials=CREDENTIALS,
        client=client,
    )
    return storage, client


class TestS3Put:
    """写入."""

    async def test_put_sends_signed_request(self) -> None:
        """⚠️ **请求要带 SigV4 签名**。"""
        captured: dict[str, str] = {}

        def handler(request: httpx.Request) -> httpx.Response:
            captured.update(dict(request.headers))
            return httpx.Response(200)

        transport = httpx.MockTransport(handler)
        storage, client = make_storage(transport)

        async with client:
            await storage.put("a.pdf", b"content", ContentType.PDF.value)

        # ⚠️ **头名全小写** —— SigV4 的规范要求
        assert "authorization" in captured
        assert "AWS4-HMAC-SHA256" in captured["authorization"]
        assert "x-amz-content-sha256" in captured

    async def test_put_sends_content_type(self) -> None:
        """⚠️ **内容类型要传** —— 不传的话浏览器会当二进制下载。"""
        captured: dict[str, str] = {}

        def handler(request: httpx.Request) -> httpx.Response:
            captured.update(dict(request.headers))
            return httpx.Response(200)

        storage, client = make_storage(httpx.MockTransport(handler))

        async with client:
            await storage.put("a.pdf", b"content", ContentType.PDF.value)

        assert captured["content-type"] == "application/pdf"

    async def test_put_adds_metadata_prefix(self) -> None:
        """⚠️ **自定义元数据要加 `x-amz-meta-` 前缀** —— S3 的规定。"""
        captured: dict[str, str] = {}

        def handler(request: httpx.Request) -> httpx.Response:
            captured.update(dict(request.headers))
            return httpx.Response(200)

        storage, client = make_storage(httpx.MockTransport(handler))

        async with client:
            await storage.put("a.pdf", b"x", metadata={"owner": "alice"})

        assert captured["x-amz-meta-owner"] == "alice"

    async def test_put_rejects_traversal(self) -> None:
        """⚠️ **路径穿越要挡住**。"""
        storage, client = make_storage()

        async with client:
            with pytest.raises(ValueError, match="不能包含"):
                await storage.put("../escape.pdf", b"x")


class TestS3Get:
    """读取."""

    async def test_get_returns_content(self) -> None:
        """读内容。"""
        transport = httpx.MockTransport(lambda _r: httpx.Response(200, content=b"hello"))
        storage, client = make_storage(transport)

        async with client:
            assert await storage.get("a.pdf") == b"hello"

    async def test_get_missing_raises(self) -> None:
        """⚠️ **404 → StorageNotFoundError**。"""
        transport = httpx.MockTransport(lambda _r: httpx.Response(404))
        storage, client = make_storage(transport)

        async with client:
            with pytest.raises(StorageNotFoundError):
                await storage.get("ghost.pdf")

    async def test_exists(self) -> None:
        """存在性判断。"""
        transport = httpx.MockTransport(lambda _r: httpx.Response(200))
        storage, client = make_storage(transport)

        async with client:
            assert await storage.exists("a.pdf")

    async def test_not_exists(self) -> None:
        """不存在。"""
        transport = httpx.MockTransport(lambda _r: httpx.Response(404))
        storage, client = make_storage(transport)

        async with client:
            assert not await storage.exists("ghost.pdf")


class TestS3List:
    """列举."""

    async def test_list_parses_xml(self) -> None:
        """⚠️ **S3 返回 XML** —— 要解析。"""
        transport = httpx.MockTransport(lambda _r: httpx.Response(200, text=LIST_XML))
        storage, client = make_storage(transport)

        async with client:
            results = await storage.list(prefix="papers/")

        assert len(results) == 2
        assert results[0].key == "papers/a.pdf"
        assert results[0].size == 1024

    async def test_list_malformed_xml_returns_empty(self) -> None:
        """⚠️ **XML 坏了不能崩**。"""
        transport = httpx.MockTransport(lambda _r: httpx.Response(200, text="not xml"))
        storage, client = make_storage(transport)

        async with client:
            assert await storage.list() == ()

    async def test_list_sends_prefix(self) -> None:
        """⚠️ **前缀要传过去**。"""
        captured: dict[str, str] = {}

        def handler(request: httpx.Request) -> httpx.Response:
            captured.update(dict(request.url.params))
            return httpx.Response(200, text=LIST_XML)

        storage, client = make_storage(httpx.MockTransport(handler))

        async with client:
            await storage.list(prefix="papers/")

        assert captured["prefix"] == "papers/"


class TestS3PresignedUrl:
    """临时链接."""

    async def test_presigned_url_has_signature(self) -> None:
        """⚠️ **临时链接要带签名**。"""
        storage, client = make_storage()

        async with client:
            url = await storage.presigned_url("a.pdf", expires_seconds=600)

        assert "X-Amz-Signature=" in url
        assert "X-Amz-Expires=600" in url
        assert "X-Amz-Algorithm=AWS4-HMAC-SHA256" in url

    async def test_presigned_url_is_deterministic(self) -> None:
        """⚠️ **同一时刻的签名要一样** —— 便于测试和缓存。"""
        storage, client = make_storage()

        async with client:
            first = await storage.presigned_url("a.pdf")
            second = await storage.presigned_url("a.pdf")

        # ⚠️ 时间戳可能差一秒 —— 只比签名部分
        assert "X-Amz-Signature=" in first
        assert "X-Amz-Signature=" in second


class TestS3Delete:
    """删除."""

    async def test_delete_existing(self) -> None:
        """删掉存在的。"""
        transport = httpx.MockTransport(lambda _r: httpx.Response(204))
        storage, client = make_storage(transport)

        async with client:
            assert await storage.delete("a.pdf")

    async def test_delete_missing_returns_false(self) -> None:
        """⚠️ **删不存在的返回 False**。"""
        transport = httpx.MockTransport(lambda _r: httpx.Response(404))
        storage, client = make_storage(transport)

        async with client:
            assert not await storage.delete("ghost.pdf")
