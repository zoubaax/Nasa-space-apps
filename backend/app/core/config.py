"""Runtime configuration loaded from the environment and `.env`."""

from __future__ import annotations

from datetime import date
from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(__file__).resolve().parents[2]

# Agroclimatology parameters requested from the NASA POWER Daily API.
# Order is part of the response contract.
CLIMATE_PARAMETERS: tuple[str, ...] = (
    "T2M",
    "T2M_MAX",
    "T2M_MIN",
    "PRECTOTCORR",
    "RH2M",
    "WS2M",
    "ALLSKY_SFC_SW_DWN",
)

MISSING_VALUE_POLICY = (
    "NASA POWER fill values (typically -999) are returned as null. "
    "Nulls are missing observations and are never replaced with estimated climate values."
)

TIME_STANDARD_NOTE = (
    "Daily values use NASA POWER local solar time (LST), the Daily API default for this service."
)


class Settings(BaseSettings):
    """Service settings. Defaults are enough to run locally without a `.env` file."""

    model_config = SettingsConfigDict(
        env_file=str(PROJECT_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    nasa_power_base_url: str = "https://power.larc.nasa.gov/api/temporal/daily/point"
    nasa_power_community: str = "AG"
    nasa_power_time_standard: str = "LST"
    nasa_power_timeout_seconds: float = 60.0
    nasa_power_max_retries: int = 3
    http_connect_timeout_seconds: float = 10.0
    retry_base_seconds: float = 0.5
    retry_max_seconds: float = 8.0

    geocoding_base_url: str = "https://nominatim.openstreetmap.org/search"
    geocoding_user_agent: str = (
        "FIELDShift-AI-EarthObservation/1.0 (NASA SMAP Agricultural Explorer; support@fieldshift.ai)"
    )
    geocoding_min_interval_seconds: float = 1.1
    geocoding_timeout_seconds: float = 20.0
    geocoding_max_retries: int = 2

    http_user_agent: str = "NASA-Space-Apps-Climate-Service/0.1 (NASA Space Apps Challenge; local)"
    smap_cmr_url: str = "https://cmr.earthdata.nasa.gov/search/granules.json"
    smap_page_size: int = 20
    smap_max_date_range_days: int = 366
    smap_earliest_date: date = date(2015, 3, 31)

    # Google Earth Engine NASA SMAP Level-4 SPL4SMGP V008 Integration
    gee_project_id: str = "fieldshift-514709"
    smap_l4_gee_dataset: str = "NASA/SMAP/SPL4SMGP/008"
    smap_gee_scale: int = 11000
    smap_gee_max_date_range_days: int = 3660
    smap_gee_3hourly_max_days: int = 31
    smap_gee_earliest_date: date = date(2015, 3, 31)

    # Google Gemini AI Configuration
    gemini_api_key: str | None = None
    gemini_model: str = "gemini-2.5-flash"
    gemini_base_url: str = "https://generativelanguage.googleapis.com/v1beta"
    gemini_timeout_seconds: float = 30.0



    cache_dir: Path = Path("data")
    hot_day_threshold_c: float = 30.0
    cold_day_threshold_c: float = 5.0
    dry_day_precipitation_mm: float = 1.0
    max_date_range_days: int = 3660
    earliest_date: date = date(1981, 1, 1)

    service_name: str = "nasa-power-climate"
    service_version: str = "0.1.0"
    coordinate_decimals: int = Field(default=4, ge=2, le=6)

    @field_validator("cache_dir", mode="before")
    @classmethod
    def _resolve_cache_dir(cls, value: str | Path) -> Path:
        path = Path(value)
        if not path.is_absolute():
            path = PROJECT_ROOT / path
        return path.resolve()


@lru_cache
def get_settings() -> Settings:
    return Settings()
