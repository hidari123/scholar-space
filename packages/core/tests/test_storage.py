"""Storage port tests."""

from __future__ import annotations

import pytest

from scholar_core.application.ports.storage import ObjectInfo
from scholar_core.domain.errors import NotFoundError
from scholar_core.infrastructure.storage.in_memory import InMemoryStorage


@pytest.fixture
def storage() -> InMemoryStorage:
    """In-memory storage instance."""
    return InMemoryStorage()


class TestInMemoryStorage:
    """In-memory storage implementation."""

    async def test_put_and_get(self, storage: InMemoryStorage) -> None:
        """Basic round trip."""
        await storage.put("a.txt", b"hello", "text/plain")
        assert await storage.get("a.txt") == b"hello"

    async def test_stat_returns_metadata(self, storage: InMemoryStorage) -> None:
        """stat exposes size and content type."""
        await storage.put("a.txt", b"hello", "text/plain")
        info = await storage.stat("a.txt")
        assert info.size == 5
        assert info.content_type == "text/plain"

    async def test_get_missing_raises_not_found(self, storage: InMemoryStorage) -> None:
        """A missing key raises."""
        with pytest.raises(NotFoundError):
            await storage.get("missing")

    async def test_stat_missing_raises_not_found(self, storage: InMemoryStorage) -> None:
        """stat raises for a missing key too."""
        with pytest.raises(NotFoundError):
            await storage.stat("missing")

    async def test_exists(self, storage: InMemoryStorage) -> None:
        """exists does not raise."""
        assert await storage.exists("a.txt") is False
        await storage.put("a.txt", b"x")
        assert await storage.exists("a.txt") is True

    async def test_delete(self, storage: InMemoryStorage) -> None:
        """delete reports whether it removed anything."""
        await storage.put("a.txt", b"x")
        assert await storage.delete("a.txt") is True
        assert await storage.delete("a.txt") is False

    async def test_get_stream(self, storage: InMemoryStorage) -> None:
        """get_stream returns a readable stream."""
        await storage.put("a.txt", b"hello")
        stream = await storage.get_stream("a.txt")
        assert stream.read() == b"hello"

    async def test_copy_preserves_content_type(self, storage: InMemoryStorage) -> None:
        """copy keeps the content type."""
        await storage.put("a.txt", b"hello", "text/plain")
        info = await storage.copy("a.txt", "b.txt")
        assert info.content_type == "text/plain"
        assert await storage.get("b.txt") == b"hello"

    async def test_new_key_is_unique(self, storage: InMemoryStorage) -> None:
        """new_key returns a different key every time."""
        first = storage.new_key("papers/", ".pdf")
        second = storage.new_key("papers/", ".pdf")
        assert first != second
        assert first.startswith("papers/")
        assert first.endswith(".pdf")

    async def test_presigned_url_not_supported(self, storage: InMemoryStorage) -> None:
        """The in-memory implementation says so explicitly."""
        with pytest.raises(NotImplementedError):
            await storage.presigned_url("a.txt")


class TestObjectInfo:
    """Object metadata."""

    def test_equality(self) -> None:
        """Identical content compares equal."""
        first = ObjectInfo("k", 1, "text/plain", "etag", 0.0)
        second = ObjectInfo("k", 1, "text/plain", "etag", 0.0)
        assert first == second

    def test_inequality(self) -> None:
        """A different size compares unequal."""
        first = ObjectInfo("k", 1, "text/plain", "etag", 0.0)
        second = ObjectInfo("k", 2, "text/plain", "etag", 0.0)
        assert first != second
