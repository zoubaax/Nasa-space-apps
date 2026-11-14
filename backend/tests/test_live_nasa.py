"""Optional live checks against NASA POWER and Nominatim.

Run with:

    $env:RUN_LIVE_NASA = "1"
    pytest -m live
"""

from __future__ import annotations

import os
from datetime import date

import pytest

from app.api.deps import build_climate_service, build_http_client, get_climate_service
from app.core.config import CLIMATE_PARAMETERS, Settings
from app.main import app

pytestmark = pytest.mark.live

START = date(2025, 6, 1)
END = date(2025, 6, 7)
LATITUDE = 35.7595
LONGITUDE = -5.834


def _live_enabled() -> bool:
    return os.getenv("RUN_LIVE_NASA") == "1"


@pytest.mark.skipif(not _live_enabled(), reason="Set RUN_LIVE_NASA=1 to call NASA POWER.")
def test_live_tangier_coordinates(tmp_path) -> None:
    settings = Settings(cache_dir=tmp_path, nasa_power_timeout_seconds=90)
    http_client = build_http_client(settings)
    service = build_climate_service(settings, http_client)
    app.dependency_overrides[get_climate_service] = lambda: service
    try:
        from fastapi.testclient import TestClient

        with TestClient(app) as client:
            params = {
                "latitude": LATITUDE,
                "longitude": LONGITUDE,
                "start_date": START.isoformat(),
                "end_date": END.isoformat(),
            }
            daily = client.get("/api/climate", params=params)
            summary = client.get("/api/climate/summary", params=params)
            exported = client.get("/api/climate/export", params=params)
    finally:
        # The async client is bound to TestClient's event loop, which is already
        # closed here. Closing it on a new loop raises RuntimeError on Windows.
        app.dependency_overrides.clear()

    assert daily.status_code == 200, daily.text
    body = daily.json()
    assert body["cached"] is False
    assert body["source"] == "NASA POWER"
    assert body["community"] == "AG"
    assert body["observation_count"] == 7
    assert body["period"]["dates_not_returned"] == []
    assert "T2M" in body["units"]
    assert body["units"]["T2M"]
    for row in body["observations"]:
        for name in CLIMATE_PARAMETERS:
            value = row[name]
            assert value is None or isinstance(value, (int, float))
            if isinstance(value, (int, float)):
                assert value > -900
        if row["T2M"] is not None:
            assert -80 <= row["T2M"] <= 60

    assert summary.status_code == 200, summary.text
    summary_body = summary.json()
    assert summary_body["cached"] is True
    assert summary_body["indicators"]["average_temperature"] is not None
    assert summary_body["definitions"]

    assert exported.status_code == 200, exported.text
    assert exported.headers["x-cache-hit"] == "true"
    assert "-999" not in exported.text
    assert exported.text.startswith("date,T2M,")


@pytest.mark.skipif(not _live_enabled(), reason="Set RUN_LIVE_NASA=1 to call Nominatim and NASA POWER.")
def test_live_tangier_city(tmp_path) -> None:
    settings = Settings(
        cache_dir=tmp_path,
        nasa_power_timeout_seconds=90,
        geocoding_min_interval_seconds=1.1,
    )
    http_client = build_http_client(settings)
    service = build_climate_service(settings, http_client)
    app.dependency_overrides[get_climate_service] = lambda: service
    try:
        from fastapi.testclient import TestClient

        with TestClient(app) as client:
            response = client.get(
                "/api/climate",
                params={
                    "city": "Tangier, Morocco",
                    "start_date": START.isoformat(),
                    "end_date": END.isoformat(),
                },
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200, response.text
    location = response.json()["location"]
    assert location["geocoded"] is True
    assert 35.0 < location["requested_latitude"] < 36.2
    assert -6.3 < location["requested_longitude"] < -5.0
    assert response.json()["observation_count"] >= 1
