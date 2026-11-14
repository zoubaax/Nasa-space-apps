"""Find SMAP granules through the public NASA CMR catalogue.

CMR returns the files that cover a point. It does not return a soil-moisture
number. Those values live in the HDF5 granules and need a NASA Earthdata login,
so this service never invents them.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
from dataclasses import dataclass
from datetime import date, datetime, timezone

import httpx

from app.core.config import Settings
from app.core.exceptions import (
    InvalidRequestError,
    SmapError,
    SmapNetworkError,
    SmapRateLimitError,
    SmapTimeoutError,
)
from app.models.climate import LocationInfo
from app.models.smap import SmapGranule, SmapResponse
from app.services.cache import FileCache
from app.services.geocoding import GeocodingService
from app.services.http_retry import RetryPolicy, extract_message, get_with_retry

logger = logging.getLogger(__name__)

_DATA_LINK = "/data#"


@dataclass(frozen=True)
class SmapProduct:
    short_name: str
    version: str
    data: str
    resolution_km: int | None
    resolution: str
    usage: str
    temporal_resolution: str
    source: str
    earliest: date
    value_note: str


_SMAP_SOURCE = "NASA CMR / NSIDC SMAP"
_SMAP_NOTE = (
    "L'humidité volumétrique est dans le fichier HDF5. "
    "Ce service ne l'extrait pas et n'invente aucune valeur. "
    "Le téléchargement demande un compte NASA Earthdata."
)

SMAP_PRODUCTS: dict[str, SmapProduct] = {
    "SPL3SMP_E": SmapProduct(
        short_name="SPL3SMP_E",
        version="006",
        data="Humidité superficielle du sol",
        resolution_km=9,
        resolution="9 km",
        usage="Analyse régionale de l'humidité",
        temporal_resolution="quotidienne",
        source=_SMAP_SOURCE,
        earliest=date(2015, 3, 31),
        value_note=_SMAP_NOTE,
    ),
    "SPL4SMGP": SmapProduct(
        short_name="SPL4SMGP",
        version="008",
        data="Humidité en surface et dans la zone racinaire",
        resolution_km=9,
        resolution="9 km",
        usage="Analyse agricole plus complète",
        temporal_resolution="toutes les 3 heures",
        source=_SMAP_SOURCE,
        earliest=date(2015, 3, 31),
        value_note=_SMAP_NOTE,
    ),
}

CATALOGUE: dict[str, SmapProduct] = {
    **SMAP_PRODUCTS,
    "GPM_3IMERGDF": SmapProduct(
        short_name="GPM_3IMERGDF",
        version="07",
        data="Précipitations journalières IMERG Final",
        resolution_km=10,
        resolution="0,1° (environ 10 km)",
        usage="Améliorer l'analyse des précipitations",
        temporal_resolution="quotidienne",
        source="NASA CMR / GES DISC GPM IMERG",
        earliest=date(2000, 6, 1),
        value_note=(
            "La lame d'eau est dans le fichier du granule. "
            "Ce service ne l'extrait pas et n'invente aucun millimètre. "
            "Le téléchargement demande un compte NASA Earthdata."
        ),
    ),
    "HLSL30": SmapProduct(
        short_name="HLSL30",
        version="2.0",
        data="Réflectance de surface Landsat harmonisée (HLS)",
        resolution_km=None,
        resolution="30 m",
        usage="Observer la végétation de la zone",
        temporal_resolution="quotidienne, selon les passages du satellite",
        source="NASA CMR / LP DAAC HLS",
        earliest=date(2013, 4, 11),
        value_note=(
            "Les bandes de réflectance sont dans les GeoTIFF. "
            "Ce service ne calcule pas de NDVI et n'invente aucune valeur de végétation. "
            "Le téléchargement demande un compte NASA Earthdata."
        ),
    ),
}

PRODUCTS = SMAP_PRODUCTS


@dataclass(frozen=True)
class SmapRequest:
    product: str
    start_date: date
    end_date: date
    city: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    refresh: bool = False


class SmapService:
    """Search CMR for the two SMAP products exposed by the tester."""

    def __init__(
        self,
        settings: Settings,
        cache: FileCache,
        client: httpx.AsyncClient,
        geocoder: GeocodingService,
    ) -> None:
        self._settings = settings
        self._cache = cache
        self._client = client
        self._geocoder = geocoder
        self._lock = asyncio.Lock()

    async def search(
        self,
        request: SmapRequest,
        *,
        allowed: dict[str, SmapProduct] | None = None,
    ) -> SmapResponse:
        table = SMAP_PRODUCTS if allowed is None else allowed
        product = table.get(request.product.strip().upper())
        if product is None:
            names = ", ".join(table)
            label = "SMAP product" if allowed is None else "catalogue product"
            raise InvalidRequestError(f"Unknown {label}. Choose one of: {names}.")
        self._validate_dates(product, request.start_date, request.end_date)
        location = await self._resolve_location(request)
        key = _cache_key(
            product,
            location.requested_latitude,
            location.requested_longitude,
            request.start_date,
            request.end_date,
            self._settings.smap_page_size,
        )
        async with self._lock:
            if not request.refresh:
                cached = self._read_cache(key)
                if cached is not None:
                    return self._response(product, location, request, key, cached, cached_hit=True)
            document = await self._fetch(product, location, request)
            self._cache.write_json(self._cache.smap_path(key), document)
            return self._response(product, location, request, key, document, cached_hit=False)

    def _validate_dates(self, product: SmapProduct, start_date: date, end_date: date) -> None:
        today = datetime.now(timezone.utc).date()
        earliest = product.earliest
        if start_date > end_date:
            raise InvalidRequestError("start_date must be on or before end_date.")
        if start_date < earliest:
            raise InvalidRequestError(
                f"start_date must be on or after {earliest.isoformat()} for {product.short_name}."
            )
        if start_date > today or end_date > today:
            raise InvalidRequestError(
                f"The requested period cannot extend after {today.isoformat()} (UTC)."
            )
        day_count = (end_date - start_date).days + 1
        limit = self._settings.smap_max_date_range_days
        if day_count > limit:
            raise InvalidRequestError(
                f"The requested period is {day_count} days. The SMAP search limit is {limit} days."
            )

    async def _resolve_location(self, request: SmapRequest) -> LocationInfo:
        if request.latitude is not None or request.longitude is not None:
            if request.latitude is None or request.longitude is None:
                raise InvalidRequestError("latitude and longitude must be provided together.")
            if not -90.0 <= request.latitude <= 90.0:
                raise InvalidRequestError("latitude must be between -90 and 90.")
            if not -180.0 <= request.longitude <= 180.0:
                raise InvalidRequestError("longitude must be between -180 and 180.")
            label = request.city.strip() if request.city and request.city.strip() else None
            return LocationInfo(
                name=label,
                requested_latitude=round(request.latitude, self._settings.coordinate_decimals),
                requested_longitude=round(request.longitude, self._settings.coordinate_decimals),
                geocoded=False,
            )
        if request.city is None or not request.city.strip():
            raise InvalidRequestError("Provide a city or both latitude and longitude.")
        found = await self._geocoder.geocode(request.city.strip())
        return LocationInfo(
            name=found.display_name,
            requested_latitude=round(found.latitude, self._settings.coordinate_decimals),
            requested_longitude=round(found.longitude, self._settings.coordinate_decimals),
            geocoded=True,
            geocoder="nominatim",
            geocode_cached=found.cached,
        )

    async def _fetch(self, product: SmapProduct, location: LocationInfo, request: SmapRequest) -> dict:
        params = {
            "short_name": product.short_name,
            "version": product.version,
            "point": f"{location.requested_longitude:.4f},{location.requested_latitude:.4f}",
            "temporal": (
                f"{request.start_date.isoformat()}T00:00:00Z,"
                f"{request.end_date.isoformat()}T23:59:59Z"
            ),
            "page_size": str(self._settings.smap_page_size),
            "sort_key": "start_date",
        }
        response = await get_with_retry(
            self._client,
            self._settings.smap_cmr_url,
            params=params,
            headers={"Accept": "application/json"},
            policy=RetryPolicy(
                service_name="NASA CMR",
                max_retries=self._settings.nasa_power_max_retries,
                base_seconds=self._settings.retry_base_seconds,
                max_seconds=self._settings.retry_max_seconds,
                timeout_error=SmapTimeoutError,
                rate_limit_error=SmapRateLimitError,
                network_error=SmapNetworkError,
                http_error=SmapError,
            ),
            timeout=self._settings.nasa_power_timeout_seconds,
        )
        if response.status_code in {400, 422}:
            message = extract_message(response) or "NASA CMR rejected the query."
            raise InvalidRequestError(message, details={"upstream_status": response.status_code})
        if response.status_code >= 400:
            message = extract_message(response)
            suffix = f" {message}" if message else ""
            raise SmapError(
                f"NASA CMR returned HTTP {response.status_code}.{suffix}",
                details={"upstream_status": response.status_code},
            )
        try:
            payload = response.json()
        except ValueError as exc:
            raise SmapError("NASA CMR returned a response that is not JSON.") from exc
        if not isinstance(payload, dict):
            raise SmapError("NASA CMR returned a response that is not a JSON object.")
        hits = _hits(response.headers.get("CMR-Hits"))
        return {
            "retrieved_at": datetime.now(timezone.utc).isoformat(),
            "request_url": str(response.url),
            "hits": hits,
            "payload": payload,
        }

    def _read_cache(self, key: str) -> dict | None:
        document = self._cache.read_json(self._cache.smap_path(key))
        if document is None:
            return None
        if not isinstance(document.get("payload"), dict) or not isinstance(document.get("request_url"), str):
            logger.warning("Ignoring unusable SMAP cache %s", key)
            return None
        return document

    def _response(
        self,
        product: SmapProduct,
        location: LocationInfo,
        request: SmapRequest,
        key: str,
        document: dict,
        *,
        cached_hit: bool,
    ) -> SmapResponse:
        payload = document["payload"]
        granules = granules_from_feed(payload)
        hits = document.get("hits")
        granule_count = hits if isinstance(hits, int) else len(granules)
        retrieved = _parse_timestamp(document.get("retrieved_at"))
        return SmapResponse(
            source=product.source,
            product=product.short_name,
            version=product.version,
            data=product.data,
            resolution_km=product.resolution_km,
            resolution=product.resolution,
            usage=product.usage,
            temporal_resolution=product.temporal_resolution,
            dataset_id=_dataset_id(payload),
            location=location,
            start_date=request.start_date,
            end_date=request.end_date,
            granule_count=granule_count,
            granules_returned=len(granules),
            granules=granules,
            nasa_request_url=document["request_url"],
            notes=_notes(product, granule_count, len(granules), isinstance(hits, int)),
            retrieved_at=retrieved,
            cached=cached_hit,
            cache_key=key,
        )


def granules_from_feed(payload: dict) -> list[SmapGranule]:
    """Read granule metadata from a CMR JSON feed. Soil-moisture fields are ignored."""
    feed = payload.get("feed")
    entries = feed.get("entry") if isinstance(feed, dict) else None
    if isinstance(entries, dict):
        entries = [entries]
    if not isinstance(entries, list):
        return []
    granules: list[SmapGranule] = []
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        title = _text(entry.get("title")) or _text(entry.get("producer_granule_id")) or "granule"
        granules.append(
            SmapGranule(
                id=_text(entry.get("id")) or title,
                title=title,
                time_start=_text(entry.get("time_start")),
                time_end=_text(entry.get("time_end")),
                size_mb=_size_mb(entry.get("granule_size")),
                download_url=_download_url(entry.get("links")),
            )
        )
    return granules


def _notes(product: SmapProduct, granule_count: int, returned: int, hits_known: bool) -> list[str]:
    notes = [
        "Réponse du catalogue public NASA CMR. Chaque ligne est un granule qui couvre le point.",
        product.value_note,
        (
            f"{product.data}. {product.usage}. "
            f"Résolution {product.resolution}, pas de temps {product.temporal_resolution}."
        ),
    ]
    if granule_count == 0:
        notes.append("Aucun granule ne couvre ce point sur cette période.")
    elif granule_count > returned:
        notes.append(
            f"{granule_count} granules couvrent la période. Les {returned} premiers sont listés."
        )
    if not hits_known:
        notes.append("CMR n'a pas envoyé le total CMR-Hits. Le compte affiché est celui de cette page.")
    return notes


def _dataset_id(payload: dict) -> str | None:
    feed = payload.get("feed")
    entries = feed.get("entry") if isinstance(feed, dict) else None
    if isinstance(entries, dict):
        entries = [entries]
    if not isinstance(entries, list):
        return None
    for entry in entries:
        if isinstance(entry, dict):
            dataset = _text(entry.get("dataset_id"))
            if dataset:
                return dataset
    return None


def _download_url(links: object) -> str | None:
    if not isinstance(links, list):
        return None
    for link in links:
        if not isinstance(link, dict):
            continue
        href = _text(link.get("href"))
        relation = _text(link.get("rel")) or ""
        if href and href.startswith("https://") and _DATA_LINK in relation:
            return href
    return None


def _size_mb(value: object) -> float | None:
    if isinstance(value, bool) or value is None:
        return None
    try:
        size = float(value)
    except (TypeError, ValueError):
        return None
    if size < 0:
        return None
    return round(size, 3)


def _hits(value: str | None) -> int | None:
    if value is None or not value.strip().isdigit():
        return None
    return int(value.strip())


def _text(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    text = value.strip()
    return text or None


def _parse_timestamp(value: object) -> datetime:
    if isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value)
        except ValueError:
            parsed = None
        else:
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            return parsed
    return datetime.now(timezone.utc)


def _cache_key(
    product: SmapProduct,
    latitude: float,
    longitude: float,
    start_date: date,
    end_date: date,
    page_size: int,
) -> str:
    identity = "|".join(
        [
            product.short_name,
            product.version,
            f"{latitude:.4f}",
            f"{longitude:.4f}",
            start_date.isoformat(),
            end_date.isoformat(),
            str(page_size),
        ]
    )
    digest = hashlib.sha256(identity.encode("utf-8")).hexdigest()[:16]
    return (
        f"{product.short_name}_{latitude:.4f}_{longitude:.4f}_"
        f"{start_date.strftime('%Y%m%d')}_{end_date.strftime('%Y%m%d')}_{digest}"
    )
