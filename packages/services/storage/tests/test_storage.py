"""存储服务测试。

⚠️ **重点验证「安全」和「语义一致性」**：
    · 路径穿越要挡住
    · 同键覆盖要幂等
    · 读不存在的要明确报错
"""

from __future__ import annotations

from pathlib import Path

import pytest

from scholar_storage.domain.objects import (
    ContentType,
    ObjectInfo,
    StorageNotFoundError,
    validate_key,
)
from scholar_storage.infrastructure.local import LocalFileStorage


@pytest.fixture
def storage(tmp_path: Path) -> LocalFileStorage:
    """本地存储."""
    return LocalFileStorage(tmp_path / "objects")


class TestValidateKey:
    """对象键校验."""

    @pytest.mark.parametrize(
        "key",
        [
            "papers/2024/a.pdf",
            "a.pdf",
            "a/b/c/d.txt",
            "论文/摘要.md",
        ],
    )
    def test_valid_keys(self, key: str) -> None:
        """⚠️ **正常键要通过**。"""
        assert validate_key(key) == key

    @pytest.mark.parametrize(
        "key",
        [
            "../etc/passwd",
            "papers/../../etc/passwd",
            "papers/../../../root",
            "..",
        ],
    )
    def test_rejects_path_traversal(self, key: str) -> None:
        """⚠️ **路径穿越必须挡住** —— 能读到别的租户的数据。"""
        with pytest.raises(ValueError, match="不能包含"):
            validate_key(key)

    def test_rejects_absolute_path(self) -> None:
        """绝对路径要挡住。"""
        with pytest.raises(ValueError, match="不能以"):
            validate_key("/etc/passwd")

    def test_rejects_empty_key(self) -> None:
        """空键要挡住。"""
        with pytest.raises(ValueError, match="不能为空"):
            validate_key("")

    def test_rejects_empty_segment(self) -> None:
        """⚠️ **空段要挡住** —— `a//b`。"""
        with pytest.raises(ValueError, match="空段"):
            validate_key("a//b")

    def test_rejects_control_characters(self) -> None:
        """⚠️ **控制字符要挡住** —— 会搞坏 HTTP 头和日志。"""
        with pytest.raises(ValueError, match="控制字符"):
            validate_key("a\nb.txt")

    def test_rejects_too_long_key(self) -> None:
        """太长的键要挡住。"""
        with pytest.raises(ValueError, match="太长"):
            validate_key("a" * 2000)


class TestPutGet:
    """读写."""

    async def test_put_then_get(self, storage: LocalFileStorage) -> None:
        """⚠️ **写完能读回来**。"""
        await storage.put("papers/a.pdf", b"content", ContentType.PDF.value)

        assert await storage.get("papers/a.pdf") == b"content"

    async def test_put_returns_info(self, storage: LocalFileStorage) -> None:
        """写入返回元数据。"""
        info = await storage.put("a.pdf", b"12345", ContentType.PDF.value)

        assert isinstance(info, ObjectInfo)
        assert info.size == 5
        assert info.content_type == ContentType.PDF.value
        assert info.etag

    async def test_put_is_idempotent(self, storage: LocalFileStorage) -> None:
        """⚠️ **同键覆盖** —— 幂等。"""
        await storage.put("a.txt", b"first")
        await storage.put("a.txt", b"second")

        assert await storage.get("a.txt") == b"second"

    async def test_put_creates_nested_directories(self, storage: LocalFileStorage) -> None:
        """⚠️ **嵌套目录要自动创建**。"""
        await storage.put("a/b/c/d.txt", b"deep")

        assert await storage.exists("a/b/c/d.txt")

    async def test_get_missing_raises(self, storage: LocalFileStorage) -> None:
        """⚠️ **读不存在的要明确报错** —— 不能返回空。"""
        with pytest.raises(StorageNotFoundError):
            await storage.get("ghost.txt")

    async def test_get_info_missing_raises(self, storage: LocalFileStorage) -> None:
        """元数据不存在也要报错。"""
        with pytest.raises(StorageNotFoundError):
            await storage.get_info("ghost.txt")

    async def test_exists(self, storage: LocalFileStorage) -> None:
        """存在性判断。"""
        await storage.put("a.txt", b"x")

        assert await storage.exists("a.txt")
        assert not await storage.exists("b.txt")


class TestDelete:
    """删除."""

    async def test_delete_existing(self, storage: LocalFileStorage) -> None:
        """删掉存在的。"""
        await storage.put("a.txt", b"x")

        assert await storage.delete("a.txt")
        assert not await storage.exists("a.txt")

    async def test_delete_missing_returns_false(self, storage: LocalFileStorage) -> None:
        """⚠️ **删不存在的返回 False** —— 不是异常。"""
        assert not await storage.delete("ghost.txt")


class TestList:
    """列举."""

    async def test_list_all(self, storage: LocalFileStorage) -> None:
        """列出全部。"""
        await storage.put("a.txt", b"x")
        await storage.put("b.txt", b"y")

        assert len(await storage.list()) == 2

    async def test_list_by_prefix(self, storage: LocalFileStorage) -> None:
        """⚠️ **按前缀过滤**。"""
        await storage.put("papers/a.pdf", b"x")
        await storage.put("papers/b.pdf", b"y")
        await storage.put("images/c.png", b"z")

        results = await storage.list(prefix="papers/")

        assert len(results) == 2

    async def test_list_respects_limit(self, storage: LocalFileStorage) -> None:
        """⚠️ **限制条数**。"""
        for index in range(5):
            await storage.put(f"f{index}.txt", b"x")

        assert len(await storage.list(limit=2)) == 2

    async def test_list_empty_root(self, storage: LocalFileStorage) -> None:
        """空目录返回空。"""
        assert await storage.list() == ()


class TestStream:
    """流式读."""

    async def test_stream_yields_all_bytes(self, storage: LocalFileStorage) -> None:
        """⚠️ **流式读要能拿全**。"""
        payload = b"0123456789" * 10
        await storage.put("a.bin", payload)

        chunks = [chunk async for chunk in storage.stream("a.bin", chunk_size=16)]

        assert b"".join(chunks) == payload

    async def test_stream_missing_raises(self, storage: LocalFileStorage) -> None:
        """⚠️ **流式读不存在也要报错**。"""
        with pytest.raises(StorageNotFoundError):
            async for _chunk in storage.stream("ghost.bin"):
                pass


class TestUsage:
    """用量."""

    async def test_usage_counts(self, storage: LocalFileStorage) -> None:
        """⚠️ **用量统计** —— 配额要用。"""
        await storage.put("a.txt", b"12345")
        await storage.put("b.txt", b"678")

        usage = await storage.usage()

        assert usage["objects"] == 2
        assert usage["bytes"] == 8


class TestPresignedUrl:
    """临时链接."""

    async def test_local_has_no_presigned_url(self, storage: LocalFileStorage) -> None:
        """⚠️ **本地没有临时链接** —— 返回空字符串。

        上层要判断：空 = 走后端代理下载。
        """
        assert await storage.presigned_url("a.txt") == ""


class TestSecurity:
    """安全."""

    async def test_put_rejects_traversal(self, storage: LocalFileStorage) -> None:
        """⚠️ **写入也要挡住穿越**。"""
        with pytest.raises(ValueError, match="不能包含"):
            await storage.put("../escape.txt", b"x")

    async def test_get_rejects_traversal(self, storage: LocalFileStorage) -> None:
        """读取也要挡。"""
        with pytest.raises(ValueError, match="不能包含"):
            await storage.get("../escape.txt")

    async def test_delete_rejects_traversal(self, storage: LocalFileStorage) -> None:
        """删除也要挡 —— 否则能删别人的文件。"""
        with pytest.raises(ValueError, match="不能包含"):
            await storage.delete("../escape.txt")

    async def test_cannot_escape_root(self, storage: LocalFileStorage, tmp_path: Path) -> None:
        """⚠️ **符号链接也不能越界**。"""
        outside = tmp_path / "outside.txt"
        outside.write_text("secret")

        link = tmp_path / "objects" / "link.txt"
        try:
            link.symlink_to(outside)
        except OSError:
            # ⚠️ Windows 上没权限建符号链接 —— 跳过
            pytest.skip("无法创建符号链接")

        with pytest.raises(ValueError, match="越界"):
            await storage.get("link.txt")
