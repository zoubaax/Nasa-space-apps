"""In-Situ IoT Soil Sensor Telemetry Service.

Handles data ingestion, calibration, persistence, and virtual simulation for
Capacitive Soil Moisture Sensor v1.2 interfaced with ESP32 via GPIO34 ADC.
"""

from __future__ import annotations

import json
import logging
import math
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.core.config import Settings
from app.models.sensor import (
    Esp32SoilPayload,
    SensorCalibrationConfig,
    SensorSimulationTrigger,
    SensorTelemetryData,
)

logger = logging.getLogger(__name__)


class SensorService:
    """Manages in-situ soil moisture sensor data, calibration, and edge simulation."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._cache_dir = Path(settings.cache_dir) / "sensors"
        self._cache_dir.mkdir(parents=True, exist_ok=True)
        self._latest_file = self._cache_dir / "latest_device.json"
        self._history_file = self._cache_dir / "soil_history.jsonl"
        self._calibration = SensorCalibrationConfig()

        # In-memory virtual simulation state for live software testing
        self._sim_adc_override: int | None = None
        self._sim_last_irrigation_ts: float | None = None

    def calibrate_adc(self, adc_raw: int) -> tuple[float, float]:
        """Converts 12-bit ADC raw integer on GPIO34 to normalized % and Volumetric Water Content (m3/m3).

        Capacitive v1.2 Physics:
        - Higher ADC value = Lower moisture (dry air ~ 3200).
        - Lower ADC value = Higher moisture (saturation ~ 1350).
        """
        adc_clamped = max(min(adc_raw, 4095), 0)
        span = float(self._calibration.adc_dry - self._calibration.adc_wet)
        if span <= 0:
            span = 1850.0

        # Linear fraction from dry (0.0) to saturated (1.0)
        fraction = (self._calibration.adc_dry - adc_clamped) / span
        fraction = max(0.0, min(1.0, fraction))

        # Normalized Moisture Percentage (0% to 100%)
        normalized_pct = round(fraction * 100.0, 1)

        # Agronomic Volumetric Water Content (theta):
        # Agricultural mineral soils typically saturate between 0.42 and 0.48 m3/m3
        # Residual dry soil is ~ 0.05 m3/m3
        theta_m3_m3 = round(0.05 + (fraction * 0.42), 3)

        return normalized_pct, theta_m3_m3

    def record_payload(self, payload: Esp32SoilPayload) -> SensorTelemetryData:
        """Processes and stores a real or simulated telemetry transmission from ESP32."""
        now_utc = datetime.now(timezone.utc)
        ts_iso = payload.timestamp or now_utc.isoformat()

        norm_pct, vwc = self.calibrate_adc(payload.adc_raw)

        # Battery percentage estimation (3.0V = 0%, 4.2V = 100% LiPo)
        batt_mv = payload.battery_mv or 3300
        batt_pct = max(0, min(100, int(((batt_mv - 3000) / 1200.0) * 100)))

        telemetry = SensorTelemetryData(
            device_id=payload.device_id,
            gpio_pin=payload.gpio_pin,
            sensor_model="Capacitive Soil Moisture Sensor v1.2",
            status="connected",
            timestamp=ts_iso,
            last_seen_seconds_ago=0,
            adc_raw=payload.adc_raw,
            adc_normalized_pct=norm_pct,
            vwc_m3_m3=vwc,
            soil_temp_c=payload.soil_temp_c or 18.5,
            battery_mv=batt_mv,
            battery_pct=batt_pct,
            rssi_dbm=payload.rssi_dbm or -65,
            field_capacity_fc=0.32,
            wilting_point_wp=0.16,
            rootzone_depletion_dr_mm=max(0.0, round(1000.0 * (0.32 - vwc) * 0.4, 1)),
        )

        self._evaluate_hydration_verdicts(telemetry)
        self._atomic_save_latest(telemetry)
        self._append_history(telemetry)

        return telemetry

    def get_latest_telemetry(self, smap_rootzone_m3_m3: float | None = None) -> SensorTelemetryData:
        """Retrieves the latest sensor reading, dynamically falling back to the virtual ESP32 simulation."""
        # 1. Check if real or simulated file exists
        if self._latest_file.exists():
            try:
                data = json.loads(self._latest_file.read_text(encoding="utf-8"))
                telemetry = SensorTelemetryData(**data)
                
                # Check freshness
                try:
                    ts = datetime.fromisoformat(telemetry.timestamp.replace("Z", "+00:00"))
                    diff_sec = int((datetime.now(timezone.utc) - ts).total_seconds())
                    telemetry.last_seen_seconds_ago = max(0, diff_sec)
                except Exception:
                    telemetry.last_seen_seconds_ago = 12

                # If simulation override active, apply it
                if self._sim_adc_override is not None:
                    telemetry.adc_raw = self._sim_adc_override
                    norm_pct, vwc = self.calibrate_adc(telemetry.adc_raw)
                    telemetry.adc_normalized_pct = norm_pct
                    telemetry.vwc_m3_m3 = vwc
                    telemetry.rootzone_depletion_dr_mm = max(0.0, round(1000.0 * (0.32 - vwc) * 0.4, 1))

                # Fuse with SMAP if provided
                if smap_rootzone_m3_m3 is not None:
                    self._fuse_with_smap(telemetry, smap_rootzone_m3_m3)
                self._evaluate_hydration_verdicts(telemetry)
                return telemetry
            except Exception as exc:
                logger.warning("Failed to parse latest sensor file: %s", exc)

        # 2. Virtual Simulation Fallback (Pure Software Demo)
        return self._generate_virtual_reading(smap_rootzone_m3_m3)

    def trigger_simulation(self, trigger: SensorSimulationTrigger) -> SensorTelemetryData:
        """Simulates physical events in software (irrigation pulse or dry spell)."""
        if trigger.action == "irrigate":
            # Irrigation wets soil -> raw ADC drops toward wet baseline (~1550)
            self._sim_adc_override = 1580
            self._sim_last_irrigation_ts = time.time()
        elif trigger.action == "dry_spell":
            # Dry spell -> raw ADC rises toward dry baseline (~2950)
            self._sim_adc_override = 2920
        else:
            # Reset to optimal healthy rootzone (~2250)
            self._sim_adc_override = 2240

        reading = self._generate_virtual_reading()
        self._atomic_save_latest(reading)
        self._append_history(reading)
        return reading

    def _generate_virtual_reading(self, smap_rz: float | None = None) -> SensorTelemetryData:
        """Generates realistic in-situ measurements modeled on Moroccan cereal soil dynamics."""
        now = datetime.now(timezone.utc)
        
        # Diurnal fluctuation simulation: soil temperature peaks at 15:00 UTC
        hour = now.hour + (now.minute / 60.0)
        temp_diurnal = 18.0 + 4.5 * math.sin((hour - 9) * (math.pi / 12.0))

        # Default healthy root-zone ADC ~ 2240 (corresponds to ~26.7% VWC, ~0.268 m3/m3)
        adc_val = self._sim_adc_override if self._sim_adc_override is not None else 2240

        norm_pct, vwc = self.calibrate_adc(adc_val)
        smap_baseline = smap_rz if smap_rz is not None else 0.225

        reading = SensorTelemetryData(
            device_id="esp32-field-node-01",
            gpio_pin=34,
            sensor_model="Capacitive Soil Moisture Sensor v1.2",
            status="connected",
            timestamp=now.isoformat(),
            last_seen_seconds_ago=5,
            adc_raw=adc_val,
            adc_normalized_pct=norm_pct,
            vwc_m3_m3=vwc,
            soil_temp_c=round(temp_diurnal, 1),
            battery_mv=3310,
            battery_pct=92,
            rssi_dbm=-62,
            smap_rootzone_m3_m3=smap_baseline,
            field_capacity_fc=0.32,
            wilting_point_wp=0.16,
            rootzone_depletion_dr_mm=max(0.0, round(1000.0 * (0.32 - vwc) * 0.4, 1)),
        )

        self._fuse_with_smap(reading, smap_baseline)
        self._evaluate_hydration_verdicts(reading)
        return reading

    def _fuse_with_smap(self, telemetry: SensorTelemetryData, smap_rz: float) -> None:
        """Computes satellite-ground truth fusion delta (Probe vs SMAP L4 ~9-11km grid)."""
        telemetry.smap_rootzone_m3_m3 = smap_rz
        delta = round(telemetry.vwc_m3_m3 - smap_rz, 3)
        telemetry.discrepancy_delta_m3_m3 = delta

        if delta > 0.08:
            telemetry.fusion_status = "irrigation_detected"
            telemetry.confidence_level = 0.99
        elif delta < -0.08:
            telemetry.fusion_status = "localized_drought"
            telemetry.confidence_level = 0.96
        elif telemetry.adc_raw > 3350:
            telemetry.fusion_status = "sensor_airgap"
            telemetry.confidence_level = 0.60
        else:
            telemetry.fusion_status = "coherent"
            telemetry.confidence_level = 0.98

    def _evaluate_hydration_verdicts(self, telemetry: SensorTelemetryData) -> None:
        """Determines FAO-56 depletion levels and actionable agronomic advice."""
        vwc = telemetry.vwc_m3_m3
        if vwc >= 0.35:
            telemetry.hydration_verdict_ar = "تربة مروية بمستوى مشبع (قريبة من السعة الحقلية)"
            telemetry.hydration_verdict_fr = "Sol très humide proche de la capacité au champ"
            telemetry.hydration_verdict_en = "Soil saturated near field capacity"
            telemetry.action_advice_ar = "أوقف الري لتفادي اختناق الجذور وهدر المياه."
            telemetry.action_advice_fr = "Arrêter l'irrigation pour éviter l'asphyxie racinaire."
            telemetry.action_advice_en = "Cease irrigation to prevent root hypoxia and water runoff."
        elif vwc >= 0.22:
            telemetry.hydration_verdict_ar = "رطوبة مثالية ومتاحة بسهولة للنبات (RAW)"
            telemetry.hydration_verdict_fr = "Humidité optimale facilement utilisable (RFU)"
            telemetry.hydration_verdict_en = "Optimal readily available soil moisture (RAW)"
            telemetry.action_advice_ar = "المخزون المائي في مأمن؛ لا داعي للسقي اليوم."
            telemetry.action_advice_fr = "Réserve hydrique sécurisée; aucune irrigation nécessaire."
            telemetry.action_advice_en = "Water reservoir secure; no irrigation needed today."
        elif vwc >= 0.16:
            telemetry.hydration_verdict_ar = "بداية مرحلة الإجهاد المائي واقتراب نقطة الذبول"
            telemetry.hydration_verdict_fr = "Seuil de stress hydrique débutant proche du point de flétrissement"
            telemetry.hydration_verdict_en = "Early water stress approaching wilting point"
            telemetry.action_advice_ar = "يُنصح بري تكميلي خفيف (15 إلى 25 مم) خلال 24 ساعة."
            telemetry.action_advice_fr = "Irrigation d'appoint recommandée (15-25 mm) sous 24h."
            telemetry.action_advice_en = "Supplemental irrigation recommended (15-25 mm) within 24h."
        else:
            telemetry.hydration_verdict_ar = "إجهاد مائي حرج؛ التربة أقل من نقطة الذبول الدائم"
            telemetry.hydration_verdict_fr = "Stress hydrique critique sous le point de flétrissement"
            telemetry.hydration_verdict_en = "Critical water stress below permanent wilting point"
            telemetry.action_advice_ar = "تدخل استعجالي بالسقي لإنقاذ المحصول من الذبول الدائم!"
            telemetry.action_advice_fr = "Intervention d'irrigation urgente requise immédiatement!"
            telemetry.action_advice_en = "Urgent irrigation intervention required immediately!"

    def _atomic_save_latest(self, telemetry: SensorTelemetryData) -> None:
        """Safely saves latest telemetry using atomic rename."""
        tmp_file = self._latest_file.with_suffix(".tmp")
        try:
            tmp_file.write_text(telemetry.model_dump_json(indent=2), encoding="utf-8")
            tmp_file.replace(self._latest_file)
        except Exception as exc:
            logger.warning("Failed atomic write to latest sensor file: %s", exc)

    def _append_history(self, telemetry: SensorTelemetryData) -> None:
        """Appends reading to JSONL history file."""
        try:
            line = telemetry.model_dump_json() + "\n"
            with open(self._history_file, "a", encoding="utf-8") as f:
                f.write(line)
        except Exception as exc:
            logger.warning("Failed appending to sensor history: %s", exc)
