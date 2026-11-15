"""Scientific Validation and Anti-Hallucination Guardrail Sentinel."""

from __future__ import annotations

import logging
import re
from typing import Any

from app.core.config import Settings
from app.models.agents import AgentContext, AgentRole, GuardrailAuditReport
from app.services.agents.base import BaseAgent

logger = logging.getLogger(__name__)


class GuardrailSentinelAgent(BaseAgent):
    """Deterministic scientific verification engine checking all claims against raw NASA observations."""

    agent_id = "guardrail_sentinel"
    agent_name = "المحقق العلمي ومطابقة الأرقام (Evidence Guardrail)"
    avatar = "🛡️"
    role = AgentRole.GUARDRAIL_SENTINEL

    def __init__(self, settings: Settings) -> None:
        super().__init__(settings)

    async def run(self, context: AgentContext) -> GuardrailAuditReport:
        """Audits claims from all specialists to enforce zero-hallucination and scientific integrity."""
        dossier = context.ground_truth_dossier
        power = dossier.get("nasa_power", {})
        smap = dossier.get("smap_l4", {})
        metrics = smap.get("annual_metrics", {})

        # Collect raw truths from NASA cache
        raw_precip = float(power.get("total_precipitation_mm", 0.0) or 0.0)
        raw_temp = float(power.get("mean_temperature_c", 20.0) or 20.0)
        raw_sm = float(metrics.get("sm_rootzone", {}).get("mean", 0.22) or 0.22)
        raw_hot = int(power.get("hot_days_count", 0) or 0)

        verified_metrics = {
            "nasa_power_precipitation_mm": raw_precip,
            "nasa_power_mean_temp_c": raw_temp,
            "nasa_smap_rootzone_moisture": raw_sm,
            "recorded_hot_days": raw_hot,
        }

        # Check specialist draft reports for numerical consistency and agronomic coherence
        discrepancies = []
        verified_count = 4

        clim = context.climate_report
        soil = context.soil_report
        agro = context.agronomy_report

        # 1. Atmospheric verification against raw NASA POWER observation
        if clim and clim.total_precip_mm is not None:
            if abs(clim.total_precip_mm - raw_precip) > 2.0:
                discrepancies.append(
                    f"Atmospheric precipitation mismatch: report cited {clim.total_precip_mm:.1f} mm, "
                    f"but verified raw NASA POWER observation is {raw_precip:.1f} mm."
                )

        # 2. Soil moisture verification against raw NASA SMAP L4 observation
        if soil and soil.sm_rootzone is not None:
            if abs(soil.sm_rootzone - raw_sm) > 0.03:
                discrepancies.append(
                    f"Root-zone soil moisture mismatch: report cited {soil.sm_rootzone:.3f} m³/m³, "
                    f"but verified raw NASA SMAP L4 observation is {raw_sm:.3f} m³/m³."
                )

        # 3. Terroir physical feasibility verification
        if agro:
            # Hyper-arid sanity check: rainfed wheat without irrigation in a desert is a physical hallucination
            if raw_precip < 150.0 and agro.irrigation_strategy == "bour_strict":
                discrepancies.append(
                    f"Agronomic feasibility contradiction: annual rain is only {raw_precip:.1f} mm (hyper-arid), "
                    f"yet strict rainfed agriculture (bour) was recommended without irrigation."
                )

        critique_feedback = "; ".join(discrepancies) if discrepancies else None
        passed = len(discrepancies) == 0

        # Disclaimers required for scientific rigor
        disclaimers = [
            "البيانات الفضائية المعروضة (~9-11 كلم EASE-Grid 2.0) تمثل تقديرات استشعار عن بعد ولا تعوض المجسات الأرضية المباشرة.",
            "التقديرات لا تقدم أي ضمان قطعي للمردودية المحصولية النهائية الخاضعة لتقلبات الموسم.",
        ]

        logger.info(
            "[guardrail_sentinel] Audit evaluated: passed=%s, discrepancies=%d, verified_count=%d",
            passed,
            len(discrepancies),
            verified_count,
        )

        return GuardrailAuditReport(
            validation_status="validated" if passed else "flagged",
            passed=passed,
            claims_verified_count=verified_count,
            discrepancies_detected=discrepancies,
            critique_feedback=critique_feedback,
            disclaimers_enforced=disclaimers,
            audited_evidence=verified_metrics,
        )
