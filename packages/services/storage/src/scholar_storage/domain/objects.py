"""值对象 —— 对象存储的基础类型。

⚠️ **对象键（key）是路径，不是 URL** ——
   存储服务只管存取，怎么变成 URL 是上层的事。
   （不同后端的 URL 规则不一样：MinIO 是
   `http://host/bucket/key`，S3 是 `https://bucket.s3.region.amazonaws.com/key`）
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from enum import StrEnum

__all__ = [
    "ContentType",
    "ObjectInfo",
    "ObjectKey",
    "StorageError",
    "StorageNotFoundError",
    "StorageQuotaExceededError",
]

#: 对象键 —— 路径字符串
ObjectKey = str

#: ⚠️ **合法的对象键** —— 防止路径穿越
#:
#: ⚠️ **为什么要防** ——
#: 对象键会拼到 URL 或文件系统路径上。
#: `../../etc/passwd` 这种键能读到不该读的东西。
#:
#: ⚠️ **规则**：
#: · 不能有 `..`
#: · 不能以 `/` 开头（绝对路径）
#: · 不能有空段（`//`）
#: · 长度不超过 1024
#: · 不能有控制字符
_VALID_KEY = re.compile(r"^[^/][^/]*(/[^/]+)*$")


class ContentType(StrEnum):
    """内容类型."""

    PDF = "application/pdf"
    JSON = "application/json"
    TEXT = "text/plain"
    MARKDOWN = "text/markdown"
    HTML = "text/html"
    CSV = "text/csv"
    PNG = "image/png"
    JPEG = "image/jpeg"
    SVG = "image/svg+xml"
    PPTX = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    ZIP = "application/zip"
    BINARY = "application/octet-stream"


class StorageError(Exception):
    """存储错误基类."""


class StorageNotFoundError(StorageError):
    """对象不存在."""


class StorageQuotaExceededError(StorageError):
    """超出配额."""


def validate_key(key: ObjectKey) -> ObjectKey:
    """校验对象键.

    ⚠️ **必须在写入前校验** ——
    路径穿越的键一旦写进去就可能读到别的租户的数据。

    :param key: 对象键
    :raises ValueError: 键非法
    :return: 规范化后的键
    """
    if not key:
        raise ValueError("对象键不能为空")

    if len(key) > MAX_KEY_LENGTH:
        raise ValueError(f"对象键太长（>{MAX_KEY_LENGTH}）")

    # ⚠️ **控制字符** —— 会搞坏 HTTP 头和日志
    if any(ord(char) < CONTROL_CHAR_LIMIT for char in key):
        raise ValueError("对象键不能包含控制字符")

    # ⚠️ **绝对路径** —— 要在「空段」之前检查 ——
    #    `/etc/passwd` 的第一个段是空的，
    #    如果先查空段，报错信息会是「空段」而不是「绝对路径」，
    #    跟用户的直觉不符。
    if key.startswith("/"):
        raise ValueError(f"对象键不能以 '/' 开头：{key}")

    # ⚠️ **路径穿越** —— `..` 段
    segments = key.split("/")
    if any(segment == ".." for segment in segments):
        raise ValueError(f"对象键不能包含 '..'：{key}")

    # ⚠️ **空段** —— `a//b`
    if any(not segment for segment in segments):
        raise ValueError(f"对象键不能有空段：{key}")

    if not _VALID_KEY.match(key):
        raise ValueError(f"对象键非法：{key}")

    return key


#: 对象键的最大长度
MAX_KEY_LENGTH = 1024

#: ⚠️ **控制字符的边界** —— 码位小于这个值的是控制字符
CONTROL_CHAR_LIMIT = 32


@dataclass(frozen=True, slots=True)
class ObjectInfo:
    """对象信息.

    ⚠️ **只含元数据** —— 不含内容。
    内容要单独读（可能很大）。
    """

    #: 对象键
    key: ObjectKey
    #: 字节数
    size: int
    #: 内容类型
    content_type: str = ContentType.BINARY.value
    #: ETag（内容哈希）
    etag: str = ""
    #: 最后修改时间
    last_modified: str = ""
    #: 用户自定义元数据
    metadata: dict[str, str] | None = None

    def is_image(self) -> bool:
        """是不是图片."""
        return self.content_type.startswith("image/")

    def is_text(self) -> bool:
        """是不是文本."""
        return self.content_type.startswith("text/") or self.content_type in (
            ContentType.JSON.value,
            ContentType.MARKDOWN.value,
        )
