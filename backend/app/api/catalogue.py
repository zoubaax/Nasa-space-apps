"""CMR catalogue routes for SMAP, GPM IMERG, and HLS Landsat."""

from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.api.deps import get_smap_service
from app.models.climate import ErrorResponse
from app.models.smap import SmapResponse
from app.services.smap import CATALOGUE, SmapRequest, SmapService

router = APIRouter(prefix="/api", tags=["catalogue"])

_ERROR_RESPONSES = {
    404: {"model": ErrorResponse},
    422: {"model": ErrorResponse},
    429: {"model": ErrorResponse},
    502: {"model": ErrorResponse},
    503: {"model": ErrorResponse},
    504: {"model": ErrorResponse},
}


@router.get(
    "/catalogue",
    response_model=SmapResponse,
    responses=_ERROR_RESPONSES,
    summary="NASA granules covering a point",
)
async def get_catalogue(
    product: Annotated[
        str,
        Query(description="SPL3SMP_E, SPL4SMGP, GPM_3IMERGDF, or HLSL30."),
    ],
    start_date: Annotated[date, Query(description="Inclusive start date, YYYY-MM-DD.")],
    end_date: Annotated[date, Query(description="Inclusive end date, YYYY-MM-DD.")],
    service: Annotated[SmapService, Depends(get_smap_service)],
    city: Annotated[str | None, Query(max_length=200)] = None,
    latitude: Annotated[float | None, Query(ge=-90, le=90)] = None,
    longitude: Annotated[float | None, Query(ge=-180, le=180)] = None,
    refresh: Annotated[bool, Query(description="Bypass the local CMR cache.")] = False,
) -> SmapResponse:
    """List real NASA CMR granules. Pixel values stay in the data files."""
    return await service.search(
        SmapRequest(
            product=product,
            city=city,
            latitude=latitude,
            longitude=longitude,
            start_date=start_date,
            end_date=end_date,
            refresh=refresh,
        ),
        allowed=CATALOGUE,
    )
