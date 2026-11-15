"""NASA POWER climate data service."""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException

from app import __version__
from app.api.agro import router as agro_router
from app.api.ai import router as ai_router
from app.api.catalogue import router as catalogue_router
from app.api.climate import router as climate_router
from app.api.i18n import router as i18n_router
from app.api.deps import (
    build_ai_service,
    build_climate_service,
    build_http_client,
    build_simulation_service,
    build_smap_service,
    build_smap_gee_service,
)
from app.api.smap import router as smap_router
from app.api.smap_gee import router as smap_gee_router
from app.core.config import get_settings
from app.core.exceptions import ClimateServiceError
from app.models.climate import HealthResponse

logger = logging.getLogger(__name__)
STATIC_DIR = Path(__file__).resolve().parent / "static"

DESCRIPTION = """
Agricultural climate observations from the NASA POWER Daily Point API.

The service geocodes a city with OpenStreetMap Nominatim, or accepts latitude and
longitude directly, then requests community `AG` daily data for:

`T2M`, `T2M_MAX`, `T2M_MIN`, `PRECTOTCORR`, `RH2M`, `WS2M`, `ALLSKY_SFC_SW_DWN`.

NASA fill values (typically -999) are returned as null and are excluded from
indicator calculations. They are never replaced with estimated weather.

`GET /api/climate/summary` includes the formula and missing-data rule for every indicator.
""".strip()


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    client = build_http_client(settings)
    app.state.settings = settings
    app.state.http_client = client
    app.state.climate_service = build_climate_service(settings, client)
    app.state.smap_service = build_smap_service(settings, client)
    app.state.smap_gee_service = build_smap_gee_service(settings, client)
    app.state.ai_service = build_ai_service(settings, app.state.climate_service, app.state.smap_gee_service)
    app.state.simulation_service = build_simulation_service(
        settings, app.state.climate_service, app.state.smap_gee_service
    )
    logger.info("NASA POWER climate, SMAP GEE, AI chat & Simulation laboratory services ready")
    try:
        yield
    finally:
        await client.aclose()


app = FastAPI(
    title="NASA POWER Climate Data Service",
    version=__version__,
    description=DESCRIPTION,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8080",
        "http://127.0.0.1:8080",
    ],
    allow_origin_regex=r"^https?://.*$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(ClimateServiceError)
async def handle_climate_service_error(_request, exc: ClimateServiceError) -> JSONResponse:
    logger.warning("%s: %s", exc.code, exc.message)
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.code, "message": exc.message, "details": exc.details},
    )


@app.exception_handler(RequestValidationError)
async def handle_request_validation_error(_request: Request, exc: RequestValidationError) -> JSONResponse:
    errors = exc.errors()
    messages = []
    for err in errors:
        loc = " -> ".join(str(p) for p in err.get("loc", []))
        msg = err.get("msg", "Validation error")
        messages.append(f"{loc}: {msg}" if loc else msg)
    combined_message = "; ".join(messages) if messages else "Invalid request parameters."
    logger.warning("validation_error: %s", combined_message)
    return JSONResponse(
        status_code=422,
        content={
            "error": "validation_error",
            "message": combined_message,
            "details": {"validation_errors": jsonable_encoder(errors)},
        },
    )


@app.exception_handler(HTTPException)
async def handle_http_exception(_request: Request, exc: HTTPException) -> JSONResponse:
    detail = exc.detail
    message = detail if isinstance(detail, str) else "HTTP exception occurred."
    details = detail if isinstance(detail, dict) else {}
    logger.warning("http_%s: %s", exc.status_code, message)
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": f"http_{exc.status_code}",
            "message": message,
            "details": details,
        },
    )


@app.get("/", include_in_schema=False)
def root() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/health", response_model=HealthResponse, tags=["health"])
def health(request: Request) -> JSONResponse:
    """Report process health and whether the local cache directory is writable.

    This check does not call NASA POWER or Nominatim.
    """
    settings = getattr(request.app.state, "settings", None) or get_settings()
    cache_dir = settings.cache_dir
    writable = False
    try:
        cache_dir.mkdir(parents=True, exist_ok=True)
        writable = os.access(cache_dir, os.W_OK)
    except OSError:
        writable = False
    body = HealthResponse(
        status="ok" if writable else "degraded",
        service=settings.service_name,
        version=settings.service_version,
        cache_directory=str(cache_dir),
        cache_writable=writable,
    )
    return JSONResponse(status_code=200 if writable else 503, content=body.model_dump())


app.include_router(climate_router)
app.include_router(smap_router)
app.include_router(catalogue_router)
app.include_router(agro_router)
app.include_router(smap_gee_router)
app.include_router(ai_router)
app.include_router(i18n_router)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


def configure_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )


configure_logging()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host="127.0.0.1",
        port=8000,
        reload=True,
        reload_dirs=["app"],
    )
