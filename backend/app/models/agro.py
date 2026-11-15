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
    message_darija: str | None = None
    message_localized: str | None = None


class RotationStep(BaseModel):
    model_config = ConfigDict(extra="forbid")

    order: int
    action: str
    action_darija: str | None = None
    action_localized: str | None = None


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
    synthesis_darija: str | None = None
    synthesis_localized: str | None = None
    output_language: str | None = None
    detected_country: str | None = None
    notes: list[str] = Field(default_factory=list)
