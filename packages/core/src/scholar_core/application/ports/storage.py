"""对象存储端口 —— 依赖倒置的关键。

⚠️ domain/application 层只认这个 Protocol，不认 MinIO / boto3。
   实现放在 infrastructure 层，由组装根注入。

这样做的收益：
- 换存储后端（MinIO → S3 → 本地磁盘）不影响业务代码
- 测试用内存实现，无需起服务
"""

from __future__ import annotations

from typing import BinaryIO, Protocol, runtime_checkable

__all__ = ["ObjectInfo", "StoragePort"]


class ObjectInfo:
    """对象元信息。

    用 dataclass 而非 dict —— 领域层零外部依赖。
    """

    __slots__ = ("content_type", "etag", "key", "last_modified", "size")

    def __init__(
        self,
        key: str,
        size: int,
        content_type: str,
        etag: str,
        last_modified: float,
    ) -> None:
        """初始化。"""
        self.key = key
        self.size = size
        self.content_type = content_type
        self.etag = etag
        self.last_modified = last_modified

    def __repr__(self) -> str:
        """可读表示。"""
        return f"ObjectInfo(key={self.key!r}, size={self.size}, content_type={self.content_type!r})"

    def __eq__(self, other: object) -> bool:
        """相等比较。"""
        if not isinstance(other, ObjectInfo):
            return NotImplemented
        return (
            self.key == other.key
            and self.size == other.size
            and self.content_type == other.content_type
            and self.etag == other.etag
        )

    def __hash__(self) -> int:
        """哈希与相等一致。"""
        return hash((self.key, self.size, self.content_type, self.etag))


@runtime_checkable
class StoragePort(Protocol):
    """对象存储端口。

    实现：MinIO / S3 / 本地文件系统（见 infrastructure/storage/）。
    """

    async def put(
        self,
        key: str,
        data: bytes,
        content_type: str = "application/octet-stream",
    ) -> ObjectInfo:
        """写入对象。

        Args:
            key: 对象键（路径）
            data: 内容
            content_type: MIME 类型

        Returns:
            对象元信息
        """
        ...

    async def get(self, key: str) -> bytes:
        """读取对象。

        Raises:
            NotFoundError: 对象不存在
        """
        ...

    async def get_stream(self, key: str) -> BinaryIO:
        """流式读取对象（大文件用）。

        Raises:
            NotFoundError: 对象不存在
        """
        ...

    async def delete(self, key: str) -> bool:
        """删除对象。

        Returns:
            是否真的删掉了（不存在时返回 False，不报错）
        """
        ...

    async def exists(self, key: str) -> bool:
        """对象是否存在。"""
        ...

    async def stat(self, key: str) -> ObjectInfo:
        """取对象元信息。

        Raises:
            NotFoundError: 对象不存在
        """
        ...

    async def presigned_url(self, key: str, expires: int = 3600) -> str:
        """生成预签名下载 URL。

        Args:
            key: 对象键
            expires: 有效期（秒）
        """
        ...

    async def copy(self, source_key: str, target_key: str) -> ObjectInfo:
        """复制对象。"""
        ...

    def new_key(self, prefix: str, suffix: str = "") -> str:
        """生成唯一对象键。

        Args:
            prefix: 前缀（如 `papers/`）
            suffix: 后缀（如 `.pdf`）
        """
        ...
