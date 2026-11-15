"""FastAPI dependencies."""

from __future__ import annotations

import httpx
from fastapi import Request

from app.core.config import Settings, get_settings
from app.services.agri_simulation import AgriSimulationService
from app.services.ai_context import AiContextBuilder
from app.services.ai_service import AiService
from app.services.cache import FileCache
from app.services.climate_service import ClimateDataService
from app.services.geocoding import GeocodingService
from app.services.i18n_service import I18nTranslationService
from app.services.nasa_power import NasaPowerClient
from app.services.smap import SmapService
from app.services.smap_gee import SmapGeeService


def build_ai_service(
    settings: Settings,
    climate_service: ClimateDataService,
    smap_gee_service: SmapGeeService,
) -> AiService:
    context_builder = AiContextBuilder(climate_service, smap_gee_service)
    return AiService(settings, context_builder)


def get_ai_service(request: Request) -> AiService:
    service = getattr(request.app.state, "ai_service", None)
    if service is None:
        settings = get_app_settings(request)
        http_client = getattr(request.app.state, "http_client", None) or build_http_client(settings)
        climate = getattr(request.app.state, "climate_service", None) or build_climate_service(settings, http_client)
        smap_gee = getattr(request.app.state, "smap_gee_service", None) or build_smap_gee_service(settings, http_client)
        service = build_ai_service(settings, climate, smap_gee)
        request.app.state.ai_service = service
    return service


def build_simulation_service(
    settings: Settings,
    climate_service: ClimateDataService,
    smap_gee_service: SmapGeeService,
) -> AgriSimulationService:
    context_builder = AiContextBuilder(climate_service, smap_gee_service)
    return AgriSimulationService(context_builder, geocoder=getattr(climate_service, "_geocoder", None))


def get_simulation_service(request: Request) -> AgriSimulationService:
    service = getattr(request.app.state, "simulation_service", None)
    if service is None:
        settings = get_app_settings(request)
        http_client = getattr(request.app.state, "http_client", None) or build_http_client(settings)
        climate = getattr(request.app.state, "climate_service", None) or build_climate_service(settings, http_client)
        smap_gee = getattr(request.app.state, "smap_gee_service", None) or build_smap_gee_service(settings, http_client)
        service = build_simulation_service(settings, climate, smap_gee)
        request.app.state.simulation_service = service
    return service


def build_i18n_service(settings: Settings) -> I18nTranslationService:
    return I18nTranslationService(settings)


def get_i18n_service(request: Request) -> I18nTranslationService:
    service = getattr(request.app.state, "i18n_service", None)
    if service is None:
        settings = get_app_settings(request)
        service = build_i18n_service(settings)
        request.app.state.i18n_service = service
    return service


def build_climate_service(settings: Settings, http_client: httpx.AsyncClient) -> ClimateDataService:
    cache = FileCache(settings.cache_dir)
    return ClimateDataService(
        settings,
        NasaPowerClient(settings, cache, http_client),
        GeocodingService(settings, cache, http_client),
    )


def build_smap_service(settings: Settings, http_client: httpx.AsyncClient) -> SmapService:
    cache = FileCache(settings.cache_dir)
    return SmapService(
        settings,
        cache,
        http_client,
        GeocodingService(settings, cache, http_client),
    )


def build_smap_gee_service(settings: Settings, http_client: httpx.AsyncClient) -> SmapGeeService:
    cache = FileCache(settings.cache_dir)
    geocoder = GeocodingService(settings, cache, http_client)
    return SmapGeeService(settings, cache, geocoder)


def get_climate_service(request: Request) -> ClimateDataService:
    service = getattr(request.app.state, "climate_service", None)
    if service is None:
        raise RuntimeError("Climate service is not initialized.")
    return service


def get_smap_service(request: Request) -> SmapService:
    service = getattr(request.app.state, "smap_service", None)
    if service is None:
        raise RuntimeError("SMAP service is not initialized.")
    return service


def get_smap_gee_service(request: Request) -> SmapGeeService:
    service = getattr(request.app.state, "smap_gee_service", None)
    if service is None:
        settings = getattr(request.app.state, "settings", None) or get_settings()
        http_client = getattr(request.app.state, "http_client", None) or build_http_client(settings)
        service = build_smap_gee_service(settings, http_client)
        request.app.state.smap_gee_service = service
    return service


def build_http_client(settings: Settings) -> httpx.AsyncClient:
    timeout = httpx.Timeout(
        settings.nasa_power_timeout_seconds,
        connect=settings.http_connect_timeout_seconds,
    )
    return httpx.AsyncClient(
        timeout=timeout,
        follow_redirects=True,
        headers={"User-Agent": settings.http_user_agent},
    )


def get_app_settings(request: Request) -> Settings:
    settings = getattr(request.app.state, "settings", None)
    if settings is None:
        return get_settings()
    return settings
