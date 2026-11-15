"""NASA SMAP Level-4 Soil Moisture and Hydrology Specialist Sub-Agent."""

from __future__ import annotations

import logging
from typing import Any

from app.core.config import Settings
from app.models.agents import AgentContext, AgentRole, SoilSpecialistReport
from app.services.agents.base import BaseAgent

logger = logging.getLogger(__name__)


class SoilSpecialistAgent(BaseAgent):
    """Specialist sub-agent dedicated to NASA SMAP Level-4 satellite radar assimilation."""

    agent_id = "soil_specialist"
    agent_name = "Soil Specialist (NASA SMAP L4)"
    avatar = "💧"
    role = AgentRole.SOIL_SPECIALIST

    def __init__(self, settings: Settings) -> None:
        super().__init__(settings)

    async def run(self, context: AgentContext) -> SoilSpecialistReport:
        """Analyzes NASA SMAP Level-4 root-zone and surface soil moisture dynamics."""
        dossier = context.ground_truth_dossier
        smap = dossier.get("smap_l4", {})
        metrics = smap.get("annual_metrics", {})
        loc = dossier.get("location", {})

        sm_rz = float(metrics.get("sm_rootzone", {}).get("mean", 0.22) or 0.22)
        sm_sfc = float(metrics.get("sm_surface", {}).get("mean", 0.18) or 0.18)
        drought_pctl = float(metrics.get("sm_rootzone_pctl", {}).get("mean", 50.0) or 50.0)
        soil_temp = float(metrics.get("soil_temp_layer1", {}).get("mean", 18.0) or 18.0)

        # Standard agricultural soil assumptions for cereal root-zone (1.0m)
        theta_wp = 0.16  # Wilting point
        theta_fc = 0.32  # Field capacity
        taw_mm = round(1000.0 * (theta_fc - theta_wp) * 1.0, 1)  # 160 mm
        stored_water_mm = max(0.0, round(1000.0 * (sm_rz - theta_wp) * 1.0, 1))

        if drought_pctl < 20.0 or sm_rz < 0.14:
            hydration = "dry"
        elif drought_pctl < 40.0:
            hydration = "stress"
        elif sm_rz > 0.35:
            hydration = "saturated"
        else:
            hydration = "adequate"

        evidence = [
            f"رطوبة منطقة الجذور (0-100 سم): {sm_rz:.3f} م³/م³",
            f"رطوبة الطبقة السطحية (0-5 سم): {sm_sfc:.3f} م³/م³",
            f"الرتبة المئوية للجفاف: {drought_pctl:.1f}%",
            f"مخزون الماء المتاح فوق نقطة الذبول: {stored_water_mm:.1f} مم (من أصل {taw_mm:.1f} مم)",
            f"حرارة مهد البذر: {soil_temp:.1f}°م",
        ]

        in_situ = dossier.get("in_situ_sensor", {})
        if in_situ and in_situ.get("is_connected"):
            adc = in_situ.get("adc_raw", 0)
            vwc = in_situ.get("vwc_m3_m3", 0.0)
            delta = in_situ.get("smap_fusion_delta", 0.0)
            evidence.append(
                f"مجس التربة الميداني (ESP32 على GPIO34): {vwc * 100:.1f}% VWC ({adc} ADC، فارق SMAP: {delta:+.3f} م³/م³)"
            )

        # Deterministic fallback when Gemini is offline
        if not self._settings.gemini_api_key:
            summary = (
                f"تبلغ رطوبة منطقة الجذور من قمر SMAP L4 حوالي {sm_rz:.3f} م³/م³ (رتبة الجفاف: {drought_pctl:.1f}%)، "
                f"مما يمنح مخزوناً مائياً متاحاً يقدر بـ {stored_water_mm:.1f} مم فوق نقطة الذبول، وهو ما يصنف التربة في حالة '{hydration}'."
            )
            if in_situ and in_situ.get("is_connected"):
                summary += f" كما يُؤكد مجس ESP32 الميداني (GPIO34) رطوبة موضعية بنسبة {in_situ.get('vwc_m3_m3', 0.0) * 100:.1f}%."
            return SoilSpecialistReport(
                status="success",
                summary=summary,
                sm_rootzone=sm_rz,
                sm_surface=sm_sfc,
                drought_pctl=drought_pctl,
                soil_temp_layer1=soil_temp,
                available_water_capacity_mm=taw_mm,
                wilting_point_buffer_mm=stored_water_mm,
                hydration_status=hydration,
                key_evidence=evidence,
            )

        sensor_block = ""
        if in_situ and in_situ.get("is_connected"):
            sensor_block = (
                f"\nIN-SITU ESP32 FIELD PROBE (GPIO34, point measurement, LIVE):\n"
                f"- Volumetric Water Content: {in_situ.get('vwc_m3_m3', 0.0):.3f} m³/m³ ({in_situ.get('vwc_m3_m3', 0.0) * 100:.1f}%)\n"
                f"- Raw ADC: {in_situ.get('adc_raw', 0)}, Soil Temp: {in_situ.get('soil_temp_c', 'N/A')} °C\n"
                f"- Delta vs SMAP: {in_situ.get('smap_fusion_delta', 0.0) or 0.0:+.3f} m³/m³\n"
                f"You MUST cite the ESP32 probe reading and compare it to SMAP.\n"
            )
        else:
            sensor_block = "\nNo in-situ ESP32 probe is connected. Do NOT invent any sensor reading.\n"

        prompt = f"""You are the Soil Hydrology Specialist evaluating satellite radar soil data for {loc.get('name', 'this farm')}.
REAL NASA SMAP L4 OBSERVATIONS (SPL4SMGP V008, ~9-11 km, DO NOT INVENT NUMBERS):
- Root-Zone Soil Moisture (0-100 cm): {sm_rz:.3f} m³/m³
- Surface Soil Moisture (0-5 cm): {sm_sfc:.3f} m³/m³
- Drought Percentile: {drought_pctl:.1f} %
- Available Stored Water: {stored_water_mm:.1f} mm (TAW={taw_mm:.1f} mm)
- Seedbed Soil Temperature: {soil_temp:.1f} °C
- Hydration Status: {hydration}
{sensor_block}- User Query: {context.user_query}

Respond in 2-3 concise sentences in Arabic/Darija (or requested language {context.detected_language}). Cite the exact numbers.
Return JSON:
{{
  "summary": "2-3 concise sentences explaining the soil water status and root zone buffer",
  "hydration_status": "{hydration}"
}}
"""
        res = await self._call_gemini(prompt, temperature=0.1)
        summary = res.get("summary") if res else None
        if not summary:
            summary = (
                f"رطوبة منطقة الجذور المسجلة هي {sm_rz:.3f} م³/م³ مع مخزون مائي يبلغ {stored_water_mm:.1f} مم، "
                f"مما يعكس حالة رطوبة '{hydration}' مناسبة لاستقرار المحاصيل."
            )

        return SoilSpecialistReport(
            status="success",
            summary=summary,
            sm_rootzone=sm_rz,
            sm_surface=sm_sfc,
            drought_pctl=drought_pctl,
            soil_temp_layer1=soil_temp,
            available_water_capacity_mm=taw_mm,
            wilting_point_buffer_mm=stored_water_mm,
            hydration_status=hydration,
            key_evidence=evidence,
        )
