"""Climate routes backed by NASA POWER."""

from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response

from app.api.deps import get_climate_service
from app.core.exceptions import InvalidRequestError
from app.models.climate import ClimateResponse, ErrorResponse, SummaryResponse
from app.services.climate_service import ClimateDataService, ClimateRequest, ThresholdOverrides

router = APIRouter(prefix="/api", tags=["climate"])

_ERROR_RESPONSES = {
    404: {"model": ErrorResponse},
    422: {"model": ErrorResponse},
    429: {"model": ErrorResponse},
    502: {"model": ErrorResponse},
    503: {"model": ErrorResponse},
    504: {"model": ErrorResponse},
}


async def climate_query(
    start_date: Annotated[
        date | None,
        Query(description="Inclusive start date, YYYY-MM-DD.", examples=["2025-01-01"]),
    ] = None,
    end_date: Annotated[
        date | None,
        Query(description="Inclusive end date, YYYY-MM-DD.", examples=["2025-12-31"]),
    ] = None,
    city: Annotated[
        str | None,
        Query(
            description="City name resolved with OpenStreetMap Nominatim. Example: Tangier, Morocco.",
            max_length=200,
        ),
    ] = None,
    latitude: Annotated[
        float | None,
        Query(description="Latitude in decimal degrees. Used directly when longitude is also set.", ge=-90, le=90),
    ] = None,
    longitude: Annotated[
        float | None,
        Query(description="Longitude in decimal degrees. Used directly when latitude is also set.", ge=-180, le=180),
    ] = None,
    refresh: Annotated[
        bool,
        Query(description="Bypass the local file cache and request NASA POWER again."),
    ] = False,
) -> ClimateRequest:
    return _build_request(city, latitude, longitude, start_date, end_date, refresh)


@router.get(
    "/climate",
    response_model=ClimateResponse,
    responses=_ERROR_RESPONSES,
    summary="Daily NASA POWER climate observations",
)
async def get_climate(
    query: Annotated[ClimateRequest, Depends(climate_query)],
    service: Annotated[ClimateDataService, Depends(get_climate_service)],
) -> ClimateResponse:
    """Return normalized daily NASA POWER observations for a city or a coordinate pair."""
    return await service.get_climate(query)


@router.get(
    "/climate/summary",
    response_model=SummaryResponse,
    responses=_ERROR_RESPONSES,
    summary="Agricultural climate indicators",
)
async def get_climate_summary(
    query: Annotated[ClimateRequest, Depends(climate_query)],
    service: Annotated[ClimateDataService, Depends(get_climate_service)],
    hot_day_threshold: Annotated[
        float | None,
        Query(
            description="Hot day when observed T2M_MAX is greater than or equal to this Celsius value.",
            ge=-50,
            le=60,
        ),
    ] = None,
    cold_day_threshold: Annotated[
        float | None,
        Query(
            description="Cold day when observed T2M_MIN is less than or equal to this Celsius value.",
            ge=-80,
            le=45,
        ),
    ] = None,
    dry_day_threshold: Annotated[
        float | None,
        Query(
            description="Dry day when observed PRECTOTCORR is strictly below this value, in NASA's reported unit.",
            ge=0,
            le=500,
        ),
    ] = None,
) -> SummaryResponse:
    """Return agricultural indicators calculated only from observed NASA POWER values."""
    thresholds = ThresholdOverrides(
        hot_day_celsius=hot_day_threshold,
        cold_day_celsius=cold_day_threshold,
        dry_day_precipitation_mm=dry_day_threshold,
    )
    return await service.get_summary(query, thresholds)


@router.get(
    "/climate/export",
    responses=_ERROR_RESPONSES,
    summary="Export normalized daily observations as CSV",
)
async def export_climate(
    query: Annotated[ClimateRequest, Depends(climate_query)],
    service: Annotated[ClimateDataService, Depends(get_climate_service)],
) -> Response:
    """Download the normalized daily table. Empty cells are missing NASA observations."""
    exported = await service.get_export(query)
    return Response(
        content=exported.content,
        media_type="text/csv; charset=utf-8",
        headers=exported.media_headers,
    )


def _build_request(
    city: str | None,
    latitude: float | None,
    longitude: float | None,
    start_date: date | None,
    end_date: date | None,
    refresh: bool,
) -> ClimateRequest:
    cleaned_city = city.strip() if city else None
    if cleaned_city == "":
        cleaned_city = None
    has_latitude = latitude is not None
    has_longitude = longitude is not None
    if has_latitude != has_longitude:
        raise InvalidRequestError("latitude and longitude must be provided together.")
    if cleaned_city is None and not has_latitude:
        raise InvalidRequestError("Provide a city or both latitude and longitude.")
    resolved_start = start_date or date(2025, 1, 1)
    resolved_end = end_date or date(2025, 12, 31)
    if resolved_start > resolved_end:
        raise InvalidRequestError("start_date must be on or before end_date.")
    return ClimateRequest(
        city=cleaned_city,
        latitude=latitude,
        longitude=longitude,
        start_date=resolved_start,
        end_date=resolved_end,
        refresh=refresh,
    )
