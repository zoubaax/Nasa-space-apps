"""Unit and integration tests for FieldShift Multi-Agent Orchestrator & Sub-Agents."""

import asyncio
import pytest
from app.core.config import get_settings
from app.models.agents import AgentContext, AgentIntent, AgentRole
from app.models.ai import AiChatRequest, AiLocationContext
from app.services.agents.agronomy_agent import AgronomySpecialistAgent
from app.services.agents.climate_agent import ClimateSpecialistAgent
from app.services.agents.guardrail_agent import GuardrailSentinelAgent
from app.services.agents.orchestrator import OrchestratorService
from app.services.agents.soil_agent import SoilSpecialistAgent


@pytest.fixture
def mock_dossier():
    return {
        "location": {"name": "Meknes, Morocco", "latitude": 33.89, "longitude": -5.55, "country_code": "MA"},
        "nasa_power": {
            "total_precipitation_mm": 412.5,
            "mean_temperature_c": 19.8,
            "min_temperature_c": 4.2,
            "max_temperature_c": 36.5,
            "dry_days_count": 185,
            "hot_days_count": 28,
            "frost_days_count": 3,
            "relative_humidity_pct": 62.0,
        },
        "smap_l4": {
            "annual_metrics": {
                "sm_rootzone": {"mean": 0.235},
                "sm_surface": {"mean": 0.178},
                "sm_rootzone_pctl": {"mean": 48.0},
                "soil_temp_layer1": {"mean": 18.5},
            }
        },
        "sources_used": [
            "NASA SMAP Level-4 SPL4SMGP V008 (~9-11 km)",
            "NASA POWER Daily Agroclimatology API",
        ],
    }


def test_orchestrator_intent_classification():
    orchestrator = OrchestratorService(get_settings())

    assert orchestrator.classify_intent("شحال صبات الشتا الشهر اللي فات؟") == AgentIntent.CLIMATE_ONLY
    assert orchestrator.classify_intent("What is the annual precipitation and temperature?") == AgentIntent.CLIMATE_ONLY
    assert orchestrator.classify_intent("رطوبة التربة واش كافية؟") == AgentIntent.SOIL_ONLY
    assert orchestrator.classify_intent("What is the root-zone soil moisture from SMAP?") == AgentIntent.SOIL_ONLY
    assert orchestrator.classify_intent("واش نزرع القمح فهاد الأرض وبشحال نسقي؟") == AgentIntent.AGRONOMY_ADVISORY
    assert orchestrator.classify_intent("Conseil agricole pour rotation et irrigation") == AgentIntent.AGRONOMY_ADVISORY


def test_climate_specialist_agent(mock_dossier):
    agent = ClimateSpecialistAgent(get_settings())
    context = AgentContext(
        user_query="How is the climate?",
        location=AiLocationContext(name="Meknes", latitude=33.89, longitude=-5.55),
        ground_truth_dossier=mock_dossier,
    )

    report = asyncio.run(agent.run(context))
    assert report.status == "success"
    assert report.total_precip_mm == 412.5
    assert report.hot_days_count == 28
    assert "thermal_heatwave_stress" in report.hazard_flags
    assert len(report.key_evidence) >= 4


def test_soil_specialist_agent(mock_dossier):
    agent = SoilSpecialistAgent(get_settings())
    context = AgentContext(
        user_query="How is the soil?",
        location=AiLocationContext(name="Meknes", latitude=33.89, longitude=-5.55),
        ground_truth_dossier=mock_dossier,
    )

    report = asyncio.run(agent.run(context))
    assert report.status == "success"
    assert report.sm_rootzone == 0.235
    assert report.drought_pctl == 48.0
    assert report.hydration_status == "adequate"
    assert report.wilting_point_buffer_mm > 0.0


def test_agronomy_specialist_agent(mock_dossier):
    agent = AgronomySpecialistAgent(get_settings())
    context = AgentContext(
        user_query="What should I plant?",
        location=AiLocationContext(name="Meknes", latitude=33.89, longitude=-5.55),
        ground_truth_dossier=mock_dossier,
    )

    report = asyncio.run(agent.run(context))
    assert report.status == "success"
    assert len(report.recommended_crops) >= 3
    assert report.irrigation_strategy in ("appoint", "bour_strict", "irrigue_total")
    assert len(report.soil_conservation_tactics) >= 2


def test_guardrail_sentinel_verification(mock_dossier):
    agent = GuardrailSentinelAgent(get_settings())
    context = AgentContext(
        user_query="Audit verification",
        location=AiLocationContext(name="Meknes", latitude=33.89, longitude=-5.55),
        ground_truth_dossier=mock_dossier,
    )

    audit = asyncio.run(agent.run(context))
    assert audit.passed is True
    assert audit.validation_status == "validated"
    assert audit.claims_verified_count >= 4
    assert len(audit.disclaimers_enforced) >= 1
    assert audit.audited_evidence["nasa_power_precipitation_mm"] == 412.5


def test_orchestrator_full_dag_execution(mock_dossier):
    orchestrator = OrchestratorService(get_settings())
    req = AiChatRequest(
        message="شنو الزراعة المناسبة فهاد الأرض وشحال خاصها ديال السقي؟",
        location=AiLocationContext(name="Meknes, Morocco", latitude=33.89, longitude=-5.55, country="Morocco"),
        year=2025,
        language="darija",
    )

    response = asyncio.run(orchestrator.execute(req, mock_dossier, "darija"))
    assert response.validation_status == "validated"
    assert response.language_detected == "darija"
    assert len(response.specialists_consulted) >= 4
    assert len(response.reply) > 50
