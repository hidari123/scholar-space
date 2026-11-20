"""本地文件系统实现 —— 开发与测试用。

⚠️ **本地实现是「参考实现」** ——
   端口的语义以它为准，其他后端要跟它对齐。

⚠️ **本地没有临时链接** ——
   `presigned_url()` 返回空字符串。
   上层要退回到「后端代理下载」。
"""

from __future__ import annotations

import asyncio
import hashlib
import mimetypes
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from pathlib import Path

from scholar_storage.domain.objects import (
    ContentType,
    ObjectInfo,
    ObjectKey,
    StorageNotFoundError,
    validate_key,
)

__all__ = ["LocalFileStorage"]


class LocalFileStorage:
    """本地文件系统存储.

    ⚠️ **所有操作走线程池** ——
    文件 IO 是阻塞的，直接在事件循环里做会卡住整个服务。
    """

    def __init__(self, root: Path | str) -> None:
        """初始化.

        :param root: 根目录
        """
        self._root = Path(root)
        self._root.mkdir(parents=True, exist_ok=True)

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
        """写入对象.

        ⚠️ **同键覆盖** —— 幂等。
        """
        validate_key(key)
        path = self._resolve(key)

        def write() -> ObjectInfo:
            """实际写盘."""
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)

            return ObjectInfo(
                key=key,
                size=len(data),
                content_type=content_type,
                etag=hashlib.sha256(data).hexdigest()[:32],
                last_modified=datetime.now(UTC).isoformat(),
                metadata=dict(metadata) if metadata else {},
            )

        return await asyncio.to_thread(write)

    # ══════════════════════════════════════════════════
    # 读
    # ══════════════════════════════════════════════════

    async def get(self, key: ObjectKey) -> bytes:
        """读对象.

        :raises StorageNotFoundError: 不存在
        """
        validate_key(key)
        path = self._resolve(key)

        def read() -> bytes:
            """实际读盘."""
            if not path.is_file():
                raise StorageNotFoundError(f"对象不存在：{key}")
            return path.read_bytes()

        return await asyncio.to_thread(read)

    async def get_info(self, key: ObjectKey) -> ObjectInfo:
        """取元数据.

        :raises StorageNotFoundError: 不存在
        """
        validate_key(key)
        path = self._resolve(key)

        def stat() -> ObjectInfo:
            """实际 stat."""
            if not path.is_file():
                raise StorageNotFoundError(f"对象不存在：{key}")

            data_size = path.stat().st_size
            guessed = mimetypes.guess_type(path.name)[0]

            return ObjectInfo(
                key=key,
                size=data_size,
                content_type=guessed or ContentType.BINARY.value,
                last_modified=datetime.fromtimestamp(
                    path.stat().st_mtime,
                    tz=UTC,
                ).isoformat(),
            )

        return await asyncio.to_thread(stat)

    async def exists(self, key: ObjectKey) -> bool:
        """对象是否存在."""
        validate_key(key)
        path = self._resolve(key)
        return await asyncio.to_thread(path.is_file)

    async def delete(self, key: ObjectKey) -> bool:
        """删除对象.

        :return: 是否真的删了
        """
        validate_key(key)
        path = self._resolve(key)

        def remove() -> bool:
            """实际删除."""
            if not path.is_file():
                return False
            path.unlink()
            return True

        return await asyncio.to_thread(remove)

    async def list(
        self,
        prefix: str = "",
        limit: int = 100,
    ) -> tuple[ObjectInfo, ...]:
        """列出对象.

        ⚠️ **按前缀 + 递归** ——
        `prefix="papers/"` 会列出 `papers/2024/a.pdf`。
        """
        root = self._root

        def walk() -> list[ObjectInfo]:
            """实际遍历."""
            results: list[ObjectInfo] = []

            for path in sorted(root.rglob("*")):
                if not path.is_file():
                    continue

                key = path.relative_to(root).as_posix()
                if not key.startswith(prefix):
                    continue

                results.append(
                    ObjectInfo(
                        key=key,
                        size=path.stat().st_size,
                        content_type=(
                            mimetypes.guess_type(path.name)[0] or ContentType.BINARY.value
                        ),
                        last_modified=datetime.fromtimestamp(
                            path.stat().st_mtime,
                            tz=UTC,
                        ).isoformat(),
                    )
                )

            return results

        found = await asyncio.to_thread(walk)
        return tuple(found[:limit])

    async def stream(
        self,
        key: ObjectKey,
        chunk_size: int = 65536,
    ) -> AsyncIterator[bytes]:
        """流式读对象.

        ⚠️ **分块读** —— 大文件不会一次性进内存。
        """
        validate_key(key)
        path = self._resolve(key)

        if not await asyncio.to_thread(path.is_file):
            raise StorageNotFoundError(f"对象不存在：{key}")

        # ⚠️ **句柄只开一次** ——
        # 每次读都重新打开文件的话，永远读到第一块 → **死循环**。
        # 必须在整个流式读取期间保持同一个句柄。
        handle = await asyncio.to_thread(path.open, "rb")
        try:
            while True:
                chunk = await asyncio.to_thread(handle.read, chunk_size)
                if not chunk:
                    break
                yield chunk
        finally:
            # ⚠️ **一定要关** —— 异常退出时泄漏文件句柄
            await asyncio.to_thread(handle.close)

    async def presigned_url(self, key: ObjectKey, expires_seconds: int = 3600) -> str:
        """⚠️ **本地实现没有临时链接** —— 返回空字符串。"""
        del key, expires_seconds
        return ""

    async def usage(self) -> dict[str, int]:
        """用量统计."""
        root = self._root

        def count() -> dict[str, int]:
            """实际统计."""
            objects = 0
            total_bytes = 0

            for path in root.rglob("*"):
                if path.is_file():
                    objects += 1
                    total_bytes += path.stat().st_size

            return {"objects": objects, "bytes": total_bytes}

        return await asyncio.to_thread(count)

    # ══════════════════════════════════════════════════
    # 辅助
    # ══════════════════════════════════════════════════

    def _resolve(self, key: ObjectKey) -> Path:
        """把对象键解析成路径.

        ⚠️ **必须再做一次穿越检查** ——
        `validate_key` 已经挡了 `..`，
        但符号链接可能指向根目录外面。
        """
        path = (self._root / key).resolve()

        # ⚠️ **再确认一次没跑出根目录** ——
        root = self._root.resolve()
        if not str(path).startswith(str(root)):
            raise ValueError(f"对象键越界：{key}")

        return path
