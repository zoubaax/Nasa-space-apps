"""Unit and integration tests for In-Situ Soil Sensor endpoints and ESP32 simulation."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_get_latest_sensor_telemetry_defaults() -> None:
    """Verifies that the latest sensor endpoint starts in standby (optional) when not connected."""
    res = client.get("/api/sensors/soil-moisture/latest?smap_rootzone=0.22")
    assert res.status_code == 200
    data = res.json()

    assert data["gpio_pin"] == 34
    assert data["sensor_model"] == "Capacitive Soil Moisture Sensor v1.2"
    assert data["status"] == "standby"
    assert data["is_connected"] is False
    assert data["is_optional"] is True
    assert "اختياري" in data["hydration_verdict_ar"] or "غير متصل" in data["hydration_verdict_ar"]


def test_ingest_real_esp32_payload() -> None:
    """Simulates a real HTTP POST transmission from an ESP32 node."""
    payload = {
        "device_id": "esp32-field-test-01",
        "gpio_pin": 34,
        "adc_raw": 1950,
        "battery_mv": 3320,
        "soil_temp_c": 21.0,
        "rssi_dbm": -58,
    }
    res = client.post("/api/sensors/soil-moisture", json=payload)
    assert res.status_code == 201
    data = res.json()

    assert data["device_id"] == "esp32-field-test-01"
    assert data["adc_raw"] == 1950
    assert data["battery_pct"] > 0
    assert data["soil_temp_c"] == 21.0


def test_virtual_sensor_simulation_triggers() -> None:
    """Tests code-driven field event simulation: irrigation pulse and dry spell."""
    # 1. Trigger irrigation pulse
    res_irr = client.post("/api/sensors/simulate", json={"action": "irrigate"})
    assert res_irr.status_code == 200
    data_irr = res_irr.json()
    assert data_irr["adc_raw"] == 1580  # Wetted soil drops raw ADC count
    assert data_irr["vwc_m3_m3"] > 0.35  # Soil VWC rises significantly
    assert data_irr["fusion_status"] == "irrigation_detected"

    # 2. Trigger dry spell
    res_dry = client.post("/api/sensors/simulate", json={"action": "dry_spell"})
    assert res_dry.status_code == 200
    data_dry = res_dry.json()
    assert data_dry["adc_raw"] == 2920  # Dry soil raises raw ADC count
    assert data_dry["vwc_m3_m3"] < 0.18  # Depleted VWC

    # 3. Reset to optimal baseline
    res_reset = client.post("/api/sensors/simulate", json={"action": "reset_optimal"})
    assert res_reset.status_code == 200
    data_reset = res_reset.json()
    assert data_reset["adc_raw"] == 2240
    assert data_reset["fusion_status"] == "coherent"


def test_edge_broadcast_auto_detection() -> None:
    """Verifies that starting virtual edge broadcast triggers auto-detection, and stopping returns to standby."""
    # 1. Start edge broadcast
    res_start = client.post("/api/sensors/edge-broadcast/start")
    assert res_start.status_code == 200
    assert res_start.json()["is_broadcasting"] is True

    # Check status endpoint
    res_stat = client.get("/api/sensors/edge-broadcast/status")
    assert res_stat.status_code == 200
    assert res_stat.json()["is_broadcasting"] is True

    # 2. Check latest telemetry reflects auto-detection
    res_latest = client.get("/api/sensors/soil-moisture/latest?smap_rootzone=0.22")
    assert res_latest.status_code == 200
    data_latest = res_latest.json()
    assert data_latest["is_connected"] is True
    assert data_latest["status"] == "connected"
    assert data_latest["detection_state"] == "auto_detected"
    assert data_latest["is_broadcasting"] is True

    # 3. Stop edge broadcast
    res_stop = client.post("/api/sensors/edge-broadcast/stop")
    assert res_stop.status_code == 200
    assert res_stop.json()["is_broadcasting"] is False

    # Telemetry returns to standby scanning
    res_standby = client.get("/api/sensors/soil-moisture/latest?smap_rootzone=0.22")
    assert res_standby.status_code == 200
    data_standby = res_standby.json()
    assert data_standby["is_connected"] is False
    assert data_standby["status"] == "standby"
    assert data_standby["detection_state"] == "scanning_standby"

