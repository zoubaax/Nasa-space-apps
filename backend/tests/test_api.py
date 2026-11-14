"""HTTP contract tests. NASA POWER and Nominatim are mocked."""

from __future__ import annotations

import json

import httpx

from tests.conftest import tangier_geocode
from tests.sample_payload import build_sample_payload

PERIOD = {"start_date": "2025-01-01", "end_date": "2025-01-03"}
COORDINATES = {"latitude": 35.7595, "longitude": -5.834}


def test_health_and_root(api_factory) -> None:
    with api_factory(_nasa_handler()) as api:
        health = api.client.get("/health")
        root = api.client.get("/")

    assert health.status_code == 200
    assert health.json()["status"] == "ok"
    assert health.json()["cache_writable"] is True
    assert "text/html" in root.headers["content-type"]
    assert "NASA POWER" in root.text


def test_city_request_returns_normalized_nasa_observations(api_factory) -> None:
    with api_factory(_nasa_handler()) as api:
        response = api.client.get("/api/climate", params={"city": "Tangier, Morocco", **PERIOD})
        raw_files = [
            path
            for path in (api.cache_dir / "raw").glob("*.json")
            if not path.name.endswith(".meta.json")
        ]
        csv_files = list((api.cache_dir / "processed").glob("*.csv"))

    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "NASA POWER"
    assert body["community"] == "AG"
    assert body["time_standard"] == "LST"
    assert body["cached"] is False
    assert body["retrieved_at"]
    assert "power.larc.nasa.gov" in body["nasa_request_url"]
    assert body["location"]["geocoded"] is True
    assert body["location"]["geocoder"] == "nominatim"
    assert body["location"]["requested_latitude"] == 35.7595
    assert body["location"]["requested_longitude"] == -5.834
    assert body["location"]["nasa_grid_latitude"] == 35.76
    assert body["period"]["requested_day_count"] == 3
    assert body["observation_count"] == 3
    assert body["units"]["PRECTOTCORR"] == "mm/day"
    assert body["units"]["ALLSKY_SFC_SW_DWN"] == "MJ/m^2/day"
    assert body["fill_value"] == -999
    assert body["nasa_messages"] == ["Grid cell note"]
    assert "null" in body["missing_value_policy"]
    by_date = {row["date"]: row for row in body["observations"]}
    assert by_date["2025-01-01"]["T2M"] == 10
    assert by_date["2025-01-02"]["T2M"] is None
    assert by_date["2025-01-02"]["T2M_MIN"] == -1
    assert by_date["2025-01-03"]["PRECTOTCORR"] is None
    assert "2024-12-31" not in by_date
    assert body["missing_value_counts"]["T2M"] == 1
    assert len(raw_files) == 1
    stored = json.loads(raw_files[0].read_text(encoding="utf-8"))
    assert stored["properties"]["parameter"]["T2M"]["20250102"] == -999
    assert len(csv_files) == 1
    assert "-999" not in csv_files[0].read_text(encoding="utf-8")


def test_explicit_coordinates_skip_geocoding(api_factory) -> None:
    calls = {"geo": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        if "nominatim" in request.url.host:
            calls["geo"] += 1
            return tangier_geocode()
        return httpx.Response(200, json=build_sample_payload())

    with api_factory(handler) as api:
        response = api.client.get(
            "/api/climate",
            params={"city": "Tangier, Morocco", **COORDINATES, **PERIOD},
        )

    assert calls["geo"] == 0
    body = response.json()
    assert body["location"]["geocoded"] is False
    assert body["location"]["name"] == "Tangier, Morocco"
    assert body["location"]["geocode_cached"] is None


def test_summary_export_and_cache(api_factory) -> None:
    calls = {"nasa": 0, "geo": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        if "nominatim" in request.url.host:
            calls["geo"] += 1
            return tangier_geocode()
        calls["nasa"] += 1
        return httpx.Response(200, json=build_sample_payload())

    params = {"city": "Tangier, Morocco", **PERIOD}
    with api_factory(handler) as api:
        first = api.client.get("/api/climate", params=params)
        summary = api.client.get("/api/climate/summary", params=params)
        exported = api.client.get("/api/climate/export", params=params)
        refreshed = api.client.get("/api/climate", params={**params, "refresh": True})

    assert first.json()["cached"] is False
    assert summary.status_code == 200
    assert summary.json()["cached"] is True
    indicators = summary.json()["indicators"]
    assert indicators["average_temperature"] == 15
    assert indicators["minimum_temperature"] == -1
    assert indicators["maximum_temperature"] == 36
    assert indicators["total_precipitation"] == 5
    assert indicators["average_relative_humidity"] == 60
    assert indicators["average_wind_speed"] == 3
    assert indicators["average_solar_radiation"] == 15
    assert indicators["dry_days"] == 1
    assert indicators["hot_days"] == 1
    assert indicators["cold_days"] == 2
    assert len(summary.json()["definitions"]) == 10
    assert summary.json()["thresholds"]["hot_day_celsius"] == 30
    assert "not treated as zero" in " ".join(summary.json()["notes"])
    assert exported.status_code == 200
    assert exported.headers["content-type"].startswith("text/csv")
    assert exported.headers["x-cache-hit"] == "true"
    assert exported.text.startswith(
        "date,T2M,T2M_MAX,T2M_MIN,PRECTOTCORR,RH2M,WS2M,ALLSKY_SFC_SW_DWN\n"
    )
    assert "-999" not in exported.text
    assert refreshed.json()["cached"] is False
    assert calls["nasa"] == 2
    assert calls["geo"] == 1


def test_summary_thresholds_can_be_overridden(api_factory) -> None:
    with api_factory(_nasa_handler()) as api:
        response = api.client.get(
            "/api/climate/summary",
            params={
                **COORDINATES,
                **PERIOD,
                "hot_day_threshold": 40,
                "cold_day_threshold": -10,
                "dry_day_threshold": 0,
            },
        )

    indicators = response.json()["indicators"]
    assert indicators["hot_days"] == 0
    assert indicators["cold_days"] == 0
    assert indicators["dry_days"] == 0


def test_invalid_input_does_not_call_nasa(api_factory) -> None:
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        return httpx.Response(500, json={"message": "should not be called"})

    with api_factory(handler, max_date_range_days=5) as api:
        missing = api.client.get("/api/climate", params=PERIOD)
        blank_city = api.client.get("/api/climate", params={"city": "   ", **PERIOD})
        partial = api.client.get("/api/climate", params={"latitude": 35.7, **PERIOD})
        inverted = api.client.get(
            "/api/climate",
            params={**COORDINATES, "start_date": "2025-02-01", "end_date": "2025-01-01"},
        )
        too_early = api.client.get(
            "/api/climate",
            params={**COORDINATES, "start_date": "1980-12-31", "end_date": "1981-01-02"},
        )
        future = api.client.get(
            "/api/climate",
            params={**COORDINATES, "start_date": "2099-01-01", "end_date": "2099-01-02"},
        )
        too_long = api.client.get(
            "/api/climate",
            params={**COORDINATES, "start_date": "2025-01-01", "end_date": "2025-01-10"},
        )
        out_of_range = api.client.get(
            "/api/climate",
            params={"latitude": 95, "longitude": 0, **PERIOD},
        )

    assert calls["n"] == 0
    assert missing.status_code == 422
    assert missing.json()["error"] == "invalid_request"
    assert blank_city.status_code == 422
    assert partial.status_code == 422
    assert partial.json()["message"] == "latitude and longitude must be provided together."
    assert inverted.status_code == 422
    assert "1981-01-01" in too_early.json()["message"]
    assert "observed data only" in future.json()["message"]
    assert "service limit" in too_long.json()["message"]
    assert out_of_range.status_code == 422


def test_unknown_city_returns_404(api_factory) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if "nominatim" in request.url.host:
            return httpx.Response(200, json=[])
        raise AssertionError("NASA should not be called when geocoding finds nothing")

    with api_factory(handler) as api:
        response = api.client.get("/api/climate", params={"city": "Atlantis", **PERIOD})

    assert response.status_code == 404
    assert response.json()["error"] == "city_not_found"
    assert "Atlantis" in response.json()["message"]


def test_nasa_client_and_empty_responses(api_factory) -> None:
    bad_calls = {"n": 0}

    def bad_request(request: httpx.Request) -> httpx.Response:
        bad_calls["n"] += 1
        return httpx.Response(400, json={"message": "Invalid date range"})

    with api_factory(bad_request) as api:
        rejected = api.client.get("/api/climate", params={**COORDINATES, **PERIOD})
    assert rejected.status_code == 422
    assert rejected.json()["error"] == "invalid_request"
    assert bad_calls["n"] == 1

    attempts = {"n": 0}

    def recovers(request: httpx.Request) -> httpx.Response:
        attempts["n"] += 1
        if attempts["n"] == 1:
            return httpx.Response(503, json={"message": "busy"})
        return httpx.Response(200, json=build_sample_payload())

    with api_factory(recovers) as api:
        recovered = api.client.get("/api/climate", params={**COORDINATES, **PERIOD})
    assert recovered.status_code == 200
    assert attempts["n"] == 2

    def empty(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"properties": {"parameter": {}}})

    with api_factory(empty) as api:
        missing = api.client.get("/api/climate", params={**COORDINATES, **PERIOD})
    assert missing.status_code == 502
    assert missing.json()["error"] == "nasa_empty"


def test_timeout_is_gateway_timeout(api_factory) -> None:
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        raise httpx.TimeoutException("timed out")

    with api_factory(handler, nasa_power_max_retries=1) as api:
        response = api.client.get("/api/climate", params={**COORDINATES, **PERIOD})

    assert response.status_code == 504
    assert response.json()["error"] == "nasa_timeout"
    assert calls["n"] == 2


def test_agent_payload_is_the_summary_document(tmp_path) -> None:
    from datetime import date

    from app.api.deps import build_climate_service
    from app.core.config import Settings
    from app.services.climate_service import ClimateRequest

    settings = Settings(
        cache_dir=tmp_path,
        nasa_power_max_retries=0,
        retry_base_seconds=0,
        retry_max_seconds=0,
        geocoding_min_interval_seconds=0,
    )

    async def _load() -> dict:
        async with httpx.AsyncClient(transport=httpx.MockTransport(_nasa_handler())) as http_client:
            service = build_climate_service(settings, http_client)
            return await service.build_agent_payload(
                ClimateRequest(
                    city=None,
                    latitude=35.7595,
                    longitude=-5.834,
                    start_date=date(2025, 1, 1),
                    end_date=date(2025, 1, 3),
                )
            )

    import asyncio

    payload = asyncio.run(_load())
    assert payload["schema_version"] == "1.0"
    assert payload["indicators"]["average_temperature"] == 15
    assert payload["indicators"]["dry_days"] == 1
    assert len(payload["definitions"]) == 10


def _nasa_handler():
    def handler(request: httpx.Request) -> httpx.Response:
        if "nominatim" in request.url.host:
            return tangier_geocode()
        return httpx.Response(200, json=build_sample_payload())

    return handler
