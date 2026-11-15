"""Pydantic data models for ESP32 In-Situ Soil Moisture Sensor integration."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal
from pydantic import BaseModel, ConfigDict, Field


class Esp32SoilPayload(BaseModel):
    """Raw telemetry payload transmitted by ESP32 node via HTTP POST."""

    model_config = ConfigDict(extra="ignore")

    device_id: str = Field(default="esp32-field-node-01", description="Unique hardware ID of the ESP32 node")
    boot_id: str | None = Field(default=None, description="Boot UUID to detect microcontroller restarts")
    seq: int = Field(default=1, description="Incremental telemetry sequence number")
    gpio_pin: int = Field(default=34, description="Analog ADC pin connected to Capacitive Soil Moisture Sensor v1.2")
    adc_raw: int = Field(ge=0, le=4095, description="12-bit ADC raw integer reading (0 to 4095)")
    battery_mv: int | None = Field(default=3280, description="LiPo / 18650 battery voltage in millivolts")
    soil_temp_c: float | None = Field(default=18.5, description="Soil temperature in Celsius (if NTC/DS18B20 present)")
    rssi_dbm: int | None = Field(default=-65, description="Wi-Fi signal strength in dBm")
    timestamp: str | None = Field(default=None, description="ISO 8601 timestamp generated at edge or gateway")


class SensorCalibrationConfig(BaseModel):
    """Factory and soil-specific calibration curve for Capacitive Sensor v1.2 on GPIO34."""

    adc_dry: int = Field(default=3200, description="Raw ADC count in dry air (0% volumetric water content)")
    adc_wet: int = Field(default=1350, description="Raw ADC count in saturated soil / water (~45-50% VWC)")
    probe_depth_cm: int = Field(default=20, description="Installation depth in centimeters")
    soil_texture: str = Field(default="limoneux_profond", description="Soil texture classification")


class SensorTelemetryData(BaseModel):
    """Calibrated in-situ telemetry reading evaluated with agronomic metrics."""

    model_config = ConfigDict(extra="ignore")

    device_id: str
    gpio_pin: int = 34
    sensor_model: str = "Capacitive Soil Moisture Sensor v1.2"
    status: Literal["connected", "standby", "stale", "malfunction"] = "connected"
    timestamp: str
    last_seen_seconds_ago: int = 0

    # Physical measurements
    adc_raw: int
    adc_normalized_pct: float  # 0 to 100% moisture index
    vwc_m3_m3: float  # Volumetric Water Content (0.00 to 0.50 m3/m3)
    soil_temp_c: float
    battery_mv: int
    battery_pct: int
    rssi_dbm: int

    # Satellite-Ground Truth Fusion (vs NASA SMAP L4)
    smap_rootzone_m3_m3: float | None = None
    discrepancy_delta_m3_m3: float | None = None
    fusion_status: Literal["coherent", "irrigation_detected", "localized_drought", "sensor_airgap"] = "coherent"
    confidence_level: float = 0.98

    # FAO-56 Hydraulic Balances
    field_capacity_fc: float = 0.32
    wilting_point_wp: float = 0.16
    rootzone_depletion_dr_mm: float = 0.0
    hydration_verdict_ar: str = "رطوبة ممتازة ومثالية للجذور"
    hydration_verdict_fr: str = "Hydratation optimale de la zone racinaire"
    hydration_verdict_en: str = "Optimal root-zone hydration"
    action_advice_ar: str = "لا حاجة للسقي اليوم؛ المخزون المائي في مأمن."
    action_advice_fr: str = "Aucune irrigation requise aujourd'hui."
    action_advice_en: str = "No irrigation required today."


class SensorSimulationTrigger(BaseModel):
    """Payload to simulate physical field events in software (irrigation pulse, dry spell, etc.)."""

    action: Literal["irrigate", "dry_spell", "reset_optimal"] = "irrigate"
    irrigation_duration_min: int = Field(default=45, ge=5, le=180)
    device_id: str = "esp32-field-node-01"
