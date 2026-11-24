"""Typed service errors. Each carries the stable code and HTTP status the envelope reports."""

from __future__ import annotations

from typing import Any


class ServiceError(Exception):
    status_code = 400
    code = "bad_request"

    def __init__(self, message: str, details: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.details = details or {}

    def envelope(self) -> dict[str, Any]:
        return {"error": {"code": self.code, "message": self.message, "details": self.details}}


class SpecRejected(ServiceError):
    status_code = 422
    code = "spec_invalid"


class PaymentInsufficient(ServiceError):
    status_code = 402
    code = "payment_insufficient"


class PaymentReferenceReused(ServiceError):
    status_code = 409
    code = "payment_reference_reused"


class Unauthorized(ServiceError):
    status_code = 401
    code = "unauthorized"


class JobNotFound(ServiceError):
    status_code = 404
    code = "job_not_found"


class JobNotReady(ServiceError):
    status_code = 409
    code = "job_not_ready"


class RateLimited(ServiceError):
    status_code = 429
    code = "rate_limited"


class RequestTooLarge(ServiceError):
    status_code = 413
    code = "request_too_large"


class DirectorUnavailable(ServiceError):
    status_code = 503
    code = "director_unavailable"


class DirectorFailed(ServiceError):
    status_code = 502
    code = "director_failed"


class ConfigurationError(Exception):
    """The service was started with a missing or invalid setting."""
