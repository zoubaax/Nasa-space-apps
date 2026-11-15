"""NASA POWER Climate and Meteorology Specialist Sub-Agent."""

from __future__ import annotations

import logging
from typing import Any

from app.core.config import Settings
from app.models.agents import AgentContext, AgentRole, ClimateSpecialistReport
from app.services.agents.base import BaseAgent

logger = logging.getLogger(__name__)


class ClimateSpecialistAgent(BaseAgent):
    """Specialist sub-agent dedicated to NASA POWER atmospheric agroclimatology."""

    agent_id = "climate_specialist"
    agent_name = "خبير المناخ والأرصاد (NASA POWER)"
    avatar = "🌦️"
    role = AgentRole.CLIMATE_SPECIALIST

    def __init__(self, settings: Settings) -> None:
        super().__init__(settings)

    async def run(self, context: AgentContext) -> ClimateSpecialistReport:
        """Analyzes NASA POWER daily parameters and computes atmospheric hazard indicators."""
        dossier = context.ground_truth_dossier
        power = dossier.get("nasa_power", {})
        loc = dossier.get("location", {})

        precip = float(power.get("total_precipitation_mm", 0.0) or 0.0)
        temp_mean = float(power.get("mean_temperature_c", 20.0) or 20.0)
        temp_min = float(power.get("min_temperature_c", 10.0) or 10.0)
        temp_max = float(power.get("max_temperature_c", 30.0) or 30.0)
        dry_days = int(power.get("dry_days_count", 0) or 0)
        hot_days = int(power.get("hot_days_count", 0) or 0)
        frost_days = int(power.get("frost_days_count", 0) or 0)
        rh = float(power.get("relative_humidity_pct", 60.0) or 60.0)

        # Compute deterministic physical hazard flags
        hazards = []
        if precip < 200.0 or dry_days > 200:
            hazards.append("severe_aridity_risk")
        elif precip < 350.0:
            hazards.append("moderate_moisture_deficit")
        if hot_days >= 25:
            hazards.append("thermal_heatwave_stress")
        if frost_days >= 8 or temp_min <= 2.0:
            hazards.append("early_frost_risk")

        evidence = [
            f"مجموع التساقطات السنوية: {precip:.1f} مم",
            f"متوسط الحرارة: {temp_mean:.1f}°م (الدنيا: {temp_min:.1f}°م، القصوى: {temp_max:.1f}°م)",
            f"أيام الجفاف (<1مم): {dry_days} يوم",
            f"أيام الحرارة المرتفعة (≥30°م): {hot_days} يوم",
        ]
        if frost_days > 0:
            evidence.append(f"أيام الصقيع والبرد (≤5°م): {frost_days} يوم")

        # In offline / test mode or when Gemini is unconfigured, return deterministic synthesis
        if not self._settings.gemini_api_key:
            summary = (
                f"سجلت معطيات NASA POWER لسنة {context.year} تساقطات إجمالية بلغت {precip:.1f} مم، "
                f"مع متوسط حراري قدره {temp_mean:.1f}°م و{hot_days} يوماً حاراً تتجاوز فيه الحرارة 30°م. "
                f"المناخ يتطلب انتباهاً خاصاً لفترات الجفاف الصيفي وفترات نقص التساقطات."
            )
            return ClimateSpecialistReport(
                status="success",
                summary=summary,
                mean_temp_c=temp_mean,
                min_temp_c=temp_min,
                max_temp_c=temp_max,
                total_precip_mm=precip,
                dry_days_count=dry_days,
                hot_days_count=hot_days,
                frost_days_count=frost_days,
                relative_humidity_pct=rh,
                hazard_flags=hazards,
                key_evidence=evidence,
            )

        prompt = f"""You are the Climate & Meteorology Specialist evaluating atmospheric data for {loc.get('name', 'this farm')}.
REAL NASA POWER OBSERVATIONS (DO NOT INVENT NUMBERS):
- Annual Precipitation: {precip:.1f} mm
- Mean Temperature: {temp_mean:.1f} °C (Min: {temp_min:.1f} °C, Max: {temp_max:.1f} °C)
- Dry Days Count (<1mm): {dry_days} days
- Hot Days (>=30°C): {hot_days} days
- Frost Days (<=5°C): {frost_days} days
- Relative Humidity: {rh:.1f} %
- User Query: {context.user_query}

Respond in 2-3 concise sentences in Arabic/Darija (or requested language {context.detected_language}). Cite the exact numbers.
Return JSON:
{{
  "summary": "2-3 concise sentences explaining the atmospheric context",
  "hazard_flags": ["flag1", "flag2"]
}}
"""
        res = await self._call_gemini(prompt, temperature=0.1)
        summary = res.get("summary") if res else None
        if not summary:
            summary = (
                f"سجلت معطيات NASA POWER تساقطات إجمالية قدرها {precip:.1f} مم بمتوسط حرارة {temp_mean:.1f}°م، "
                f"مع تسجيل {hot_days} يوماً حاراً و{dry_days} يوماً بدون أمطار ملحوظة."
            )

        return ClimateSpecialistReport(
            status="success",
            summary=summary,
            mean_temp_c=temp_mean,
            min_temp_c=temp_min,
            max_temp_c=temp_max,
            total_precip_mm=precip,
            dry_days_count=dry_days,
            hot_days_count=hot_days,
            frost_days_count=frost_days,
            relative_humidity_pct=rh,
            hazard_flags=hazards,
            key_evidence=evidence,
        )
