"""Tests for AI Intelligence and Agricultural Simulation integration."""

from __future__ import annotations

import json
from unittest.mock import MagicMock
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models.ai import AiChatRequest, AiLocationContext
from app.services.ai_service import AiService


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def test_ai_health_endpoint(client: TestClient) -> None:
    res = client.get("/api/ai/health")
    assert res.status_code == 200
    data = res.json()
    assert "status" in data
    assert "fieldshift-ai-engine" in data["model"]
    assert len(data["services_connected"]) >= 3


def test_language_detection() -> None:
    service = AiService(MagicMock(), MagicMock())
    
    # Darija in Arabic script
    assert service.detect_language("واش رطوبة التربة كافية للقمح فمكناس؟") == "darija"
    assert service.detect_language("شنو هي حالة الخزان المائي ديال الأرض؟") == "darija"
    assert service.detect_language("kifach nesqi l-fella7a dial zra3?") == "darija"

    # French
    assert service.detect_language("Quel est le niveau d'humidité du sol pour l'irrigation ?") == "fr"
    assert service.detect_language("Analyse le profil thermique des couches du sol") == "fr"

    # English
    assert service.detect_language("What is the root-zone soil moisture and drought percentile?") == "en"
    assert service.detect_language("Explain water balance and evapotranspiration") == "en"


def test_ai_chat_darija_grounded_response(client: TestClient) -> None:
    req_payload = {
        "message": "واش كاين إجهاد مائي فمكناس لسنة 2025؟",
        "location": {"name": "Meknes, Morocco", "latitude": 33.89, "longitude": -5.55},
        "year": 2025,
        "mode": "agricultural",
        "language": "darija",
    }

    res = client.post("/api/ai/chat", json=req_payload)
    assert res.status_code == 200
    data = res.json()

    assert "تقرير الذكاء الاصطناعي لمنطقة" in data["reply"]
    assert data["language_detected"] == "darija"
    assert "NASA SMAP Level-4 SPL4SMGP V008 (~9-11 km)" in data["sources_used"]
    assert len(data["specialists_consulted"]) == 4
    assert data["validation_status"] == "validated"


def test_ai_chat_french_response(client: TestClient) -> None:
    req_payload = {
        "message": "Explique-moi ce graphique de l'humidité",
        "location": {"name": "Tanger, Maroc", "latitude": 35.77, "longitude": -5.81},
        "year": 2025,
        "chart_id": "moisture",
        "variable_id": "sm_rootzone",
        "language": "fr",
    }

    res = client.post("/api/ai/chat", json=req_payload)
    assert res.status_code == 200
    data = res.json()
    assert data["language_detected"] == "fr"
    assert "Diagnostic Agro-Climatique" in data["reply"]


def test_ai_chat_english_response(client: TestClient) -> None:
    req_payload = {
        "message": "What is the drought situation in Meknes for 2025?",
        "location": {"name": "Meknes, Morocco", "latitude": 33.89, "longitude": -5.55},
        "year": 2025,
        "language": "en",
    }

    res = client.post("/api/ai/chat", json=req_payload)
    assert res.status_code == 200
    data = res.json()
    assert "Agro-Climatic Report" in data["reply"]
    assert data["language_detected"] == "en"
    assert len(data["sources_used"]) >= 1


def test_ai_chat_stream_endpoint(client: TestClient) -> None:
    req_payload = {
        "message": "Tell me about Meknes soil moisture",
        "location": {"name": "Meknes, Morocco", "latitude": 33.89, "longitude": -5.55},
        "year": 2025,
    }

    res = client.post("/api/ai/chat/stream", json=req_payload)
    assert res.status_code == 200
    assert "text/event-stream" in res.headers["content-type"]
    text = res.text
    assert "meta" in text
    assert "delta" in text
    assert "done" in text


def test_simulation_endpoint_baseline(client: TestClient) -> None:
    req_payload = {
        "location": {"name": "Meknes, Morocco", "latitude": 33.8938, "longitude": -5.5516},
        "year": 2025,
        "soil_type": "limoneux_profond",
        "water_access": "appoint",
        "budget": "moyen",
        "climate_shock": "none",
        "historical_compare_year": 2023,
    }
    res = client.post("/api/ai/simulate", json=req_payload)
    assert res.status_code == 200
    data = res.json()
    assert len(data["plans"]) == 3
    assert data["winner_plan_id"] in ["plan_rotation_triennale", "plan_agroecologie", "plan_monoculture"]
    assert len(data["tribunal_verdicts"]) == 4
    assert "الخطة" in data["overall_synthesis_darija"]
    assert len(data["radar_dimensions"]) == 5

    # Rigorous scientific data consistency checks (Explicit Contiguous Harvest Year 2025)
    metrics = data["baseline_metrics"]
    assert metrics["annual_precipitation_mm"] == 701.2
    assert metrics["recorded_hot_days"] == 156
    assert metrics["recorded_dry_days"] == 282
    assert metrics["rootzone_moisture_m3m3"] == 0.266
    assert metrics["harvest_year"] == 2025
    assert metrics["season_start_date"] == "2024-11-15"
    assert metrics["season_end_date"] == "2025-05-20"
    assert metrics["season_total_days"] == 187
    assert metrics["data_source_years"] == [2024, 2025]
    assert metrics["crop_cycle_rain_gross_mm"] == 339.0
    assert metrics["effective_seasonal_rain_infiltrated_mm"] == 334.1
    assert metrics["sowing_period_moisture_m3m3"] == 0.2643
    assert metrics["sowing_moisture_source_date"] == "2024-11-01"
    assert metrics["sowing_moisture_observation_count"] == 240
    assert metrics["stored_rootzone_water_at_sowing_mm"] == 94.3
    assert metrics["initial_rootzone_depletion_dr_sow_mm"] == 55.7
    assert metrics["water_remaining_before_stress_at_sowing_mm"] == 19.3
    assert metrics["readily_available_soil_water_mm"] == 19.3
    assert metrics["total_water_budget_mm"] == 503.4
    assert metrics["soil_available_water_capacity_mm"] == 150.0

    # Verify winner and evaporative demand reduction
    p1 = data["plans"][0]
    winner = next(p for p in data["plans"] if p["id"] == data["winner_plan_id"])
    expected_evap_saved = round(p1["water_need_mm"] - winner["water_need_mm"], 1)
    expected_deficit_saved = round(p1["water_deficit_mm"] - winner["water_deficit_mm"], 1)
    assert metrics["evaporative_demand_reduction_mm"] == expected_evap_saved
    assert metrics["simulated_water_deficit_reduction_mm"] == expected_deficit_saved

    # Verify contiguous chronological dates and explicit climate basis in rotation years
    p1 = data["plans"][0]
    assert p1["rotation_years"][0]["season_start_date"] == "2024-11-15"
    assert p1["rotation_years"][0]["season_end_date"] == "2025-05-20"
    assert p1["rotation_years"][0]["cycle_days"] == 187
    assert p1["rotation_years"][0]["climate_source_type"] == "Independently Observed Harvest Season"
    assert p1["rotation_years"][0]["is_repeated_climate_assumption"] is False
    assert p1["rotation_years"][1]["climate_source_type"] == "Repeated-Climate Assumption (Stationary Climate Model)"
    assert p1["rotation_years"][1]["is_repeated_climate_assumption"] is True
    assert p1["rotation_years"][2]["climate_source_type"] == "Repeated-Climate Assumption (Stationary Climate Model)"
    assert p1["rotation_years"][2]["is_repeated_climate_assumption"] is True

    p2 = data["plans"][1]
    assert p2["rotation_years"][1]["season_start_date"] == "2024-12-01"
    assert p2["rotation_years"][1]["season_end_date"] == "2025-04-30"
    assert p2["rotation_years"][1]["cycle_days"] == 151
    assert p2["rotation_years"][1]["climate_source_type"] == "Repeated-Climate Assumption (Stationary Climate Model)"
    assert p2["rotation_years"][1]["is_repeated_climate_assumption"] is True
    assert p2["rotation_years"][2]["season_start_date"] == "2024-11-15"
    assert p2["rotation_years"][2]["season_end_date"] == "2025-04-25"
    assert p2["rotation_years"][2]["cycle_days"] == 162
    assert p2["rotation_years"][2]["climate_source_type"] == "Repeated-Climate Assumption (Stationary Climate Model)"
    assert p2["rotation_years"][2]["is_repeated_climate_assumption"] is True
    assert any("تقليص مياه السقي المحاكى" in pro for pro in p2["pros"])

    # Verify physical water balance equation (Infiltration + Irrigation + Sowing Stored Water)
    expected_supply = round(
        metrics["effective_seasonal_rain_infiltrated_mm"]
        + metrics["supplementary_irrigation_available_mm"]
        + metrics["stored_rootzone_water_at_sowing_mm"],
        1,
    )
    assert metrics["total_water_budget_mm"] == expected_supply
    assert metrics["fao56_daily_water_balance"]["mass_balance_error_mm"] == 0.0
    unrounded_mb = metrics["fao56_daily_water_balance"]["unrounded_daily_mass_balance"]
    assert abs(unrounded_mb["mass_balance_residual_mm"]) < 1e-12

    # Verify tribunal evidence references the real dataset
    tribunal = data["tribunal_verdicts"]
    climate_verdict = next(v for v in tribunal if "Climat" in v["agent_name"])
    assert "339.0" in climate_verdict["key_evidence"]
    assert "156" in climate_verdict["key_evidence"]

    smap_verdict = next(v for v in tribunal if "SMAP" in v["agent_name"])
    assert "0.266" in smap_verdict["key_evidence"]
    assert "150.0" in smap_verdict["key_evidence"]


def test_simulation_endpoint_climate_shock(client: TestClient) -> None:
    req_payload = {
        "location": {"name": "Meknes, Morocco", "latitude": 33.89, "longitude": -5.55},
        "year": 2025,
        "soil_type": "argileux_lourd",
        "water_access": "bour",
        "budget": "faible",
        "climate_shock": "drought",
    }
    res = client.post("/api/ai/simulate", json=req_payload)
    assert res.status_code == 200
    data = res.json()
    assert data["shock_applied"] == "drought"
    # Plan 1 (monoculture) water stress should be elevated under drought
    p1 = next(p for p in data["plans"] if p["id"] == "plan_monoculture")
    assert p1["water_stress_risk_pct"] > 30.0


def test_smap_sowing_provenance_and_mass_balance_regression(client: TestClient) -> None:
    """Regression test verifying sowing moisture provenance and unrounded daily mass balance conservation."""
    req_payload = {
        "location": {"name": "Meknes, Morocco", "latitude": 33.89, "longitude": -5.55},
        "year": 2025,
        "soil_type": "limoneux_profond",
        "water_access": "appoint",
        "budget": "moyen",
        "climate_shock": "none",
        "historical_compare_year": 2023,
    }
    res = client.post("/api/ai/simulate", json=req_payload)
    assert res.status_code == 200
    data = res.json()
    metrics = data["baseline_metrics"]

    # 1. Verification of Sowing Soil Moisture Provenance (November 2024 SMAP L4, NOT November 2025)
    assert metrics["sowing_moisture_source_date"] == "2024-11-01"
    assert metrics["sowing_period_moisture_m3m3"] == 0.2643
    assert metrics["sowing_moisture_observation_count"] == 240
    assert "SPL4SMGP V008" in metrics["sowing_moisture_dataset"]

    # 2. Verification of Hydrological Storage & Budget
    # Stored = 1000 * (0.2643 - 0.17) * 1.0 = 94.3 mm
    assert metrics["stored_rootzone_water_at_sowing_mm"] == 94.3
    # Dr_sow = 150 - 94.3 = 55.7 mm
    assert metrics["initial_rootzone_depletion_dr_sow_mm"] == 55.7
    # Water before stress = max(0, 75 - 55.7) = 19.3 mm
    assert metrics["water_remaining_before_stress_at_sowing_mm"] == 19.3
    # Total budget = 334.1 + 75.0 + 94.3 = 503.4 mm
    assert metrics["total_water_budget_mm"] == 503.4

    # 3. Verification of Unrounded Mass Balance Residual (< 1e-12 mm)
    wb = metrics["fao56_daily_water_balance"]
    assert wb["mass_balance_error_mm"] == 0.0
    unrounded = wb["unrounded_daily_mass_balance"]
    assert "mass_balance_residual_mm" in unrounded
    assert abs(unrounded["mass_balance_residual_mm"]) < 1e-12
    assert abs((unrounded["final_depletion_dr_mm"] - unrounded["initial_depletion_dr_mm"]) - unrounded["flux_delta_dr_mm"]) < 1e-12

    # 4. Verification of Rotation Year Climate Modeling Labels
    for plan in data["plans"]:
        assert plan["rotation_years"][0]["climate_source_type"] == "Independently Observed Harvest Season"
        assert plan["rotation_years"][0]["is_repeated_climate_assumption"] is False
        assert plan["rotation_years"][1]["climate_source_type"] == "Repeated-Climate Assumption (Stationary Climate Model)"
        assert plan["rotation_years"][1]["is_repeated_climate_assumption"] is True
        assert plan["rotation_years"][2]["climate_source_type"] == "Repeated-Climate Assumption (Stationary Climate Model)"
        assert plan["rotation_years"][2]["is_repeated_climate_assumption"] is True

    # 5. Verification of Simulated Irrigation Savings Relabeling
    assert "simulated_irrigation_savings_mm" in metrics
    assert "simulated_irrigation_savings_m3_ha" in metrics
    assert "Simulated Irrigation Saving" in metrics["irrigation_savings_label"]


