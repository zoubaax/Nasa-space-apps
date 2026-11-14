"""SMAP granule search routes."""

from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.api.deps import get_smap_service
from app.models.climate import ErrorResponse
from app.models.smap import SmapResponse
from app.services.smap import SmapRequest, SmapService

router = APIRouter(prefix="/api", tags=["smap"])

_ERROR_RESPONSES = {
    404: {"model": ErrorResponse},
    422: {"model": ErrorResponse},
    429: {"model": ErrorResponse},
    502: {"model": ErrorResponse},
    503: {"model": ErrorResponse},
    504: {"model": ErrorResponse},
}


@router.get(
    "/smap",
    response_model=SmapResponse,
    responses=_ERROR_RESPONSES,
    summary="SMAP granules covering a point",
)
async def get_smap(
    product: Annotated[
        str,
        Query(description="SMAP short name: SPL3SMP_E or SPL4SMGP."),
    ],
    start_date: Annotated[date, Query(description="Inclusive start date, YYYY-MM-DD.")],
    end_date: Annotated[date, Query(description="Inclusive end date, YYYY-MM-DD.")],
    service: Annotated[SmapService, Depends(get_smap_service)],
    city: Annotated[str | None, Query(max_length=200)] = None,
    latitude: Annotated[float | None, Query(ge=-90, le=90)] = None,
    longitude: Annotated[float | None, Query(ge=-180, le=180)] = None,
    refresh: Annotated[bool, Query(description="Bypass the local CMR cache.")] = False,
) -> SmapResponse:
    """List real NASA CMR granules for SPL3SMP_E or SPL4SMGP.

    The response contains granule names, times, sizes, and download links.
    It does not contain volumetric soil moisture.
    """
    return await service.search(
        SmapRequest(
            product=product,
            city=city,
            latitude=latitude,
            longitude=longitude,
            start_date=start_date,
            end_date=end_date,
            refresh=refresh,
        )
    )
