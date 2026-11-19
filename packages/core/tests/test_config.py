"""Configuration module tests."""

from __future__ import annotations

import pytest
from pydantic import ValidationError as PydanticValidationError

from scholar_core.infrastructure.config.settings import (
    AuthSettings,
    CoreSettings,
    DatabaseSettings,
    current_environment,
    reload_settings,
)


class TestDatabaseSettings:
    """Database configuration."""

    def test_defaults(self) -> None:
        """Defaults point at localhost."""
        settings = DatabaseSettings()
        assert settings.host == "localhost"
        assert settings.port == 5432

    def test_async_url(self) -> None:
        """Builds an asyncpg connection string."""
        settings = DatabaseSettings(host="db.example.com", port=5433, database="app")
        url = settings.async_url
        assert url.startswith("postgresql+asyncpg://")
        assert "db.example.com:5433/app" in url

    def test_password_is_secret(self) -> None:
        """SecretStr does not leak the plaintext."""
        settings = DatabaseSettings(password="dummy-value")  # noqa: S106
        assert "dummy-value" not in repr(settings)
        assert settings.password.get_secret_value() == "dummy-value"

    def test_host_cannot_be_empty(self) -> None:
        """Blank host is rejected."""
        with pytest.raises(PydanticValidationError):
            DatabaseSettings(host="   ")


class TestAuthSettings:
    """Authentication configuration."""

    def test_origins_accept_comma_separated_string(self) -> None:
        """A comma separated string is split into a list."""
        settings = AuthSettings(allowed_origins="https://a.com, https://b.com")
        assert settings.allowed_origins == ["https://a.com", "https://b.com"]

    def test_origins_list_is_preserved(self) -> None:
        """A list is kept as-is."""
        settings = AuthSettings(allowed_origins=["https://a.com"])
        assert settings.allowed_origins == ["https://a.com"]


class TestCoreSettings:
    """Platform-wide configuration."""

    def test_default_environment_is_local(self) -> None:
        """Defaults to local development."""
        assert CoreSettings().environment == "local"

    def test_is_production(self) -> None:
        """is_production is true only for prod."""
        assert CoreSettings(environment="prod").is_production is True
        assert CoreSettings(environment="staging").is_production is False

    def test_nested_groups_have_defaults(self) -> None:
        """Nested settings groups are populated."""
        settings = CoreSettings(_env_file=None)
        assert settings.db.host
        assert settings.redis.port == 6379
        assert settings.storage.backend == "local"

    def test_log_json_flag(self) -> None:
        """log_json follows log_format."""
        assert CoreSettings(log_format="json").log_json is True
        assert CoreSettings(log_format="console").log_json is False


class TestEnvironment:
    """Environment name resolution."""

    def test_invalid_environment_falls_back_to_local(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """An invalid value does not crash, it falls back."""
        monkeypatch.setenv("SCHOLAR_ENV", "weird")
        assert current_environment() == "local"

    def test_valid_environment(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """A valid value is returned as-is."""
        monkeypatch.setenv("SCHOLAR_ENV", "staging")
        assert current_environment() == "staging"


class TestReload:
    """Configuration reloading."""

    def test_reload_clears_cache(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """reload picks up a changed environment variable."""
        monkeypatch.setenv("SCHOLAR_SERVICE_NAME", "before")
        first = reload_settings()
        assert first.service_name == "before"

        monkeypatch.setenv("SCHOLAR_SERVICE_NAME", "after")
        second = reload_settings()
        assert second.service_name == "after"
