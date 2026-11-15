"""Models for Universal Dynamic i18n Translation Service."""

from __future__ import annotations

from typing import Any, Literal
from pydantic import BaseModel, Field


class LocationInfoPayload(BaseModel):
    name: str | None = None
    country: str | None = None
    country_code: str | None = None
    lat: float | None = None
    lng: float | None = None


class TranslationRequest(BaseModel):
    target_language: str | None = Field(default="auto", description="Target language code, or 'auto' to detect from location")
    location: LocationInfoPayload | None = Field(default=None, description="Geographic coordinates/country chosen on map")
    strings: dict[str, Any] = Field(..., description="Base English UI strings dictionary")


class TranslationResponse(BaseModel):
    language_code: str
    language_name: str
    language_native: str
    country: str | None = None
    country_flag: str | None = None
    direction: Literal["ltr", "rtl"] = "ltr"
    translated_strings: dict[str, Any]
    cached: bool = False
