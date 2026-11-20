"""借用外部 HTTP 客户端的上下文管理器.

⚠️ **为什么要单独一个模块** ——
「不关闭借来的客户端」这个逻辑在多个后端里都要用，
复制两份会让路径的行为不一致。
"""

from __future__ import annotations

import httpx

__all__ = ["BorrowedClient"]


class BorrowedClient:
    """借用外部客户端的上下文管理器.

    ⚠️ **不关闭借来的客户端** ——
    生命周期归调用方管。
    """

    def __init__(self, client: httpx.AsyncClient) -> None:
        """初始化.

        :param client: 借来的客户端
        """
        self._client = client

    async def __aenter__(self) -> httpx.AsyncClient:
        """进入."""
        return self._client

    async def __aexit__(self, *args: object) -> None:
        """退出 —— 不关闭."""
        return None
