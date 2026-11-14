"""Recommendations computed from NASA POWER observations."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.climate import Indicators, LocationInfo, PeriodInfo


class AgroRecommendation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str
    status: str
    rule: str
    observed: str
    message: str


class RotationStep(BaseModel):
    model_config = ConfigDict(extra="forbid")

    order: int
    action: str


class AgroResponse(BaseModel):
    """Rules applied to a real POWER summary. No crop species and no invented yield."""

    model_config = ConfigDict(extra="forbid")

    source: str
    nasa_source: str
    nasa_request_url: str | None = None
    location: LocationInfo
    period: PeriodInfo
    cached: bool
    retrieved_at: datetime
    indicators: Indicators
    indicator_units: dict[str, str | None]
    recommendations: list[AgroRecommendation]
    rotation: list[RotationStep]
    notes: list[str] = Field(default_factory=list)
