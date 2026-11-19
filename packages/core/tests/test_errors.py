"""Error system tests."""

from __future__ import annotations

import builtins

import pytest

from scholar_core.domain.errors import (
    HTTP_STATUS_BY_CODE,
    AppError,
    AuthenticationError,
    ConflictError,
    ErrorCode,
    InsufficientBalanceError,
    InternalError,
    NotFoundError,
    PermissionDeniedError,
    RateLimitError,
    ValidationError,
)


class TestAppError:
    """AppError base class behaviour."""

    def test_default_code_and_status(self) -> None:
        """Subclass inherits the code from the class attribute."""
        error = InternalError("internal")
        assert error.code == ErrorCode.INTERNAL
        assert error.http_status == 500

    def test_explicit_code_overrides(self) -> None:
        """Constructor can override the error code."""
        error = AppError("custom", code=ErrorCode.VALIDATION_FAILED)
        assert error.code == ErrorCode.VALIDATION_FAILED
        assert error.http_status == 400

    def test_details_default_empty(self) -> None:
        """details defaults to an empty dict."""
        assert AppError("x").details == {}

    def test_details_accepts_structured_data(self) -> None:
        """details carries structured payload."""
        error = ValidationError("bad field", details={"field": "email"})
        assert error.details == {"field": "email"}

    def test_to_dict_shape(self) -> None:
        """to_dict returns the response envelope body."""
        error = NotFoundError("common.error.notFound")
        assert error.to_dict() == {
            "code": ErrorCode.NOT_FOUND,
            "message": "common.error.notFound",
            "data": None,
        }

    def test_to_dict_includes_details(self) -> None:
        """details appear in the payload."""
        error = ConflictError("conflict", details={"field": "version"})
        assert error.to_dict()["data"] == {"field": "version"}

    def test_cause_chain(self) -> None:
        """cause keeps the original exception."""
        original = ValueError("root")
        error = InternalError("wrapped", cause=original)
        assert error.cause is original

    def test_repr_is_readable(self) -> None:
        """repr mentions the class name."""
        assert "NotFoundError" in repr(NotFoundError("x"))


class TestErrorCodeMapping:
    """Error code to HTTP status mapping."""

    @pytest.mark.parametrize(
        ("error_class", "expected_status"),
        [
            (ValidationError, 400),
            (AuthenticationError, 401),
            (PermissionDeniedError, 403),
            (NotFoundError, 404),
            (ConflictError, 409),
            (RateLimitError, 429),
            (InternalError, 500),
            (InsufficientBalanceError, 402),
        ],
    )
    def test_status_codes(self, error_class: type[AppError], expected_status: int) -> None:
        """Each error class maps to the right HTTP status."""
        assert error_class("x").http_status == expected_status

    def test_unknown_code_falls_back_to_500(self) -> None:
        """Unregistered codes fall back to 500."""
        assert AppError("x", code=99999).http_status == 500

    def test_mapping_table_is_populated(self) -> None:
        """The mapping table is not empty."""
        assert len(HTTP_STATUS_BY_CODE) > 0
        assert HTTP_STATUS_BY_CODE[ErrorCode.OK] == 200


class TestExceptionHierarchy:
    """Exception hierarchy."""

    def test_all_subclass_app_error(self) -> None:
        """One base class lets the gateway catch everything."""
        for error_class in (
            ValidationError,
            AuthenticationError,
            PermissionDeniedError,
            NotFoundError,
            ConflictError,
            RateLimitError,
            InternalError,
            InsufficientBalanceError,
        ):
            assert issubclass(error_class, AppError)

    def test_caught_by_base_class(self) -> None:
        """except AppError catches every subclass."""
        with pytest.raises(AppError):
            raise NotFoundError("x")

    def test_permission_error_does_not_shadow_builtin(self) -> None:
        """Our permission error must not shadow the builtin."""
        assert PermissionDeniedError is not builtins.PermissionError
