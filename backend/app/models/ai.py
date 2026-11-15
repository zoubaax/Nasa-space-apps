"""Pydantic models for AI intelligence service."""

from __future__ import annotations

from datetime import date
from typing import Any, Literal
from pydantic import BaseModel, Field


class AiChatMessage(BaseModel):
    role: Literal["user", "assistant", "system"]
    content: str


class AiLocationContext(BaseModel):
    name: str = "Meknes, Morocco"
    latitude: float = 33.8900
    longitude: float = -5.5500
    country: str | None = None
    country_code: str | None = None
    region: str | None = None


class AiChatRequest(BaseModel):
    message: str = Field(..., min_length=1, description="Question from user in Darija, French, or English")
    location: AiLocationContext = Field(default_factory=AiLocationContext)
    year: int = Field(default=2025, ge=2015, le=2030)
    start_date: date | None = None
    end_date: date | None = None
    mode: Literal["agricultural", "scientific"] = "agricultural"
    chart_id: str | None = Field(default=None, description="Optional active chart context (e.g. moisture, drought, temperature, water)")
    variable_id: str | None = Field(default=None, description="Optional focused variable (e.g. sm_rootzone, temp_layer1)")
    language: str = Field(default="auto", description="Target language (e.g. darija, ar, fr, es, de, ja, en, auto)")
    history: list[AiChatMessage] = Field(default_factory=list)


class AiChatResponse(BaseModel):
    reply: str
    sources_used: list[str] = Field(default_factory=list)
    specialists_consulted: list[str] = Field(default_factory=list)
    data_evidence: dict[str, Any] = Field(default_factory=dict)
    validation_status: Literal["validated", "partial", "unavailable"] = "validated"
    language_detected: str = "darija"
    farm_country: str | None = None
    farm_language: str | None = None
    confidence_score: float = 0.95
    missing_data_warnings: list[str] = Field(default_factory=list)
    model: str = "fieldshift-ai-engine"


class AiHealthStatus(BaseModel):
    status: str
    model: str
    api_configured: bool
    base_url: str
    services_connected: list[str]
