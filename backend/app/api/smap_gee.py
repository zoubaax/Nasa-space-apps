"""FastAPI routes for NASA SMAP Level-4 SPL4SMGP V008 through Google Earth Engine."""

from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.api.deps import get_smap_gee_service
from app.core.exceptions import InvalidRequestError
from app.models.climate import ErrorResponse
from app.models.smap_gee import (
    DarijaExplanationResponse,
    SmapGeeResponse,
    ThreeHourlyPoint,
)
from app.services.smap_dictionary import (
    CATEGORIES,
    SMAP_VARIABLES,
)
from app.services.smap_gee import SmapGeeRequest, SmapGeeService

router = APIRouter(prefix="/api/smap-gee", tags=["smap-gee"])

_ERROR_RESPONSES = {
    400: {"model": ErrorResponse},
    404: {"model": ErrorResponse},
    422: {"model": ErrorResponse},
    500: {"model": ErrorResponse},
    502: {"model": ErrorResponse},
    504: {"model": ErrorResponse},
}


@router.get(
    "/timeseries",
    response_model=SmapGeeResponse,
    responses=_ERROR_RESPONSES,
    summary="Extract NASA SMAP L4 monthly time series and annual summaries via Earth Engine",
)
async def get_smap_gee_timeseries(
    service: Annotated[SmapGeeService, Depends(get_smap_gee_service)],
    start_date: Annotated[date | None, Query(description="Inclusive start date (YYYY-MM-DD)")] = None,
    end_date: Annotated[date | None, Query(description="Inclusive end date (YYYY-MM-DD)")] = None,
    year: Annotated[int | None, Query(description="Convenience year selector (e.g. 2025)", ge=2015, le=2030)] = None,
    city: Annotated[str | None, Query(description="City name resolved with Nominatim", max_length=200)] = None,
    latitude: Annotated[float | None, Query(description="Latitude in decimal degrees (-90 to 90)", ge=-90, le=90)] = None,
    longitude: Annotated[float | None, Query(description="Longitude in decimal degrees (-180 to 180)", ge=-180, le=180)] = None,
    mode: Annotated[str, Query(description="Extraction mode: 'agricultural' or 'scientific'")] = "agricultural",
    scale: Annotated[int, Query(description="Spatial aggregation scale in meters (default 11000m for SMAP)", ge=1000, le=50000)] = 11000,
    refresh: Annotated[bool, Query(description="Bypass disk cache and re-query Earth Engine")] = False,
    include_3hourly: Annotated[bool, Query(description="Include 3-hourly time series (only for date ranges <= 31 days)")] = False,
) -> SmapGeeResponse:
    today = datetime.now(timezone.utc).date()

    if year is not None:
        st = date(year, 1, 1)
        en = min(date(year, 12, 31), today)
    else:
        if start_date is None or end_date is None:
            # Default to Meknes full year 2025
            st = date(2025, 1, 1)
            en = min(date(2025, 12, 31), today)
        else:
            st = start_date
            en = end_date

    req = SmapGeeRequest(
        start_date=st,
        end_date=en,
        city=city,
        latitude=latitude,
        longitude=longitude,
        mode=mode,
        scale=scale,
        refresh=refresh,
        include_3hourly=include_3hourly,
    )
    return await service.get_timeseries(req)


@router.get(
    "/3hourly",
    response_model=list[ThreeHourlyPoint],
    responses=_ERROR_RESPONSES,
    summary="High-resolution 3-hourly time series for up to 31 days",
)
async def get_smap_gee_3hourly(
    latitude: Annotated[float, Query(description="Latitude in decimal degrees", ge=-90, le=90)],
    longitude: Annotated[float, Query(description="Longitude in decimal degrees", ge=-180, le=180)],
    start_date: Annotated[date, Query(description="Inclusive start date (YYYY-MM-DD)")],
    end_date: Annotated[date, Query(description="Inclusive end date (YYYY-MM-DD)")],
    service: Annotated[SmapGeeService, Depends(get_smap_gee_service)],
    variables: Annotated[str | None, Query(description="Comma-separated band names")] = None,
) -> list[ThreeHourlyPoint]:
    var_list = [v.strip() for v in variables.split(",") if v.strip()] if variables else None
    return await service.get_three_hourly(
        latitude=latitude,
        longitude=longitude,
        start_date=start_date,
        end_date=end_date,
        variables=var_list,
    )


@router.get(
    "/variables",
    summary="Catalog of all 46 supported NASA SMAP L4 V008 variables and category groupings",
)
def get_smap_variables() -> dict:
    vars_dict = {}
    for vid, meta in SMAP_VARIABLES.items():
        vars_dict[vid] = {
            "id": meta.id,
            "name_en": meta.name_en,
            "name_fr": meta.name_fr,
            "category": meta.category,
            "is_agricultural": meta.is_agricultural,
            "raw_unit": meta.raw_unit,
            "display_unit": meta.display_unit,
            "min_physical": meta.min_physical,
            "max_physical": meta.max_physical,
        }
    return {
        "dataset": "NASA/SMAP/SPL4SMGP/008",
        "total_variables": len(SMAP_VARIABLES),
        "agricultural_count": sum(1 for m in SMAP_VARIABLES.values() if m.is_agricultural),
        "categories": CATEGORIES,
        "variables": vars_dict,
    }


@router.get(
    "/explain",
    response_model=DarijaExplanationResponse,
    responses=_ERROR_RESPONSES,
    summary="Interactive scientific explanation of any SMAP variable in Moroccan Darija (الدارجة المغربية)",
)
def explain_smap_variable(
    variable: Annotated[str, Query(description="SMAP variable id (e.g. sm_surface, sm_rootzone, land_evapotranspiration_flux)")],
    service: Annotated[SmapGeeService, Depends(get_smap_gee_service)],
    value: Annotated[float | None, Query(description="Current or selected observation value")] = None,
    period: Annotated[str, Query(description="Selected period label")] = "الفترة المحددة",
    location: Annotated[str, Query(description="Selected location name")] = "مكناس، المغرب",
    previous_value: Annotated[float | None, Query(description="Previous period value for trend comparison")] = None,
) -> DarijaExplanationResponse:
    return service.explain_variable(
        var_id=variable,
        value=value,
        period=period,
        location_name=location,
        previous_value=previous_value,
    )


@router.get(
    "/reverse-geocode",
    responses=_ERROR_RESPONSES,
    summary="Reverse geocode GPS coordinates to location name via Nominatim",
)
async def reverse_geocode_location(
    service: Annotated[SmapGeeService, Depends(get_smap_gee_service)],
    latitude: Annotated[float, Query(description="Latitude in decimal degrees (-90 to 90)", ge=-90, le=90)],
    longitude: Annotated[float, Query(description="Longitude in decimal degrees (-180 to 180)", ge=-180, le=180)],
):
    return await service.reverse_geocode(latitude, longitude)
