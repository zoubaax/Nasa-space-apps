"""Orchestrates geocoding, NASA POWER retrieval, and agricultural summaries.

`ClimateDataService` is the boundary a future LangGraph Climate Agent can call.
This module does not start an agent, call an LLM, or retrieve any data source
other than Nominatim and NASA POWER.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timezone

from app.core.config import MISSING_VALUE_POLICY, TIME_STANDARD_NOTE, Settings
from app.core.exceptions import InvalidRequestError
from app.models.climate import (
    ClimateResponse,
    DailyObservation,
    LocationInfo,
    PeriodInfo,
    SummaryResponse,
)
from app.services.climate_analyzer import (
    iter_dates,
    missing_value_counts,
    records_from_frame,
    summarize,
    to_csv,
)
from app.services.geocoding import GeocodingService
from app.services.nasa_power import NasaPowerClient, PowerDataset

SOURCE_NAME = "NASA POWER"


@dataclass(frozen=True)
class ClimateRequest:
    city: str | None
    latitude: float | None
    longitude: float | None
    start_date: date
    end_date: date
    refresh: bool = False


@dataclass(frozen=True)
class ThresholdOverrides:
    hot_day_celsius: float | None = None
    cold_day_celsius: float | None = None
    dry_day_precipitation_mm: float | None = None


@dataclass(frozen=True)
class ResolvedLocation:
    name: str | None
    latitude: float
    longitude: float
    geocoded: bool
    geocoder: str | None
    geocode_cached: bool | None


@dataclass(frozen=True)
class LoadedClimate:
    location: ResolvedLocation
    dataset: PowerDataset


@dataclass(frozen=True)
class CsvExport:
    content: bytes
    filename: str
    media_headers: dict[str, str]


class ClimateDataService:
    def __init__(
        self,
        settings: Settings,
        nasa: NasaPowerClient,
        geocoder: GeocodingService,
    ) -> None:
        self._settings = settings
        self._nasa = nasa
        self._geocoder = geocoder

    async def get_climate(self, request: ClimateRequest) -> ClimateResponse:
        loaded = await self._load(request)
        return self._climate_response(loaded)

    async def get_summary(
        self,
        request: ClimateRequest,
        thresholds: ThresholdOverrides | None = None,
    ) -> SummaryResponse:
        loaded = await self._load(request)
        climate = self._climate_response(loaded)
        resolved_thresholds = self._thresholds(thresholds)
        analysis = summarize(
            loaded.dataset.series.frame,
            start_date=request.start_date,
            end_date=request.end_date,
            units=loaded.dataset.series.units,
            hot_day_celsius=resolved_thresholds[0],
            cold_day_celsius=resolved_thresholds[1],
            dry_day_precipitation_mm=resolved_thresholds[2],
        )
        notes = list(climate.notes)
        notes.extend(analysis.notes)
        return SummaryResponse(
            source=SOURCE_NAME,
            community=self._settings.nasa_power_community,
            time_standard=self._settings.nasa_power_time_standard,
            dataset_title=loaded.dataset.series.source_title,
            cached=loaded.dataset.cached,
            retrieved_at=loaded.dataset.retrieved_at,
            nasa_request_url=loaded.dataset.request_url,
            location=climate.location,
            period=climate.period,
            units=loaded.dataset.series.units,
            fill_value=loaded.dataset.series.fill_value,
            nasa_messages=loaded.dataset.series.nasa_messages,
            notes=notes,
            missing_value_policy=MISSING_VALUE_POLICY,
            thresholds=analysis.thresholds,
            indicators=analysis.indicators,
            indicator_units=analysis.indicator_units,
            definitions=analysis.definitions,
            coverage=analysis.coverage,
        )

    async def get_export(self, request: ClimateRequest) -> CsvExport:
        loaded = await self._load(request)
        filename = _export_filename(
            loaded.location.latitude,
            loaded.location.longitude,
            request.start_date,
            request.end_date,
        )
        units = loaded.dataset.series.units
        unit_header = "; ".join(f"{name}={unit}" for name, unit in units.items())
        headers = {
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-Retrieved-At": loaded.dataset.retrieved_at.isoformat(),
            "X-Cache-Hit": "true" if loaded.dataset.cached else "false",
            "X-Data-Source": "NASA-POWER",
            "X-Latitude": f"{loaded.location.latitude:.4f}",
            "X-Longitude": f"{loaded.location.longitude:.4f}",
            "X-Start-Date": request.start_date.isoformat(),
            "X-End-Date": request.end_date.isoformat(),
        }
        if unit_header and unit_header.isascii() and len(unit_header) < 500:
            headers["X-Parameter-Units"] = unit_header
        return CsvExport(
            content=to_csv(loaded.dataset.series.frame).encode("utf-8"),
            filename=filename,
            media_headers=headers,
        )

    async def build_agent_payload(
        self,
        request: ClimateRequest,
        thresholds: ThresholdOverrides | None = None,
    ) -> dict:
        """JSON-ready summary for a future Climate Agent tool call."""
        summary = await self.get_summary(request, thresholds)
        return summary.model_dump(mode="json")

    async def _load(self, request: ClimateRequest) -> LoadedClimate:
        self._validate_dates(request.start_date, request.end_date)
        location = await self._resolve_location(request)
        dataset = await self._nasa.get_daily(
            latitude=location.latitude,
            longitude=location.longitude,
            start_date=request.start_date,
            end_date=request.end_date,
            refresh=request.refresh,
        )
        return LoadedClimate(location=location, dataset=dataset)

    async def _resolve_location(self, request: ClimateRequest) -> ResolvedLocation:
        if request.latitude is not None or request.longitude is not None:
            if request.latitude is None or request.longitude is None:
                raise InvalidRequestError("latitude and longitude must be provided together.")
            self._validate_coordinates(request.latitude, request.longitude)
            label = request.city.strip() if request.city and request.city.strip() else None
            return ResolvedLocation(
                name=label,
                latitude=self._quantize(request.latitude),
                longitude=self._quantize(request.longitude),
                geocoded=False,
                geocoder=None,
                geocode_cached=None,
            )
        if request.city is None or not request.city.strip():
            raise InvalidRequestError("Provide a city or both latitude and longitude.")
        found = await self._geocoder.geocode(request.city.strip())
        return ResolvedLocation(
            name=found.display_name,
            latitude=self._quantize(found.latitude),
            longitude=self._quantize(found.longitude),
            geocoded=True,
            geocoder="nominatim",
            geocode_cached=found.cached,
        )

    def _validate_dates(self, start_date: date, end_date: date) -> None:
        today = datetime.now(timezone.utc).date()
        if start_date > end_date:
            raise InvalidRequestError("start_date must be on or before end_date.")
        if start_date < self._settings.earliest_date:
            earliest = self._settings.earliest_date.isoformat()
            raise InvalidRequestError(
                f"start_date must be on or after {earliest}, "
                "the start of NASA POWER meteorological coverage."
            )
        if start_date > today or end_date > today:
            raise InvalidRequestError(
                f"The requested period cannot extend after {today.isoformat()} (UTC). "
                "NASA POWER publishes observed data only."
            )
        day_count = (end_date - start_date).days + 1
        if day_count > self._settings.max_date_range_days:
            raise InvalidRequestError(
                f"The requested period is {day_count} days. "
                f"The service limit is {self._settings.max_date_range_days} days."
            )

    @staticmethod
    def _validate_coordinates(latitude: float, longitude: float) -> None:
        if not -90.0 <= latitude <= 90.0:
            raise InvalidRequestError("latitude must be between -90 and 90.")
        if not -180.0 <= longitude <= 180.0:
            raise InvalidRequestError("longitude must be between -180 and 180.")

    def _quantize(self, value: float) -> float:
        return round(float(value), self._settings.coordinate_decimals)

    def _thresholds(self, overrides: ThresholdOverrides | None) -> tuple[float, float, float]:
        overrides = overrides or ThresholdOverrides()
        hot = (
            self._settings.hot_day_threshold_c
            if overrides.hot_day_celsius is None
            else overrides.hot_day_celsius
        )
        cold = (
            self._settings.cold_day_threshold_c
            if overrides.cold_day_celsius is None
            else overrides.cold_day_celsius
        )
        dry = (
            self._settings.dry_day_precipitation_mm
            if overrides.dry_day_precipitation_mm is None
            else overrides.dry_day_precipitation_mm
        )
        if dry < 0:
            raise InvalidRequestError("dry_day_threshold must be zero or greater.")
        return hot, cold, dry

    def _climate_response(self, loaded: LoadedClimate) -> ClimateResponse:
        dataset = loaded.dataset
        series = dataset.series
        requested = iter_dates(dataset.start_date, dataset.end_date)
        returned = set(series.frame["date"].astype(str))
        dates_not_returned = [day for day in requested if day.isoformat() not in returned]
        records = records_from_frame(series.frame)
        observations = [DailyObservation.model_validate(record) for record in records]
        notes = [MISSING_VALUE_POLICY, TIME_STANDARD_NOTE, *series.notes, *dataset.cache_notes]
        return ClimateResponse(
            source=SOURCE_NAME,
            community=self._settings.nasa_power_community,
            time_standard=self._settings.nasa_power_time_standard,
            dataset_title=series.source_title,
            cached=dataset.cached,
            retrieved_at=dataset.retrieved_at,
            nasa_request_url=dataset.request_url,
            location=LocationInfo(
                name=loaded.location.name,
                requested_latitude=loaded.location.latitude,
                requested_longitude=loaded.location.longitude,
                nasa_grid_latitude=series.grid_latitude,
                nasa_grid_longitude=series.grid_longitude,
                nasa_grid_elevation_m=series.grid_elevation_m,
                geocoded=loaded.location.geocoded,
                geocoder=loaded.location.geocoder,
                geocode_cached=loaded.location.geocode_cached,
            ),
            period=PeriodInfo(
                start_date=dataset.start_date,
                end_date=dataset.end_date,
                requested_day_count=len(requested),
                returned_day_count=len(observations),
                dates_not_returned=dates_not_returned,
            ),
            units=series.units,
            long_names=series.long_names,
            fill_value=series.fill_value,
            nasa_messages=series.nasa_messages,
            notes=notes,
            missing_value_policy=MISSING_VALUE_POLICY,
            missing_value_counts=missing_value_counts(series.frame, len(requested)),
            observation_count=len(observations),
            observations=observations,
        )


def _export_filename(latitude: float, longitude: float, start_date: date, end_date: date) -> str:
    lat = f"{latitude:.4f}".replace("-", "neg").replace(".", "p")
    lon = f"{longitude:.4f}".replace("-", "neg").replace(".", "p")
    return f"nasa_power_{lat}_{lon}_{start_date.isoformat()}_{end_date.isoformat()}.csv"
