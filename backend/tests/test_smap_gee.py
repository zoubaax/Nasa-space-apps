"""Comprehensive test suite for NASA SMAP Level-4 SPL4SMGP V008 Earth Engine integration."""

from __future__ import annotations

from datetime import date
import os
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.api.deps import build_http_client, build_smap_gee_service, get_smap_gee_service
from app.core.config import Settings
from app.core.exceptions import InvalidRequestError
from app.main import app
from app.services.cache import FileCache
from app.services.geocoding import GeocodingService
from app.services.smap_dictionary import (
    AGRICULTURAL_VARIABLE_IDS,
    ALL_VARIABLE_IDS,
    CATEGORIES,
    SMAP_VARIABLES,
    get_variable_metadata,
)
from app.services.smap_gee import SmapGeeRequest, SmapGeeService


def test_variable_dictionary_completeness() -> None:
    """Verify all 46 SMAP L4 V008 bands have complete metadata and 8 Darija explanation points."""
    assert len(SMAP_VARIABLES) == 46
    assert len(ALL_VARIABLE_IDS) == 46
    assert len(AGRICULTURAL_VARIABLE_IDS) == 16

    for vid, meta in SMAP_VARIABLES.items():
        assert meta.id == vid
        assert meta.name_en
        assert meta.name_fr
        assert meta.category in CATEGORIES
        assert meta.raw_unit
        assert meta.display_unit

        # Verify all 8 Moroccan Darija explanation components
        assert meta.darija_what, f"Missing darija_what for {vid}"
        assert meta.darija_why_agri, f"Missing darija_why_agri for {vid}"
        assert meta.darija_unit, f"Missing darija_unit for {vid}"
        assert meta.darija_source, f"Missing darija_source for {vid}"
        assert meta.darija_conclusion_allowed, f"Missing conclusion_allowed for {vid}"
        assert meta.darija_conclusion_forbidden, f"Missing conclusion_forbidden for {vid}"


def test_smap_gee_request_validation(tmp_path) -> None:
    """Verify temporal bounds, date ordering, and maximum date range limits."""
    settings = Settings(cache_dir=tmp_path)
    cache = FileCache(settings.cache_dir)
    client = MagicMock()
    geocoder = GeocodingService(settings, cache, client)
    service = SmapGeeService(settings, cache, geocoder)

    # Inverted dates
    with pytest.raises(InvalidRequestError) as exc_info:
        service._validate_request(
            SmapGeeRequest(start_date=date(2025, 6, 1), end_date=date(2025, 1, 1))
        )
    assert "start_date must be on or before end_date" in str(exc_info.value)

    # Date prior to SMAP mission commencement (2015-03-31)
    with pytest.raises(InvalidRequestError) as exc_info:
        service._validate_request(
            SmapGeeRequest(start_date=date(2014, 1, 1), end_date=date(2014, 12, 31))
        )
    assert "commencement of NASA SMAP" in str(exc_info.value)

    # Future date
    with pytest.raises(InvalidRequestError) as exc_info:
        service._validate_request(
            SmapGeeRequest(start_date=date(2099, 1, 1), end_date=date(2099, 12, 31))
        )
    assert "cannot extend after" in str(exc_info.value)


def test_smap_unit_conversions() -> None:
    """Verify physical unit conversions (Kelvin to Celsius, kg/m^2/s to mm/day)."""
    temp_meta = get_variable_metadata("soil_temp_layer1")
    assert temp_meta is not None
    assert temp_meta.convert_raw_to_display is not None
    # 273.15 K = 0.0 °C
    assert temp_meta.convert_raw_to_display(273.15) == 0.0
    # 293.15 K = 20.0 °C
    assert temp_meta.convert_raw_to_display(293.15) == 20.0

    et_meta = get_variable_metadata("land_evapotranspiration_flux")
    assert et_meta is not None
    assert et_meta.convert_raw_to_display is not None
    # 1e-5 kg/m^2/s * 86400 = 0.864 mm/day
    assert et_meta.convert_raw_to_display(1e-5) == 0.864


def test_smap_darija_explanation_generation(tmp_path) -> None:
    """Verify dynamic Darija explanation generation for various soil moisture regimes."""
    settings = Settings(cache_dir=tmp_path)
    cache = FileCache(settings.cache_dir)
    client = MagicMock()
    geocoder = GeocodingService(settings, cache, client)
    service = SmapGeeService(settings, cache, geocoder)

    # 1. Normal/Optimal soil moisture
    resp_opt = service.explain_variable("sm_rootzone", value=0.28, previous_value=0.22)
    assert resp_opt.variable_id == "sm_rootzone"
    assert "0.28 m³/m³" in resp_opt.display_value
    assert "مثالية" in resp_opt.interpretation
    assert "زادت وطلعات" in resp_opt.temporal_change

    # 2. Dry / drought soil moisture
    resp_dry = service.explain_variable("sm_rootzone", value=0.12, previous_value=0.18)
    assert "إجهاد مائي حاد" in resp_dry.interpretation
    assert "هبطات ونقصات" in resp_dry.temporal_change

    # 3. Missing observation
    resp_null = service.explain_variable("sm_rootzone", value=None)
    assert "ما رجعاتهاش وكالة ناسا" in resp_null.interpretation
    assert "الأمانة" in resp_null.interpretation


def test_smap_variables_api_endpoint() -> None:
    """Test /api/smap-gee/variables endpoint."""
    with TestClient(app) as client:
        res = client.get("/api/smap-gee/variables")
    assert res.status_code == 200
    data = res.json()
    assert data["total_variables"] == 46
    assert data["agricultural_count"] == 16
    assert "soil_moisture" in data["categories"]
    assert "sm_surface" in data["variables"]
    assert "sm_rootzone" in data["variables"]


def test_smap_explain_api_endpoint() -> None:
    """Test /api/smap-gee/explain endpoint."""
    with TestClient(app) as client:
        res = client.get(
            "/api/smap-gee/explain",
            params={
                "variable": "sm_surface",
                "value": 0.21,
                "location": "Meknes, Morocco",
                "period": "Janvier 2025",
            },
        )
    assert res.status_code == 200
    data = res.json()
    assert data["variable_id"] == "sm_surface"
    assert "0.21 m³/m³" in data["display_value"]
    assert "الرطوبة ديال الطبقة الفوقانية" in data["what"]
    assert "البذور" in data["why_agri"]
    assert data["conclusions_allowed"]
    assert data["conclusions_forbidden"]


def test_smap_gee_mocked_timeseries(tmp_path) -> None:
    """Test end-to-end timeseries extraction using mock Earth Engine."""
    settings = Settings(cache_dir=tmp_path)
    cache = FileCache(settings.cache_dir)
    client = MagicMock()
    geocoder = GeocodingService(settings, cache, client)
    service = SmapGeeService(settings, cache, geocoder)

    # Mock Earth Engine getInfo result
    mock_features = [
        {
            "properties": {
                "year": 2025,
                "month": 1,
                "count": 248,
                "start_date": "2025-01-01",
                "sm_surface": 0.2109277844,
                "sm_rootzone": 0.2572526634,
                "sm_profile": 0.2800000000,
                "sm_surface_wetness": 0.52,
                "sm_rootzone_wetness": 0.61,
                "sm_rootzone_pctl": 45.0,
                "sm_surface_anomaly": 0.015,
                "soil_temp_layer1": 283.15,  # 10.0 °C
                "soil_temp_layer2": 285.15,  # 12.0 °C
                "land_evapotranspiration_flux": 1.5e-5,
                "soil_water_infiltration_flux": 2.0e-5,
                "overland_runoff_flux": 1.0e-6,
                "land_fraction_wilting": 0.05,
                "vegetation_greenness_fraction": 0.65,
                "leaf_area_index": 1.45,
                "precipitation_total_surface_flux": 3.0e-5,
            }
        },
        {
            "properties": {
                "year": 2025,
                "month": 2,
                "count": 224,
                "start_date": "2025-02-01",
                "sm_surface": 0.2389,
                "sm_rootzone": 0.2765,
                "sm_profile": 0.2950,
                "sm_surface_wetness": 0.58,
                "sm_rootzone_wetness": 0.66,
                "sm_rootzone_pctl": 55.0,
                "sm_surface_anomaly": 0.025,
                "soil_temp_layer1": 285.15,  # 12.0 °C
                "soil_temp_layer2": 287.15,  # 14.0 °C
                "land_evapotranspiration_flux": 2.0e-5,
                "soil_water_infiltration_flux": 2.5e-5,
                "overland_runoff_flux": 1.5e-6,
                "land_fraction_wilting": 0.03,
                "vegetation_greenness_fraction": 0.72,
                "leaf_area_index": 1.80,
                "precipitation_total_surface_flux": 4.0e-5,
            }
        },
    ]

    mock_ee = MagicMock()
    mock_fc = MagicMock()
    mock_fc.getInfo.return_value = {"features": mock_features}
    mock_ee.FeatureCollection.return_value = mock_fc

    with patch.object(service, "_ensure_ee", return_value=mock_ee):
        # Run extraction
        req = SmapGeeRequest(
            start_date=date(2025, 1, 1),
            end_date=date(2025, 2, 28),
            latitude=33.89,
            longitude=-5.55,
            mode="agricultural",
        )
        import asyncio
        resp = asyncio.run(service.get_timeseries(req))

    assert resp.schema_version == "2.0"
    assert resp.mode == "agricultural"
    assert len(resp.monthly_series) == 2
    assert resp.monthly_series[0].month == 1
    assert resp.monthly_series[0].observation_count == 248
    assert resp.monthly_series[0].display_values["sm_surface"] == pytest.approx(0.2109, abs=1e-4)
    assert resp.monthly_series[0].display_values["sm_rootzone"] == pytest.approx(0.2573, abs=1e-4)
    assert resp.monthly_series[0].display_values["soil_temp_layer1"] == pytest.approx(10.0, abs=0.1)

    # Check summary cards
    assert len(resp.summary_cards) > 0
    sm_card = next(c for c in resp.summary_cards if c.id == "sm_rootzone")
    assert sm_card.value == pytest.approx(0.2765, abs=1e-4)
    assert sm_card.change_vs_previous_month_pct is not None
    assert sm_card.change_vs_previous_month_pct > 0  # 0.2765 > 0.2573

    # Check annual summary
    assert len(resp.annual_summary) > 0
    sm_ann = next(a for a in resp.annual_summary if a.variable_id == "sm_rootzone")
    assert sm_ann.mean == pytest.approx((0.2573 + 0.2765) / 2, abs=1e-3)
    assert sm_ann.min == pytest.approx(0.2573, abs=1e-3)
    assert sm_ann.max == pytest.approx(0.2765, abs=1e-3)
    assert sm_ann.completeness_pct == 100.0


def test_reverse_geocoding_endpoint() -> None:
    """Verify the reverse geocoding endpoint returns structured location data."""
    client = TestClient(app)
    response = client.get("/api/smap-gee/reverse-geocode", params={"latitude": 33.89, "longitude": -5.55})
    assert response.status_code == 200
    data = response.json()
    assert "city" in data
    assert "latitude" in data
    assert "longitude" in data
    assert data["latitude"] == 33.89
    assert data["longitude"] == -5.55


@pytest.mark.live
def test_live_smap_gee_meknes_baseline() -> None:
    """Live integration test against Google Earth Engine project fieldshift-514709.

    Verifies the January 2025 baseline at Meknes (33.89, -5.55):
    sm_surface ~ 0.2109 m³/m³, sm_rootzone ~ 0.2572 m³/m³.
    """
    if os.getenv("RUN_LIVE_GEE") != "1":
        pytest.skip("Set RUN_LIVE_GEE=1 to run live Earth Engine SMAP tests.")

    import ee
    try:
        ee.Initialize(project="fieldshift-514709")
    except Exception as e:
        pytest.skip(f"Earth Engine credentials unavailable: {e}")

    point = ee.Geometry.Point([-5.55, 33.89])
    col = ee.ImageCollection("NASA/SMAP/SPL4SMGP/008").filterDate("2025-01-01", "2025-02-01")
    stats = col.mean().reduceRegion(
        reducer=ee.Reducer.mean(),
        geometry=point,
        scale=11000,
    ).getInfo()

    assert stats.get("sm_surface") == pytest.approx(0.2109277844, abs=1e-4)
    assert stats.get("sm_rootzone") == pytest.approx(0.2572526634, abs=1e-4)
