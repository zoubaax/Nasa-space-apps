"""Response and request models for the climate API."""

from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class ErrorResponse(BaseModel):
    error: str
    message: str
    details: dict = Field(default_factory=dict)


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
    cache_directory: str
    cache_writable: bool


class LocationInfo(BaseModel):
    name: str | None = None
    requested_latitude: float
    requested_longitude: float
    nasa_grid_latitude: float | None = None
    nasa_grid_longitude: float | None = None
    nasa_grid_elevation_m: float | None = None
    geocoded: bool
    geocoder: str | None = None
    geocode_cached: bool | None = None


class PeriodInfo(BaseModel):
    start_date: date
    end_date: date
    requested_day_count: int
    returned_day_count: int
    dates_not_returned: list[date]


class DailyObservation(BaseModel):
    """One civil day of NASA POWER values. Null means the observation was missing."""

    model_config = ConfigDict(extra="forbid")

    date: date
    T2M: float | None = None
    T2M_MAX: float | None = None
    T2M_MIN: float | None = None
    PRECTOTCORR: float | None = None
    RH2M: float | None = None
    WS2M: float | None = None
    ALLSKY_SFC_SW_DWN: float | None = None


class ClimateResponse(BaseModel):
    schema_version: str = "1.0"
    source: str
    community: str
    time_standard: str
    dataset_title: str | None = None
    cached: bool
    retrieved_at: datetime
    nasa_request_url: str | None = None
    location: LocationInfo
    period: PeriodInfo
    units: dict[str, str]
    long_names: dict[str, str]
    fill_value: float
    nasa_messages: list[str]
    notes: list[str]
    missing_value_policy: str
    missing_value_counts: dict[str, int]
    observation_count: int
    observations: list[DailyObservation]


class ThresholdsUsed(BaseModel):
    hot_day_celsius: float
    cold_day_celsius: float
    dry_day_precipitation_mm: float
    hot_day_rule: str
    cold_day_rule: str
    dry_day_rule: str


class Indicators(BaseModel):
    average_temperature: float | None = None
    minimum_temperature: float | None = None
    maximum_temperature: float | None = None
    total_precipitation: float | None = None
    average_relative_humidity: float | None = None
    average_wind_speed: float | None = None
    average_solar_radiation: float | None = None
    dry_days: int | None = None
    hot_days: int | None = None
    cold_days: int | None = None


class IndicatorDefinition(BaseModel):
    name: str
    parameter: str
    description: str
    formula: str
    missing_policy: str


class ParameterCoverage(BaseModel):
    parameter: str
    days_with_values: int
    days_missing: int
    complete: bool


class Coverage(BaseModel):
    requested_day_count: int
    returned_day_count: int
    dates_not_returned: list[date]
    parameters: list[ParameterCoverage]


class SummaryResponse(BaseModel):
    schema_version: str = "1.0"
    source: str
    community: str
    time_standard: str
    dataset_title: str | None = None
    cached: bool
    retrieved_at: datetime
    nasa_request_url: str | None = None
    location: LocationInfo
    period: PeriodInfo
    units: dict[str, str]
    fill_value: float
    nasa_messages: list[str]
    notes: list[str]
    missing_value_policy: str
    thresholds: ThresholdsUsed
    indicators: Indicators
    indicator_units: dict[str, str | None]
    definitions: list[IndicatorDefinition]
    coverage: Coverage
