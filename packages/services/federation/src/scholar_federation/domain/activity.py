"""领域模型 —— ActivityPub 活动。

⚠️ **ActivityPub 是协议栈，不是社区业务** ——
所以 federation 是**独立的包**，不跟 community 混在一起。

⚠️ **社区可以不带联邦跑** —— 部署更简单。

⚠️ **只实现必要的活动类型**：
| 类型 | 方向 | 说明 |
|---|---|---|
| `Create` | 出 | 发布帖子 |
| `Follow` | 出 | 关注别人 |
| `Accept` | 入 | 别人接受关注 |
| `Like` | 出 | 点赞 |
| `Undo` | 出 | 取消关注 / 取消点赞 |
| `Announce` | 出 | 转发 |
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import StrEnum
from typing import Any

__all__ = [
    "Activity",
    "ActivityType",
    "Actor",
    "InboxItem",
    "ObjectType",
]


class ActivityType(StrEnum):
    """活动类型."""

    CREATE = "Create"
    UPDATE = "Update"
    DELETE = "Delete"
    FOLLOW = "Follow"
    ACCEPT = "Accept"
    REJECT = "Reject"
    LIKE = "Like"
    ANNOUNCE = "Announce"
    UNDO = "Undo"
    #: ⚠️ **收到不认识的活动** —— 要记录，不能静默丢弃
    UNKNOWN = "Unknown"


class ObjectType(StrEnum):
    """对象类型."""

    NOTE = "Note"
    ARTICLE = "Article"
    PERSON = "Person"
    SERVICE = "Service"


@dataclass(frozen=True, slots=True)
class Actor:
    """演员（联邦里的账号）.

    ⚠️ **这是「远端」演员** ——
    本地演员在 community 包里，这里只存联邦需要的字段。
    """

    #: 演员 ID（完整 URL）
    actor_id: str
    #: 用户名
    preferred_username: str
    #: 显示名
    name: str = ""
    #: 主页
    url: str = ""
    #: 公钥（ID + PEM）
    public_key_id: str = ""
    public_key_pem: str = ""
    #: 入站端点
    inbox_url: str = ""
    #: 出站端点
    outbox_url: str = ""
    #: 是否已解析过
    is_resolved: bool = False

    def public_key(self) -> dict[str, str]:
        """公钥（JWK 格式）."""
        return {
            "id": self.public_key_id,
            "owner": self.actor_id,
            "publicKeyPem": self.public_key_pem,
        }


@dataclass(frozen=True, slots=True)
class Activity:
    """活动.

    ⚠️ **`id` 必须是完整 URL** ——
    ActivityPub 用 URL 做幂等键。
    """

    #: 活动 ID（完整 URL）
    activity_id: str
    #: 类型
    activity_type: ActivityType
    #: 执行者
    actor_id: str
    #: 对象
    object: Any = None
    #: 发布时间
    published_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    #: 额外字段
    extra: dict[str, Any] = field(default_factory=dict)

    @property
    def is_inbox_activity(self) -> bool:
        """是不是入站活动（收到的）。"""
        return self.activity_type is not ActivityType.UNKNOWN

    def to_jsonld(self) -> dict[str, Any]:
        """转成 JSON-LD 文档."""
        document: dict[str, Any] = {
            "@context": "https://www.w3.org/ns/activitystreams",
            "id": self.activity_id,
            "type": self.activity_type.value,
            "actor": self.actor_id,
            "published": self.published_at.isoformat(),
        }

        if self.object is not None:
            document["object"] = self.object

        document.update(self.extra)

        return document


@dataclass(frozen=True, slots=True)
class InboxItem:
    """收件箱条目.

    ⚠️ **收下所有活动** ——
    即使不认识，也要记下来（审计 + 将来重放）。
    """

    #: 条目 ID
    item_id: str
    #: 活动 ID
    activity_id: str
    #: 发送者
    actor_id: str
    #: 原始 JSON
    raw: dict[str, Any] = field(default_factory=dict)
    #: 处理状态
    status: str = "pending"
    #: 收到的动作
    received_action: str = "receive"
    #: 收到时间
    received_at: datetime = field(default_factory=lambda: datetime.now(UTC))
