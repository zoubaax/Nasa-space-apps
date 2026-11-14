"""Application errors mapped to HTTP responses."""

from __future__ import annotations


class ClimateServiceError(Exception):
    """Base error for expected climate-service failures."""

    def __init__(
        self,
        message: str,
        *,
        status_code: int,
        code: str,
        details: dict | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.code = code
        self.details = details or {}


class InvalidRequestError(ClimateServiceError):
    def __init__(self, message: str, *, details: dict | None = None) -> None:
        super().__init__(message, status_code=422, code="invalid_request", details=details)


class CityNotFoundError(ClimateServiceError):
    def __init__(self, message: str, *, details: dict | None = None) -> None:
        super().__init__(message, status_code=404, code="city_not_found", details=details)


class GeocodingError(ClimateServiceError):
    def __init__(self, message: str, *, details: dict | None = None) -> None:
        super().__init__(message, status_code=502, code="geocoding_error", details=details)


class GeocodingTimeoutError(ClimateServiceError):
    def __init__(self, message: str, *, details: dict | None = None) -> None:
        super().__init__(message, status_code=504, code="geocoding_timeout", details=details)


class GeocodingRateLimitError(ClimateServiceError):
    def __init__(self, message: str, *, details: dict | None = None) -> None:
        super().__init__(message, status_code=429, code="geocoding_rate_limited", details=details)


class GeocodingNetworkError(ClimateServiceError):
    def __init__(self, message: str, *, details: dict | None = None) -> None:
        super().__init__(message, status_code=503, code="geocoding_network", details=details)


class NasaPowerError(ClimateServiceError):
    def __init__(self, message: str, *, details: dict | None = None) -> None:
        super().__init__(message, status_code=502, code="nasa_http_error", details=details)


class NasaPowerTimeoutError(ClimateServiceError):
    def __init__(self, message: str, *, details: dict | None = None) -> None:
        super().__init__(message, status_code=504, code="nasa_timeout", details=details)


class NasaPowerRateLimitError(ClimateServiceError):
    def __init__(self, message: str, *, details: dict | None = None) -> None:
        super().__init__(message, status_code=429, code="nasa_rate_limited", details=details)


class NasaPowerNetworkError(ClimateServiceError):
    def __init__(self, message: str, *, details: dict | None = None) -> None:
        super().__init__(message, status_code=503, code="nasa_network", details=details)


class SmapError(ClimateServiceError):
    def __init__(self, message: str, *, details: dict | None = None) -> None:
        super().__init__(message, status_code=502, code="smap_http_error", details=details)


class SmapTimeoutError(ClimateServiceError):
    def __init__(self, message: str, *, details: dict | None = None) -> None:
        super().__init__(message, status_code=504, code="smap_timeout", details=details)


class SmapRateLimitError(ClimateServiceError):
    def __init__(self, message: str, *, details: dict | None = None) -> None:
        super().__init__(message, status_code=429, code="smap_rate_limited", details=details)


class SmapNetworkError(ClimateServiceError):
    def __init__(self, message: str, *, details: dict | None = None) -> None:
        super().__init__(message, status_code=503, code="smap_network", details=details)


class NasaDataError(ClimateServiceError):
    def __init__(
        self,
        message: str,
        *,
        code: str = "nasa_invalid_payload",
        details: dict | None = None,
    ) -> None:
        super().__init__(message, status_code=502, code=code, details=details)
