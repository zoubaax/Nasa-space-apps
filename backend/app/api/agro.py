"""Agronomic recommendations built from NASA POWER."""

from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.api.deps import get_climate_service
from app.models.agro import AgroResponse
from app.models.climate import ErrorResponse
from app.services.agro import advise
from app.services.climate_service import ClimateDataService, ClimateRequest, ThresholdOverrides

router = APIRouter(prefix="/api", tags=["agro"])

_ERROR_RESPONSES = {
    404: {"model": ErrorResponse},
    422: {"model": ErrorResponse},
    429: {"model": ErrorResponse},
    502: {"model": ErrorResponse},
    503: {"model": ErrorResponse},
    504: {"model": ErrorResponse},
}


@router.get(
    "/agro",
    response_model=AgroResponse,
    responses=_ERROR_RESPONSES,
    summary="Recommendations and rotation from NASA POWER",
)
async def get_agro(
    start_date: Annotated[date, Query(description="Inclusive start date, YYYY-MM-DD.")],
    end_date: Annotated[date, Query(description="Inclusive end date, YYYY-MM-DD.")],
    service: Annotated[ClimateDataService, Depends(get_climate_service)],
    city: Annotated[str | None, Query(max_length=200)] = None,
    latitude: Annotated[float | None, Query(ge=-90, le=90)] = None,
    longitude: Annotated[float | None, Query(ge=-180, le=180)] = None,
    refresh: Annotated[bool, Query()] = False,
    hot_day_threshold: Annotated[float | None, Query()] = None,
    cold_day_threshold: Annotated[float | None, Query()] = None,
    dry_day_threshold: Annotated[float | None, Query()] = None,
) -> AgroResponse:
    """Apply documented rules to the NASA POWER summary for this point and period."""
    summary = await service.get_summary(
        ClimateRequest(
            city=city,
            latitude=latitude,
            longitude=longitude,
            start_date=start_date,
            end_date=end_date,
            refresh=refresh,
        ),
        ThresholdOverrides(
            hot_day_celsius=hot_day_threshold,
            cold_day_celsius=cold_day_threshold,
            dry_day_precipitation_mm=dry_day_threshold,
        ),
    )
    return advise(summary)
