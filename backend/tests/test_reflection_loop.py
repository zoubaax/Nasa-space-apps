"""Tests for Phase 1: Critic-Actor Reflection & Self-Correction Loop."""

import asyncio
from typing import Any
from unittest.mock import AsyncMock, patch

from app.core.config import Settings
from app.models.agents import (
    AgentContext,
    AgronomySpecialistReport,
    ClimateSpecialistReport,
    GuardrailAuditReport,
    SoilSpecialistReport,
)
from app.models.ai import AiChatRequest, AiLocationContext
from app.services.agents.agronomy_agent import AgronomySpecialistAgent
from app.services.agents.guardrail_agent import GuardrailSentinelAgent
from app.services.agents.orchestrator import OrchestratorService


def test_guardrail_critic_detects_arid_bour_discrepancy():
    """Critic should flag a contradiction when rainfed farming is recommended under hyper-arid rainfall."""
    settings = Settings()
    guardrail = GuardrailSentinelAgent(settings)

    context = AgentContext(
        user_query="نصائح زراعية",
        detected_language="ar",
        location={"name": "Dakhla", "latitude": 23.7, "longitude": -15.9},
        ground_truth_dossier={
            "annual_precipitation_mm": 95.0,  # Hyper-arid (<150mm)
            "sowing_period_moisture_m3m3": 0.08,
            "soil_type": "sableux",
            "water_access": "irrigue",
        },
        climate_report=ClimateSpecialistReport(
            status="success",
            total_precip_mm=95.0,
            summary="مناخ صحراوي جاف جداً",
        ),
        soil_report=SoilSpecialistReport(
            status="success",
            sm_rootzone=0.08,
            hydration_status="stress",
            summary="تربة رملية جافة",
        ),
        agronomy_report=AgronomySpecialistReport(
            status="success",
            summary="يمكنك الاعتماد على الفلاحة البورية بدون ري إطلاقاً في هذه المنطقة.",
            recommended_crops=["القمح الصلب"],
            irrigation_strategy="bour_strict",
            irrigation_advice="فلاحة بورية بدون ري.",
        ),
    )

    report = asyncio.run(guardrail.run(context))
    assert not report.passed
    assert report.validation_status == "flagged"
    assert report.critique_feedback is not None
    assert "bour" in report.critique_feedback.lower() or "بورية" in report.critique_feedback


def test_orchestrator_reflection_loop_corrects_discrepancy():
    """Orchestrator should trigger reflection loop when guardrail critic flags an issue."""
    settings = Settings()
    orchestrator = OrchestratorService(settings)

    request = AiChatRequest(
        message="ما هي أفضل دورة زراعية لحقلي؟",
        location=AiLocationContext(
            latitude=23.7,
            longitude=-15.9,
            name="Dakhla Desert Farm",
            country="Morocco",
            country_code="MA",
        ),
    )
    dossier = {
        "annual_precipitation_mm": 80.0,
        "sowing_period_moisture_m3m3": 0.07,
        "soil_type": "sableux",
        "water_access": "irrigue",
    }

    # Run full orchestrator execution
    response = asyncio.run(orchestrator.execute(request, dossier, "ar"))
    assert response.validation_status == "validated"
    assert response.reply is not None
    assert len(response.specialists_consulted) >= 4
