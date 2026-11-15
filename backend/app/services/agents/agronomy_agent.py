"""Agronomy and Field Management Specialist Sub-Agent."""

from __future__ import annotations

import logging
from typing import Any

from app.core.config import Settings
from app.models.agents import AgentContext, AgentRole, AgronomySpecialistReport
from app.services.agents.base import BaseAgent

logger = logging.getLogger(__name__)


class AgronomySpecialistAgent(BaseAgent):
    """Specialist sub-agent translating NASA climate & soil physics into actionable agronomic practice."""

    agent_id = "agronomist"
    agent_name = "الخبير الزراعي الميداني (FieldShift Agro)"
    avatar = "👨‍🌾"
    role = AgentRole.AGRONOMIST

    def __init__(self, settings: Settings) -> None:
        super().__init__(settings)

    async def run(self, context: AgentContext) -> AgronomySpecialistReport:
        """Synthesizes climate and soil reports to advise on crops, rotations, and irrigation."""
        clim = context.climate_report
        soil = context.soil_report
        loc = context.ground_truth_dossier.get("location", {})
        c_code = (loc.get("country_code") or "MA").upper()

        precip = clim.total_precip_mm if clim and clim.total_precip_mm is not None else 350.0
        sm_rz = soil.sm_rootzone if soil and soil.sm_rootzone is not None else 0.22

        # 1. Deduce Terroir-Adaptive Crop Portfolio
        if precip < 160.0 or sm_rz < 0.14:
            recommended_crops = ["الشعير الصحراوي المقاوم", "الذرة الرفيعة / السورغوم", "أعلاف معمرة متحملة للملوحة والجفاف"]
            irrigation_strat = "irrigue_total"
            irr_advice = "الزراعة غير ممكنة بورياً؛ يلزم اعتماد الري الموضعي بالتنقيط أو زراعة الواحات المحمية."
        elif precip > 550.0:
            if c_code in ("US", "CA", "BR", "AR"):
                recommended_crops = ["الذرة الحبية (Maïs)", "فول الصويا", "القمح الربيعي"]
            else:
                recommended_crops = ["القمح الصلب عالي الإنتاجية", "القطاني (فول بلدي / حمص)", "الأعلاف الخضراء والشوفان"]
            irrigation_strat = "bour_strict"
            irr_advice = "المنطقة رطبة وغنية بالتساقطات؛ تكفي الفلاحة البورية تماماً دون الحاجة لمصاريف الضخ التكميلي."
        else:
            recommended_crops = ["القمح الصلب المحلي", "القطاني لتثبيت الأزوت (عدس / حمص)", "الشعير المتأقلم"]
            irrigation_strat = "appoint"
            irr_advice = "فلاحة بورية مستقرة، مع جاهزية ري تكميلي خفيف (30-50 مم) في حال حدوث موجة حرارة في فترة طرد السنابل."

        # Handle reflection critique feedback if in revision iteration
        if context.critique:
            logger.info("[agronomist] Ingested audit critique feedback for revision: %s", context.critique)
            if "بوري" in context.critique or "bour" in context.critique.lower() or precip < 160.0:
                irrigation_strat = "irrigue_total"
                irr_advice = "تصحيح تدقيقي: المنطقة جافة جداً (<150 مم) ولا تحتمل الزراعة البورية؛ يلزم إلزامياً توفير ري كلي وموضعي بالتنقيط."
                recommended_crops = ["الشعير الصحراوي المقاوم", "الذرة الرفيعة / السورغوم", "أعلاف معمرة متحملة للملوحة والجفاف"]

        tactics = [
            "إدراج دورة زراعية ثلاثية متوازنة لكسر دورة فطريات تعفن الجذور",
            "دمج القطاني لتثبيت ما بين 30 و50 كغ آزوت حيوي طبيعي لكل هكتار",
            "ترك بقايا المحصول كغطاء عضوي لتقليص التبخر من سطح التربة",
        ]

        warnings = []
        if clim and "thermal_heatwave_stress" in clim.hazard_flags:
            warnings.append("مخاطر موجات حرارية مبكرة قد تسبب ضمور الحبوب (Échaudage)؛ يوصى بأصناف مبكرة التزهير.")
        if soil and soil.hydration_status == "stress":
            warnings.append("رطوبة الجذور في مرحلة إجهاد؛ يجب عقلنة استهلاك الماء وتجنب الزراعات المستنزفة.")

        evidence = [
            f"استراتيجية الري المعتمدة: {irrigation_strat}",
            f"المحاصيل المتوافقة مع الإقليم: {', '.join(recommended_crops[:3])}",
        ]

        if not self._settings.gemini_api_key:
            summary = (
                f"بناءً على توازن التساقطات ({precip:.1f} مم) ورطوبة الجذور ({sm_rz:.3f} م³/م³)، "
                f"نوصي بـ: {irr_advice} واعتماد دورة زراعية تشمل: {', '.join(recommended_crops[:3])}."
            )
            return AgronomySpecialistReport(
                status="success",
                summary=summary,
                recommended_crops=recommended_crops,
                irrigation_strategy=irrigation_strat,
                irrigation_advice=irr_advice,
                sowing_window_assessment="الفترة المثالية للبذر تبدأ من منتصف نونبر مع استقرار أولى الأمطار الفعالة.",
                soil_conservation_tactics=tactics,
                disease_and_pest_warnings=warnings,
                key_evidence=evidence,
            )

        prompt = f"""You are the Agronomy & Crop Management Specialist evaluating {loc.get('name', 'this farm')}.
DATA EVIDENCE:
- Precipitation: {precip:.1f} mm, Climate Hazards: {clim.hazard_flags if clim else []}
- Root-Zone Moisture: {sm_rz:.3f} m³/m³, Soil Status: {soil.hydration_status if soil else 'adequate'}
- Suggested Crops: {recommended_crops}
- Irrigation Strategy: {irrigation_strat} ({irr_advice})
- User Query: {context.user_query}
{f"- AUDIT CRITIQUE DIRECTIVE: {context.critique} (Strictly address and fix this discrepancy!)" if context.critique else ""}

Formulate actionable agricultural advice in 2-4 sentences in Moroccan Darija (or requested language {context.detected_language}).
Return JSON:
{{
  "summary": "2-3 sentences of clear agronomic field advice",
  "recommended_crops": {recommended_crops},
  "irrigation_advice": "{irr_advice}"
}}
"""
        res = await self._call_gemini(prompt, temperature=0.1)
        summary = res.get("summary") if res else None
        if not summary:
            summary = (
                f"نوصي في هذا الإقليم باعتماد: {', '.join(recommended_crops[:3])} مع {irr_advice}، "
                f"والحرص على إدخال القطاني لتحسين خصوبة التربة وتفادي تراجع المردود."
            )

        return AgronomySpecialistReport(
            status="success",
            summary=summary,
            recommended_crops=recommended_crops,
            irrigation_strategy=irrigation_strat,
            irrigation_advice=irr_advice,
            sowing_window_assessment="الفترة المثالية للبذر تبدأ من منتصف نونبر مع استقرار أولى الأمطار الفعالة.",
            soil_conservation_tactics=tactics,
            disease_and_pest_warnings=warnings,
            key_evidence=evidence,
        )
