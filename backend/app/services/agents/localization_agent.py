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
                header = f"### 🌾 تقرير الذكاء الفائق (SI) لمنطقة {loc_name} (سنة {context.year})"
            elif lang == "fr":
                header = f"### 🌾 Diagnostic Agro-Climatique FIELDShift SI — {loc_name} ({context.year})"
            else:
                header = f"### 🌾 Agro-Climatic Report FIELDShift SI — {loc_name} ({context.year})"

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

        # Choose dialect guidance based on location and detected language
        dialect_instruction = "Respond in clear, professional English."
        if lang in ("darija", "ar"):
            dialect_instruction = (
                "You are an expert Moroccan agronomist (المرشد الفلاحي). "
                "Respond in authentic, warm, respectful Moroccan Darija (الدارجة المغربية) using Arabic script. "
                "Use natural Moroccan farming vocabulary (الري، السقي، مهد البذور، رطوبة الجذور، الشتا، الغلة، الحرث). "
                "Greet the farmer warmly (e.g. 'مرحبا بك أ سي الفلاح' or 'على حساب معطيات أقمار ناسا الفضائية')."
            )
        elif lang == "fr":
            dialect_instruction = "Respond in professional French as an expert agricultural engineer (Diagnostic agro-climatique, humidité du sol, stratégie culturale)."
        elif lang == "es":
            dialect_instruction = "Respond in fluent Spanish as an agricultural specialist (Diagnóstico agroclimático, humedad del suelo, recomendaciones agronómicas)."

        prompt = f"""You are the Lead Agronomic Communicator synthesizing specialized findings for {loc.get('name', 'this farm')}.
USER QUESTION: {context.user_query}
TARGET LANGUAGE / DIALECT DIRECTIVE: {dialect_instruction}

SPECIALIST FINDINGS:
1. Climate Specialist: {clim_text}
2. Soil Specialist: {soil_text}
3. Agronomist Advice: {agro_text}

MANDATORY RULES:
- Write a unified, natural, helpful answer that directly answers the farmer's question.
- Do NOT say 'Specialist 1 said...'; blend findings seamlessly into a single authoritative consultation.
- Strictly preserve all verified numbers ({clim.total_precip_mm if clim else ''} mm, {soil.sm_rootzone if soil else ''} m³/m³).
- Keep formatting clean with clear markdown paragraphs and bullet points where helpful.
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
