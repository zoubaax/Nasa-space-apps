"""Resolve a city name to coordinates with OpenStreetMap Nominatim."""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import httpx

from app.core.config import Settings
from app.core.exceptions import (
    CityNotFoundError,
    GeocodingError,
    GeocodingNetworkError,
    GeocodingRateLimitError,
    GeocodingTimeoutError,
    InvalidRequestError,
)
from app.services.cache import FileCache
from app.services.http_retry import RetryPolicy, extract_message, get_with_retry

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class GeocodeResult:
    query: str
    latitude: float
    longitude: float
    display_name: str
    retrieved_at: datetime
    cached: bool


class GeocodingService:
    """Geocode city names and cache successful lookups on disk.

    Requests are serialized to at most one Nominatim call per configured interval.
    See https://operations.osmfoundation.org/policies/nominatim/
    """

    def __init__(self, settings: Settings, cache: FileCache, client: httpx.AsyncClient) -> None:
        self._settings = settings
        self._cache = cache
        self._client = client
        self._lock = asyncio.Lock()
        self._last_request = 0.0

    async def geocode(self, city: str) -> GeocodeResult:
        query = " ".join(city.split())
        if not query:
            raise InvalidRequestError("City name is empty.")
        cached = self._read_cache(query)
        if cached is not None:
            logger.info("Geocode cache hit for %s", query)
            return cached

        await self._throttle()
        response = await get_with_retry(
            self._client,
            self._settings.geocoding_base_url,
            params={
                "q": query,
                "format": "jsonv2",
                "limit": "1",
                "addressdetails": "0",
            },
            headers={
                "Accept": "application/json",
                "Accept-Language": "en",
                "User-Agent": self._settings.geocoding_user_agent,
            },
            policy=RetryPolicy(
                service_name="Nominatim",
                max_retries=self._settings.geocoding_max_retries,
                base_seconds=self._settings.retry_base_seconds,
                max_seconds=self._settings.retry_max_seconds,
                timeout_error=GeocodingTimeoutError,
                rate_limit_error=GeocodingRateLimitError,
                network_error=GeocodingNetworkError,
                http_error=GeocodingError,
            ),
            timeout=self._settings.geocoding_timeout_seconds,
        )
        if response.status_code in {400, 422}:
            raise InvalidRequestError(
                f"Nominatim rejected the city query. {extract_message(response)}".strip()
            )
        if response.status_code >= 400:
            raise GeocodingError(
                f"Nominatim returned HTTP {response.status_code}. {extract_message(response)}".strip(),
                details={"upstream_status": response.status_code},
            )

        try:
            payload = response.json()
        except ValueError as exc:
            raise GeocodingError("Nominatim returned a response that is not valid JSON.") from exc
        if isinstance(payload, dict):
            message = _nominatim_error(payload)
            raise GeocodingError(message or "Nominatim returned an unexpected response.")
        if not isinstance(payload, list) or not payload:
            raise CityNotFoundError(f"No location found for '{query}'.")

        result = self._parse_hit(query, payload[0])
        self._write_cache(result)
        return result

    async def reverse_geocode(self, latitude: float, longitude: float) -> dict[str, Any]:
        """Resolve coordinates to a human-friendly city/locality name."""
        if not (-90.0 <= latitude <= 90.0 and -180.0 <= longitude <= 180.0):
            raise InvalidRequestError("Latitude must be in [-90, 90] and longitude in [-180, 180].")

        cached = self._read_reverse_cache(latitude, longitude)
        if cached is not None:
            logger.info("Reverse geocode cache hit for (%f, %f)", latitude, longitude)
            return cached

        reverse_url = self._settings.geocoding_base_url.replace("/search", "/reverse")
        if "reverse" not in reverse_url:
            reverse_url = "https://nominatim.openstreetmap.org/reverse"

        await self._throttle()
        try:
            response = await get_with_retry(
                self._client,
                reverse_url,
                params={
                    "lat": f"{latitude:.6f}",
                    "lon": f"{longitude:.6f}",
                    "format": "jsonv2",
                    "zoom": "14",
                    "addressdetails": "1",
                },
                headers={
                    "Accept": "application/json",
                    "Accept-Language": "fr,en,ar",
                    "User-Agent": self._settings.geocoding_user_agent,
                },
                policy=RetryPolicy(
                    service_name="NominatimReverse",
                    max_retries=self._settings.geocoding_max_retries,
                    base_seconds=self._settings.retry_base_seconds,
                    max_seconds=self._settings.retry_max_seconds,
                    timeout_error=GeocodingTimeoutError,
                    rate_limit_error=GeocodingRateLimitError,
                    network_error=GeocodingNetworkError,
                    http_error=GeocodingError,
                ),
                timeout=self._settings.geocoding_timeout_seconds,
            )
            if response.status_code < 400:
                payload = response.json()
                if isinstance(payload, dict) and "error" not in payload:
                    address = payload.get("address", {})
                    city_part = (
                        address.get("city")
                        or address.get("town")
                        or address.get("village")
                        or address.get("municipality")
                        or address.get("suburb")
                        or address.get("county")
                        or address.get("state_district")
                        or address.get("state")
                        or "Position GPS"
                    )
                    country_part = address.get("country", "")
                    city_name = f"{city_part}, {country_part}".strip(", ") if country_part else city_part
                    display_name = payload.get("display_name", city_name)

                    result = {
                        "latitude": latitude,
                        "longitude": longitude,
                        "city": city_name,
                        "display_name": display_name,
                        "cached": False,
                    }
                    self._write_reverse_cache(latitude, longitude, result)
                    return result
        except Exception as exc:
            logger.warning("Reverse geocoding failed for (%f, %f): %s", latitude, longitude, exc)

        # Resilient fallback if upstream reverse lookup fails
        return {
            "latitude": latitude,
            "longitude": longitude,
            "city": f"Coordonnées ({latitude:.4f}, {longitude:.4f})",
            "display_name": f"Position GPS ({latitude:.4f}, {longitude:.4f})",
            "cached": False,
        }

    async def _throttle(self) -> None:
        interval = self._settings.geocoding_min_interval_seconds
        if interval <= 0:
            return
        async with self._lock:
            wait = interval - (time.monotonic() - self._last_request)
            if wait > 0:
                await asyncio.sleep(wait)
            self._last_request = time.monotonic()

    def _read_cache(self, query: str) -> GeocodeResult | None:
        payload = self._cache.read_json(self._cache.geocode_path(query))
        if payload is None:
            return None
        try:
            retrieved_at = datetime.fromisoformat(str(payload["retrieved_at"]))
            return GeocodeResult(
                query=str(payload["query"]),
                latitude=float(payload["latitude"]),
                longitude=float(payload["longitude"]),
                display_name=str(payload["display_name"]),
                retrieved_at=retrieved_at,
                cached=True,
            )
        except (KeyError, TypeError, ValueError):
            logger.warning("Ignoring incomplete geocode cache for %s", query)
            return None

    def _write_cache(self, result: GeocodeResult) -> None:
        try:
            self._cache.write_json(
                self._cache.geocode_path(result.query),
                {
                    "query": result.query,
                    "latitude": result.latitude,
                    "longitude": result.longitude,
                    "display_name": result.display_name,
                    "retrieved_at": result.retrieved_at.isoformat(),
                },
            )
        except OSError:
            logger.exception("Failed to write geocode cache for %s", result.query)

    def _read_reverse_cache(self, latitude: float, longitude: float) -> dict[str, Any] | None:
        payload = self._cache.read_json(self._cache.reverse_geocode_path(latitude, longitude))
        if payload is None:
            return None
        try:
            return {
                "latitude": float(payload["latitude"]),
                "longitude": float(payload["longitude"]),
                "city": str(payload["city"]),
                "display_name": str(payload.get("display_name", payload["city"])),
                "cached": True,
            }
        except (KeyError, TypeError, ValueError):
            return None

    def _write_reverse_cache(self, latitude: float, longitude: float, result: dict[str, Any]) -> None:
        try:
            self._cache.write_json(
                self._cache.reverse_geocode_path(latitude, longitude),
                {
                    "latitude": latitude,
                    "longitude": longitude,
                    "city": result["city"],
                    "display_name": result.get("display_name", result["city"]),
                    "retrieved_at": datetime.now(timezone.utc).isoformat(),
                },
            )
        except OSError:
            logger.exception("Failed to write reverse geocode cache for (%f, %f)", latitude, longitude)

    def _parse_hit(self, query: str, hit: object) -> GeocodeResult:
        if not isinstance(hit, dict):
            raise GeocodingError("Nominatim returned an unexpected result.")
        try:
            latitude = float(hit["lat"])
            longitude = float(hit["lon"])
        except (KeyError, TypeError, ValueError) as exc:
            raise GeocodingError("Nominatim returned a result without valid coordinates.") from exc
        if not (-90.0 <= latitude <= 90.0 and -180.0 <= longitude <= 180.0):
            raise GeocodingError("Nominatim returned coordinates outside the valid range.")
        display_name = hit.get("display_name")
        name = display_name.strip() if isinstance(display_name, str) and display_name.strip() else query
        return GeocodeResult(
            query=query,
            latitude=latitude,
            longitude=longitude,
            display_name=name,
            retrieved_at=datetime.now(timezone.utc),
            cached=False,
        )


def _nominatim_error(payload: dict) -> str | None:
    for key in ("error", "message", "reason"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None
