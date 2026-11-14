"""Response models for the SMAP granule search."""

from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.climate import LocationInfo


class SmapGranule(BaseModel):
    """One NASA granule that covers the requested point. No soil-moisture value."""

    model_config = ConfigDict(extra="forbid")

    id: str
    title: str
    time_start: str | None = None
    time_end: str | None = None
    size_mb: float | None = None
    download_url: str | None = None


class SmapResponse(BaseModel):
    """Catalogue result for one SMAP product. Volumetric moisture stays inside the HDF5 file."""

    model_config = ConfigDict(extra="forbid")

    source: str
    product: str
    version: str
    data: str
    resolution_km: int | None = None
    resolution: str
    usage: str
    temporal_resolution: str
    dataset_id: str | None = None
    location: LocationInfo
    start_date: date
    end_date: date
    granule_count: int
    granules_returned: int
    granules: list[SmapGranule]
    nasa_request_url: str
    notes: list[str] = Field(default_factory=list)
    retrieved_at: datetime
    cached: bool
    cache_key: str
