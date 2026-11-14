"""Client for the NASA POWER Daily Point API.

The client downloads the JSON document NASA returns, stores those bytes unchanged,
and normalizes them. It does not generate climate values.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import date, datetime, timezone

import httpx

from app.core.config import CLIMATE_PARAMETERS, Settings
from app.core.exceptions import (
    InvalidRequestError,
    NasaDataError,
    NasaPowerError,
    NasaPowerNetworkError,
    NasaPowerRateLimitError,
    NasaPowerTimeoutError,
)
from app.services.cache import FileCache
from app.services.climate_analyzer import NormalizedSeries, normalize_power_payload, to_csv
from app.services.http_retry import RetryPolicy, extract_message, get_with_retry

logger = logging.getLogger(__name__)


@dataclass
class PowerDataset:
    series: NormalizedSeries
    retrieved_at: datetime
    cached: bool
    request_url: str | None
    latitude: float
    longitude: float
    start_date: date
    end_date: date
    cache_key: str
    cache_notes: list[str] = field(default_factory=list)


class NasaPowerClient:
    def __init__(self, settings: Settings, cache: FileCache, client: httpx.AsyncClient) -> None:
        self._settings = settings
        self._cache = cache
        self._client = client
        self._locks: dict[str, asyncio.Lock] = {}
        self._locks_guard = asyncio.Lock()

    async def get_daily(
        self,
        *,
        latitude: float,
        longitude: float,
        start_date: date,
        end_date: date,
        refresh: bool = False,
    ) -> PowerDataset:
        key = self._cache.climate_key(
            latitude=latitude,
            longitude=longitude,
            start_date=start_date,
            end_date=end_date,
            parameters=CLIMATE_PARAMETERS,
            community=self._settings.nasa_power_community,
            time_standard=self._settings.nasa_power_time_standard,
        )
        lock = await self._lock_for(key)
        async with lock:
            if not refresh:
                cached = self._load_cached(
                    key,
                    latitude=latitude,
                    longitude=longitude,
                    start_date=start_date,
                    end_date=end_date,
                )
                if cached is not None:
                    logger.info(
                        "NASA POWER cache hit lat=%s lon=%s %s..%s",
                        latitude,
                        longitude,
                        start_date.isoformat(),
                        end_date.isoformat(),
                    )
                    return cached

            dataset = await self._fetch_and_store(
                key,
                latitude=latitude,
                longitude=longitude,
                start_date=start_date,
                end_date=end_date,
            )
            return dataset

    async def _fetch_and_store(
        self,
        key: str,
        *,
        latitude: float,
        longitude: float,
        start_date: date,
        end_date: date,
    ) -> PowerDataset:
        params = {
            "parameters": ",".join(CLIMATE_PARAMETERS),
            "community": self._settings.nasa_power_community,
            "longitude": f"{longitude:.4f}",
            "latitude": f"{latitude:.4f}",
            "start": start_date.strftime("%Y%m%d"),
            "end": end_date.strftime("%Y%m%d"),
            "format": "JSON",
            "time-standard": self._settings.nasa_power_time_standard,
        }
        logger.info(
            "Requesting NASA POWER lat=%s lon=%s %s..%s",
            params["latitude"],
            params["longitude"],
            params["start"],
            params["end"],
        )
        response = await get_with_retry(
            self._client,
            self._settings.nasa_power_base_url,
            params=params,
            headers={
                "Accept": "application/json",
                "User-Agent": self._settings.http_user_agent,
            },
            policy=RetryPolicy(
                service_name="NASA POWER",
                max_retries=self._settings.nasa_power_max_retries,
                base_seconds=self._settings.retry_base_seconds,
                max_seconds=self._settings.retry_max_seconds,
                timeout_error=NasaPowerTimeoutError,
                rate_limit_error=NasaPowerRateLimitError,
                network_error=NasaPowerNetworkError,
                http_error=NasaPowerError,
            ),
        )
        if response.status_code in {400, 422}:
            raise InvalidRequestError(
                f"NASA POWER rejected the request. {extract_message(response)}".strip(),
                details={"upstream_status": response.status_code},
            )
        if response.status_code >= 400:
            raise NasaPowerError(
                f"NASA POWER returned HTTP {response.status_code}. {extract_message(response)}".strip(),
                details={"upstream_status": response.status_code},
            )

        try:
            payload = response.json()
        except ValueError as exc:
            raise NasaDataError("NASA POWER returned a response that is not valid JSON.") from exc
        if not isinstance(payload, dict):
            raise NasaDataError("NASA POWER returned a response that is not a JSON object.")

        series = normalize_power_payload(
            payload,
            parameters=CLIMATE_PARAMETERS,
            start_date=start_date,
            end_date=end_date,
        )
        retrieved_at = datetime.now(timezone.utc)
        request_url = str(response.url)
        cache_notes = self._store(
            key,
            response_body=response.content,
            series=series,
            retrieved_at=retrieved_at,
            request_url=request_url,
            latitude=latitude,
            longitude=longitude,
            start_date=start_date,
            end_date=end_date,
        )
        return PowerDataset(
            series=series,
            retrieved_at=retrieved_at,
            cached=False,
            request_url=request_url,
            latitude=latitude,
            longitude=longitude,
            start_date=start_date,
            end_date=end_date,
            cache_key=key,
            cache_notes=cache_notes,
        )

    def _store(
        self,
        key: str,
        *,
        response_body: bytes,
        series: NormalizedSeries,
        retrieved_at: datetime,
        request_url: str,
        latitude: float,
        longitude: float,
        start_date: date,
        end_date: date,
    ) -> list[str]:
        notes: list[str] = []
        try:
            self._cache.write_bytes(self._cache.raw_path(key), response_body)
            self._cache.write_json(
                self._cache.meta_path(key),
                {
                    "retrieved_at": retrieved_at.isoformat(),
                    "request_url": request_url,
                    "latitude": latitude,
                    "longitude": longitude,
                    "start_date": start_date.isoformat(),
                    "end_date": end_date.isoformat(),
                    "parameters": list(CLIMATE_PARAMETERS),
                    "community": self._settings.nasa_power_community,
                    "time_standard": self._settings.nasa_power_time_standard,
                },
            )
            self._cache.write_text(self._cache.csv_path(key), to_csv(series.frame))
        except OSError as exc:
            logger.exception("Failed to write NASA POWER cache %s", key)
            notes.append(f"Local cache write failed ({exc.__class__.__name__}).")
        return notes

    def _load_cached(
        self,
        key: str,
        *,
        latitude: float,
        longitude: float,
        start_date: date,
        end_date: date,
    ) -> PowerDataset | None:
        raw_path = self._cache.raw_path(key)
        matched_key = key
        if not raw_path.is_file():
            # Spatial near-match within satellite pixel tolerance (~0.08°)
            spatial_path = self._cache.find_matching_raw(
                latitude=latitude,
                longitude=longitude,
                start_date=start_date,
                end_date=end_date,
            )
            if spatial_path is not None and spatial_path.is_file():
                raw_path = spatial_path
                matched_key = spatial_path.stem

        payload = self._cache.read_json(raw_path)
        if payload is None:
            return None
        try:
            series = normalize_power_payload(
                payload,
                parameters=CLIMATE_PARAMETERS,
                start_date=start_date,
                end_date=end_date,
            )
        except NasaDataError:
            logger.warning("Cached NASA payload %s could not be normalized; refetching", matched_key)
            return None

        meta = self._cache.read_json(self._cache.meta_path(matched_key)) or {}
        retrieved_at = _parse_timestamp(meta.get("retrieved_at"))
        if retrieved_at is None:
            retrieved_at = datetime.fromtimestamp(raw_path.stat().st_mtime, tz=timezone.utc)
        request_url = meta.get("request_url")
        if not isinstance(request_url, str):
            request_url = None

        csv_path = self._cache.csv_path(key)
        if not csv_path.is_file():
            try:
                self._cache.write_text(csv_path, to_csv(series.frame))
            except OSError:
                logger.exception("Failed to rebuild processed CSV for %s", key)

        return PowerDataset(
            series=series,
            retrieved_at=retrieved_at,
            cached=True,
            request_url=request_url,
            latitude=latitude,
            longitude=longitude,
            start_date=start_date,
            end_date=end_date,
            cache_key=key,
        )

    async def _lock_for(self, key: str) -> asyncio.Lock:
        async with self._locks_guard:
            lock = self._locks.get(key)
            if lock is None:
                lock = asyncio.Lock()
                self._locks[key] = lock
            return lock


def _parse_timestamp(value: object) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed
