"""应用层端口 —— 对象存储契约。

⚠️ **一个端口，三个实现** —— 本地 / MinIO / S3。

⚠️ **接口刻意做小** —— 只有真正需要的能力。
加了「复制文件夹」「列出所有桶」这种没人用的方法，
每个后端都要实现一遍。
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Protocol, runtime_checkable

from scholar_storage.domain.objects import ObjectInfo, ObjectKey

__all__ = ["ObjectStoragePort"]


@runtime_checkable
class ObjectStoragePort(Protocol):
    """对象存储端口."""

    async def put(
        self,
        key: ObjectKey,
        data: bytes,
        content_type: str = "application/octet-stream",
        metadata: dict[str, str] | None = None,
    ) -> ObjectInfo:
        """写入对象.

        ⚠️ **同键覆盖** —— 幂等。
        """
        ...

    async def get(self, key: ObjectKey) -> bytes:
        """读对象.

        :raises StorageNotFoundError: 不存在
        """
        ...

    async def get_info(self, key: ObjectKey) -> ObjectInfo:
        """取对象元数据（不读内容）.

        :raises StorageNotFoundError: 不存在
        """
        ...

    async def exists(self, key: ObjectKey) -> bool:
        """对象是否存在."""
        ...

    async def delete(self, key: ObjectKey) -> bool:
        """删除对象.

        :return: 是否真的删了（不存在返回 False）
        """
        ...

    async def list(
        self,
        prefix: str = "",
        limit: int = 100,
    ) -> tuple[ObjectInfo, ...]:
        """列出对象.

        ⚠️ **按前缀** —— `prefix="papers/2024/"` 列出某个目录下的。
        """
        ...

    async def stream(
        self,
        key: ObjectKey,
        chunk_size: int = 65536,
    ) -> AsyncIterator[bytes]:
        """流式读对象.

        ⚠️ **大文件要用这个** ——
        `get()` 会把整个文件读进内存。
        """
        ...

    async def presigned_url(self, key: ObjectKey, expires_seconds: int = 3600) -> str:
        """生成临时下载链接.

        ⚠️ **本地实现不支持** —— 返回空字符串。
        上层要判断：空字符串 = 没有临时链接，只能走后端代理。
        """
        ...

    async def usage(self) -> dict[str, int]:
        """用量统计.

        :return: {"objects": 个数, "bytes": 字节数}
        """
        ...
