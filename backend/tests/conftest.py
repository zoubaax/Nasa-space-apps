"""Shared fixtures. External NASA and Nominatim calls are mocked."""

from __future__ import annotations

import warnings
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path

warnings.filterwarnings(
    "ignore",
    message=r"Using `httpx` with `starlette\.testclient` is deprecated",
)

import httpx
import pytest
from fastapi.testclient import TestClient

from app.api.deps import build_climate_service, build_smap_service, get_climate_service, get_smap_service
from app.core.config import Settings, get_settings
from app.main import app
from app.services.climate_service import ClimateDataService
from tests.sample_payload import build_sample_payload

TANGIER = {
    "lat": "35.7595",
    "lon": "-5.8340",
    "display_name": "Tangier, Tanger-Assilah, Morocco",
}


@dataclass
class ApiHarness:
    client: TestClient
    service: ClimateDataService
    cache_dir: Path


@pytest.fixture(autouse=True)
def _reset_app_state() -> Iterator[None]:
    get_settings.cache_clear()
    app.dependency_overrides.clear()
    yield
    app.dependency_overrides.clear()
    get_settings.cache_clear()


@pytest.fixture
def sample_payload() -> dict:
    return build_sample_payload()


@pytest.fixture
def api_factory(tmp_path: Path):
    _case_ids = iter(range(1, 1000))

    @contextmanager
    def _open(handler, **setting_overrides) -> Iterator[ApiHarness]:
        cache_dir = tmp_path / f"case-{next(_case_ids)}"
        settings = Settings(
            cache_dir=cache_dir,
            nasa_power_max_retries=setting_overrides.pop("nasa_power_max_retries", 2),
            geocoding_max_retries=setting_overrides.pop("geocoding_max_retries", 1),
            retry_base_seconds=setting_overrides.pop("retry_base_seconds", 0),
            retry_max_seconds=setting_overrides.pop("retry_max_seconds", 0),
            geocoding_min_interval_seconds=setting_overrides.pop(
                "geocoding_min_interval_seconds", 0
            ),
            **setting_overrides,
        )
        http_client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
        service = build_climate_service(settings, http_client)
        smap_service = build_smap_service(settings, http_client)
        app.dependency_overrides[get_climate_service] = lambda: service
        app.dependency_overrides[get_smap_service] = lambda: smap_service
        try:
            with TestClient(app) as client:
                yield ApiHarness(client=client, service=service, cache_dir=cache_dir)
        finally:
            app.dependency_overrides.clear()

    return _open


def tangier_geocode() -> httpx.Response:
    return httpx.Response(200, json=[TANGIER])
