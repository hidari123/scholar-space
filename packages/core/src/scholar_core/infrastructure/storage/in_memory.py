"""内存对象存储 —— 测试用实现。

⚠️ 不落盘。进程重启即丢。仅用于单元测试与本地开发。
"""

from __future__ import annotations

import hashlib
import io
from typing import BinaryIO
from uuid import uuid4

from scholar_core.application.ports.storage import ObjectInfo
from scholar_core.domain.errors import NotFoundError

__all__ = ["InMemoryStorage"]


class InMemoryStorage:
    """内存实现。"""

    def __init__(self) -> None:
        """初始化。"""
        self._objects: dict[str, tuple[bytes, ObjectInfo]] = {}

    async def put(
        self,
        key: str,
        data: bytes,
        content_type: str = "application/octet-stream",
    ) -> ObjectInfo:
        """写入对象。"""
        info = ObjectInfo(
            key=key,
            size=len(data),
            content_type=content_type,
            etag=hashlib.md5(data, usedforsecurity=False).hexdigest(),
            last_modified=0.0,
        )
        self._objects[key] = (data, info)
        return info

    async def get(self, key: str) -> bytes:
        """读取对象。"""
        stored = self._objects.get(key)
        if stored is None:
            raise NotFoundError(f"对象不存在: {key}")
        return stored[0]

    async def get_stream(self, key: str) -> BinaryIO:
        """流式读取对象。"""
        return io.BytesIO(await self.get(key))

    async def delete(self, key: str) -> bool:
        """删除对象。"""
        return self._objects.pop(key, None) is not None

    async def exists(self, key: str) -> bool:
        """对象是否存在。"""
        return key in self._objects

    async def stat(self, key: str) -> ObjectInfo:
        """取对象元信息。"""
        stored = self._objects.get(key)
        if stored is None:
            raise NotFoundError(f"对象不存在: {key}")
        return stored[1]

    async def presigned_url(self, key: str, expires: int = 3600) -> str:
        """内存实现不支持预签名 URL。"""
        raise NotImplementedError("InMemoryStorage 不支持预签名 URL")

    async def copy(self, source_key: str, target_key: str) -> ObjectInfo:
        """复制对象。"""
        data = await self.get(source_key)
        source_info = await self.stat(source_key)
        return await self.put(target_key, data, source_info.content_type)

    def new_key(self, prefix: str, suffix: str = "") -> str:
        """生成唯一对象键。"""
        return f"{prefix}{uuid4().hex}{suffix}"
