"""Pydantic schemas for the NASA SMAP L4 Google Earth Engine integration."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.models.climate import LocationInfo


class SmapVariableInfo(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    name_en: str
    name_fr: str
    category: str
    is_agricultural: bool
    raw_unit: str
    display_unit: str
    min_physical: float | None = None
    max_physical: float | None = None


class MonthlyObservationPoint(BaseModel):
    model_config = ConfigDict(extra="forbid")

    date: str  # YYYY-MM-DD
    year: int
    month: int
    month_name: str
    observation_count: int
    quality_status: str  # "complete", "partial", "missing"
    raw_values: dict[str, float | None]
    display_values: dict[str, float | None]
    notes: list[str] = Field(default_factory=list)


class AnnualSummaryItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    variable_id: str
    name_en: str
    name_fr: str
    mean: float | None = None
    min: float | None = None
    max: float | None = None
    display_unit: str
    completeness_pct: float
    seasonal_trend: str | None = None


class SummaryCard(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    title: str
    category: str
    value: float | None = None
    display_value: str
    display_unit: str
    period: str
    source: str
    change_vs_previous_month_pct: float | None = None
    quality_status: str
    status_tone: str  # "optimal", "normal", "warning", "critical", "info"


class ThreeHourlyPoint(BaseModel):
    model_config = ConfigDict(extra="forbid")

    timestamp: str  # ISO-8601
    date: str
    hour: int
    values: dict[str, float | None]


class SmapGeeResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: str = "2.0"
    source: str = "NASA SMAP Level-4 SPL4SMGP V008 via Google Earth Engine"
    dataset: str = "NASA/SMAP/SPL4SMGP/008"
    gee_project: str = "fieldshift-514709"
    location: LocationInfo
    mode: str  # "agricultural" | "scientific"
    start_date: date
    end_date: date
    spatial_scale_m: int
    retrieved_at: datetime
    cached: bool
    processing_time_ms: float
    summary_cards: list[SummaryCard]
    monthly_series: list[MonthlyObservationPoint]
    annual_summary: list[AnnualSummaryItem]
    three_hourly_series: list[ThreeHourlyPoint] | None = None
    variables: list[SmapVariableInfo]
    categories: dict[str, Any]
    notes: list[str] = Field(default_factory=list)


class DarijaExplanationResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    variable_id: str
    name_en: str
    name_fr: str
    selected_value: float | None = None
    display_value: str
    display_unit: str
    period: str
    location_name: str
    what: str
    why_agri: str
    interpretation: str
    unit_explanation: str
    source: str
    temporal_change: str
    conclusions_allowed: str
    conclusions_forbidden: str
    caveat_note: str
