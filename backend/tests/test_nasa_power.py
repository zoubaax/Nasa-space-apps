"""Parsing, retries, and file-cache behavior for the NASA POWER client."""

from __future__ import annotations

import asyncio
from datetime import date

import httpx
import pandas as pd
import pytest

from app.core.config import CLIMATE_PARAMETERS, Settings
from app.core.exceptions import (
    InvalidRequestError,
    NasaDataError,
    NasaPowerRateLimitError,
    NasaPowerTimeoutError,
    NasaPowerNetworkError,
)
from app.services.cache import FileCache
from app.services.climate_analyzer import normalize_power_payload
from app.services.nasa_power import NasaPowerClient
from tests.sample_payload import build_sample_payload

START = date(2025, 1, 1)
END = date(2025, 1, 3)
LATITUDE = 35.7595
LONGITUDE = -5.834


def _settings(tmp_path, **overrides) -> Settings:
    values = {
        "cache_dir": tmp_path,
        "nasa_power_max_retries": 2,
        "retry_base_seconds": 0,
        "retry_max_seconds": 0,
        "geocoding_min_interval_seconds": 0,
    }
    values.update(overrides)
    return Settings(**values)


def _cell(frame: pd.DataFrame, day: str, column: str):
    return frame.loc[frame["date"] == day, column].iloc[0]


def test_normalize_keeps_units_and_converts_fill_values_to_missing() -> None:
    series = normalize_power_payload(
        build_sample_payload(),
        start_date=START,
        end_date=END,
    )

    assert list(series.frame["date"]) == ["2025-01-01", "2025-01-02", "2025-01-03"]
    assert _cell(series.frame, "2025-01-01", "T2M") == 10.0
    assert pd.isna(_cell(series.frame, "2025-01-02", "T2M"))
    assert _cell(series.frame, "2025-01-02", "T2M_MIN") == -1.0
    assert pd.isna(_cell(series.frame, "2025-01-03", "PRECTOTCORR"))
    assert pd.isna(_cell(series.frame, "2025-01-02", "ALLSKY_SFC_SW_DWN"))
    assert "2024-12-31" not in set(series.frame["date"])
    assert series.units["T2M"] == "C"
    assert series.units["PRECTOTCORR"] == "mm/day"
    assert series.units["RH2M"] == "%"
    assert series.units["WS2M"] == "m/s"
    assert series.units["ALLSKY_SFC_SW_DWN"] == "MJ/m^2/day"
    assert series.long_names["T2M"] == "Temperature at 2 Meters"
    assert series.fill_value == -999
    assert series.grid_latitude == pytest.approx(35.76)
    assert series.grid_longitude == pytest.approx(-5.84)
    assert series.grid_elevation_m == pytest.approx(18.0)
    assert series.nasa_messages == ["Grid cell note"]
    assert series.source_title.startswith("NASA/POWER")
    assert any("outside the requested period" in note for note in series.notes)


def test_fill_value_comes_from_the_nasa_header_not_a_hardcoded_sentinel() -> None:
    payload = build_sample_payload()
    payload["header"]["fill_value"] = -998
    payload["properties"]["parameter"]["T2M"]["20250101"] = -5.5
    payload["properties"]["parameter"]["T2M"]["20250102"] = -998
    payload["properties"]["parameter"]["T2M"]["20250103"] = -999

    series = normalize_power_payload(payload, start_date=START, end_date=END)

    assert _cell(series.frame, "2025-01-01", "T2M") == pytest.approx(-5.5)
    assert pd.isna(_cell(series.frame, "2025-01-02", "T2M"))
    assert _cell(series.frame, "2025-01-03", "T2M") == -999


def test_numeric_strings_and_invalid_date_keys() -> None:
    payload = build_sample_payload()
    payload["properties"]["parameter"]["WS2M"]["20250101"] = "2.5"
    payload["properties"]["parameter"]["T2M"]["not-a-date"] = 12

    series = normalize_power_payload(payload, start_date=START, end_date=END)

    assert _cell(series.frame, "2025-01-01", "WS2M") == pytest.approx(2.5)
    assert any("unrecognized date key" in note for note in series.notes)


def test_empty_parameter_block_is_an_error() -> None:
    with pytest.raises(NasaDataError) as caught:
        normalize_power_payload(
            {"properties": {"parameter": {}}},
            start_date=START,
            end_date=END,
        )
    assert caught.value.code == "nasa_empty"


def test_nasa_error_document_without_properties_is_an_error() -> None:
    with pytest.raises(NasaDataError) as caught:
        normalize_power_payload(
            {"message": "The requested date range is not available."},
            start_date=START,
            end_date=END,
        )
    assert "not available" in caught.value.message


def test_request_uses_ag_community_and_retries_transient_http_status(tmp_path) -> None:
    calls = {"n": 0}
    seen: dict[str, str] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        seen.update(dict(request.url.params))
        if calls["n"] == 1:
            return httpx.Response(503, json={"message": "temporarily unavailable"})
        return httpx.Response(200, json=build_sample_payload())

    dataset = asyncio.run(_fetch(tmp_path, handler))

    assert calls["n"] == 2
    assert dataset.cached is False
    assert seen["community"] == "AG"
    assert seen["format"] == "JSON"
    assert seen["time-standard"] == "LST"
    assert seen["latitude"] == "35.7595"
    assert seen["longitude"] == "-5.8340"
    assert seen["start"] == "20250101"
    assert seen["end"] == "20250103"
    for name in CLIMATE_PARAMETERS:
        assert name in seen["parameters"]
    assert pd.isna(_cell(dataset.series.frame, "2025-01-02", "T2M"))


def test_invalid_nasa_request_is_not_retried(tmp_path) -> None:
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        return httpx.Response(400, json={"message": "Invalid date range"})

    with pytest.raises(InvalidRequestError) as caught:
        asyncio.run(_fetch(tmp_path, handler))

    assert calls["n"] == 1
    assert caught.value.status_code == 422
    assert "Invalid date range" in caught.value.message


def test_timeout_and_connection_errors_retry_then_fail(tmp_path) -> None:
    timeout_calls = {"n": 0}

    def timeout_handler(request: httpx.Request) -> httpx.Response:
        timeout_calls["n"] += 1
        raise httpx.TimeoutException("timed out")

    with pytest.raises(NasaPowerTimeoutError):
        asyncio.run(_fetch(tmp_path, timeout_handler, nasa_power_max_retries=1))
    assert timeout_calls["n"] == 2

    network_calls = {"n": 0}

    def network_handler(request: httpx.Request) -> httpx.Response:
        network_calls["n"] += 1
        raise httpx.ConnectError("connection refused")

    with pytest.raises(NasaPowerNetworkError):
        asyncio.run(
            _fetch(tmp_path / "network", network_handler, nasa_power_max_retries=1)
        )
    assert network_calls["n"] == 2


def test_rate_limit_is_retried_then_reported(tmp_path) -> None:
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        return httpx.Response(429, json={"message": "slow down"}, headers={"Retry-After": "0"})

    with pytest.raises(NasaPowerRateLimitError):
        asyncio.run(_fetch(tmp_path, handler, nasa_power_max_retries=1))
    assert calls["n"] == 2


def test_identical_request_uses_cache_until_refresh(tmp_path) -> None:
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        return httpx.Response(200, json=build_sample_payload())

    first = asyncio.run(_fetch(tmp_path, handler))
    second = asyncio.run(_fetch(tmp_path, handler))
    refreshed = asyncio.run(_fetch(tmp_path, handler, refresh=True))

    assert calls["n"] == 2
    assert first.cached is False
    assert second.cached is True
    assert second.retrieved_at == first.retrieved_at
    assert refreshed.cached is False
    raw_files = [
        path
        for path in (tmp_path / "raw").glob("*.json")
        if not path.name.endswith(".meta.json")
    ]
    assert len(raw_files) == 1
    assert b"-999" in raw_files[0].read_bytes()
    csv_text = next((tmp_path / "processed").glob("*.csv")).read_text(encoding="utf-8")
    assert "-999" not in csv_text
    meta = next((tmp_path / "raw").glob("*.meta.json")).read_text(encoding="utf-8")
    assert "retrieved_at" in meta


def test_corrupt_cache_is_refetched(tmp_path) -> None:
    settings = _settings(tmp_path)
    cache = FileCache(settings.cache_dir)
    key = cache.climate_key(
        latitude=LATITUDE,
        longitude=LONGITUDE,
        start_date=START,
        end_date=END,
        parameters=CLIMATE_PARAMETERS,
        community=settings.nasa_power_community,
        time_standard=settings.nasa_power_time_standard,
    )
    cache.write_json(cache.raw_path(key), {"not": "a nasa payload"})
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        return httpx.Response(200, json=build_sample_payload())

    dataset = asyncio.run(_fetch(tmp_path, handler))

    assert calls["n"] == 1
    assert dataset.cached is False
    assert _cell(dataset.series.frame, "2025-01-01", "T2M") == 10.0


async def _fetch(tmp_path, handler, *, refresh: bool = False, **setting_overrides):
    settings = _settings(tmp_path, **setting_overrides)
    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(transport=transport) as http_client:
        client = NasaPowerClient(settings, FileCache(settings.cache_dir), http_client)
        return await client.get_daily(
            latitude=LATITUDE,
            longitude=LONGITUDE,
            start_date=START,
            end_date=END,
            refresh=refresh,
        )
