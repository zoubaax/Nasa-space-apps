"""Localization and Dialect Specialist Sub-Agent."""

from __future__ import annotations

import logging
import os
from typing import Any

from app.core.config import Settings
from app.models.agents import AgentContext, AgentRole
from app.services.agents.base import BaseAgent

logger = logging.getLogger(__name__)


class LocalizationSpecialistAgent(BaseAgent):
    """Specialist sub-agent ensuring natural, culturally authentic agricultural phrasing."""

    agent_id = "localizer"
    agent_name = "خبير الصياغة والدارجة الفلاحية (Localization)"
    avatar = "🗣️"
    role = AgentRole.LOCALIZER

    def __init__(self, settings: Settings) -> None:
        super().__init__(settings)

    async def run(self, context: AgentContext) -> str:
        """Synthesizes all specialist findings into a cohesive, beautifully phrased narrative."""
        clim = context.climate_report
        soil = context.soil_report
        agro = context.agronomy_report
        guard = context.guardrail_report
        lang = context.detected_language
        loc = context.ground_truth_dossier.get("location", {})

        # Build combined factual draft
        clim_text = clim.summary if clim else ""
        soil_text = soil.summary if soil else ""
        agro_text = agro.summary if agro else ""

        # Deterministic assembly when Gemini is offline or in testing
        if not self._settings.gemini_api_key or os.environ.get("PYTEST_CURRENT_TEST"):
            loc_name = loc.get("name") or "المنطقة المحددة"
            if lang == "darija":
                header = f"### 🌾 تقرير الذكاء الاصطناعي لمنطقة {loc_name} (سنة {context.year})"
            elif lang == "fr":
                header = f"### 🌾 Diagnostic Agro-Climatique FIELDShift AI — {loc_name} ({context.year})"
            else:
                header = f"### 🌾 Agro-Climatic Report FIELDShift AI — {loc_name} ({context.year})"

            parts = [header]
            if clim_text:
                parts.append(f"🌦️ **المناخ والأمطار**: {clim_text}")
            if soil_text:
                parts.append(f"💧 **رطوبة التربة**: {soil_text}")
            if agro_text:
                parts.append(f"🌾 **النصيحة الفلاحية**: {agro_text}")
            if guard and guard.disclaimers_enforced:
                parts.append(f"\n> ℹ️ *ملاحظة علمية: {guard.disclaimers_enforced[0]}*")
            return "\n\n".join(parts)

        prompt = f"""You are the Lead Agronomic Communicator synthesizing specialized findings for {loc.get('name', 'this farm')}.
USER QUESTION: {context.user_query}
TARGET LANGUAGE / DIALECT: {lang} (If Morocco/Darija: write in authentic, warm, respectful Moroccan Darija in Arabic script).

SPECIALIST FINDINGS:
1. Climate Specialist: {clim_text}
2. Soil Specialist: {soil_text}
3. Agronomist Advice: {agro_text}

MANDATORY RULES:
- Write a unified, natural answer that directly answers the farmer's question.
- Do NOT say 'Specialist 1 said...'; blend findings seamlessly into a professional consultation.
- Strictly preserve all verified numbers ({clim.total_precip_mm if clim else ''} mm, {soil.sm_rootzone if soil else ''} m³/m³).
- Keep formatting clean with clear markdown paragraphs.
"""
        res = await self._call_gemini(prompt, temperature=0.2, response_mime="text/plain")
        if res and isinstance(res, dict) and res.get("text"):
            return res["text"].strip()
        elif isinstance(res, str) and res.strip():
            return res.strip()

        # Fallback to structured compilation
        parts = []
        if clim_text:
            parts.append(f"🌦️ **المناخ والأمطار**: {clim_text}")
        if soil_text:
            parts.append(f"💧 **رطوبة التربة**: {soil_text}")
        if agro_text:
            parts.append(f"🌾 **النصيحة الفلاحية**: {agro_text}")
        return "\n\n".join(parts)
