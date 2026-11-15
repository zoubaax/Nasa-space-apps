"""Unit tests for Location-Based Dynamic Language Adaptation (Zero Hardcoding).

Verifies that FieldShift dynamically detects the farm's terroir and location (Morocco, France, Spain, International)
and delivers localized agricultural syntheses, tribunal verdicts, and agronomic recommendations.
"""

from __future__ import annotations

from typing import Iterator
import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(app) as c:
        yield c


def test_simulation_morocco_outputs_darija(client: TestClient, monkeypatch) -> None:
    """Verify that a simulation in Morocco (Meknes) defaults to Moroccan Darija."""
    from app.core.config import get_settings
    settings = get_settings()
    monkeypatch.setattr(settings, "gemini_api_key", None)

    payload = {
        "location": {
            "name": "Meknes, Morocco",
            "latitude": 33.89,
            "longitude": -5.55,
        },
        "year": 2025,
        "soil_type": "limoneux_profond",
        "water_access": "appoint",
        "budget": "moyen",
        "climate_shock": "none",
        "primary_cereal": "ble_dur",
    }
    res = client.post("/api/ai/simulate", json=payload)
    assert res.status_code == 200
    data = res.json()

    assert data["output_language"] == "darija"
    assert data["detected_country"] in ("Maroc", "Morocco")
    assert "حكم المحكمة العلمية" in data["overall_synthesis_darija"]
    assert data["overall_synthesis_localized"] == data["overall_synthesis_darija"]

    # Tribunal agents must be in Darija / Arabic
    climate_verdict = next(v for v in data["tribunal_verdicts"] if "NASA POWER Climat" in v["agent_name"])
    assert "خبير المناخ والأرصاد" in climate_verdict["agent_role"]
    assert "بناءً على التساقطات" in climate_verdict["argument_darija"]
    assert climate_verdict["argument_localized"] == climate_verdict["argument_darija"]

    # Plan summaries must be present
    assert data["plans"][0]["summary_localized"] is not None
    assert len(data["plans"][0]["summary_localized"]) > 10


def test_simulation_france_outputs_french(client: TestClient, monkeypatch) -> None:
    """Verify that a simulation in France (Toulouse) outputs agricultural French."""
    from app.core.config import get_settings
    settings = get_settings()
    monkeypatch.setattr(settings, "gemini_api_key", None)

    payload = {
        "location": {
            "name": "Toulouse, France",
            "latitude": 43.60,
            "longitude": 1.44,
        },
        "year": 2025,
        "soil_type": "limoneux_profond",
        "water_access": "appoint",
        "budget": "moyen",
        "climate_shock": "none",
        "primary_cereal": "ble_dur",
    }
    res = client.post("/api/ai/simulate", json=payload)
    assert res.status_code == 200
    data = res.json()

    assert data["output_language"] == "fr"
    assert data["detected_country"] == "France"
    assert "Synthèse Décisionnelle du Laboratoire Virtuel" in data["overall_synthesis_localized"]
    assert "Plan Recommandé" in data["overall_synthesis_localized"]
    assert data["overall_synthesis_darija"] == data["overall_synthesis_localized"]

    # Tribunal agents must be in French
    climate_verdict = next(v for v in data["tribunal_verdicts"] if "NASA POWER Climat" in v["agent_name"])
    assert "Expert Climat & Météo" in climate_verdict["agent_role"]
    assert "observations climatiques" in climate_verdict["argument_localized"]
    assert climate_verdict["argument_darija"] == climate_verdict["argument_localized"]

    # Plan summaries must be in French
    assert "demande évaporatoire" in data["plans"][0]["summary_localized"].lower()
    assert data["plans"][0]["summary_darija"] == data["plans"][0]["summary_localized"]


def test_simulation_spain_outputs_spanish(client: TestClient, monkeypatch) -> None:
    """Verify that a simulation in Spain (Seville) outputs agricultural Spanish."""
    from app.core.config import get_settings
    settings = get_settings()
    monkeypatch.setattr(settings, "gemini_api_key", None)

    payload = {
        "location": {
            "name": "Seville, Spain",
            "latitude": 37.38,
            "longitude": -5.98,
        },
        "year": 2025,
        "soil_type": "limoneux_profond",
        "water_access": "appoint",
        "budget": "moyen",
        "climate_shock": "none",
        "primary_cereal": "ble_dur",
    }
    res = client.post("/api/ai/simulate", json=payload)
    assert res.status_code == 200
    data = res.json()

    assert data["output_language"] == "es"
    assert data["detected_country"] in ("Espagne", "Spain", "España")
    assert "Síntesis del Tribunal Científico" in data["overall_synthesis_localized"]
    assert "Estrategia Ganadora" in data["overall_synthesis_localized"]

    climate_verdict = next(v for v in data["tribunal_verdicts"] if "NASA POWER Clima" in v["agent_name"])
    assert "Experto en Clima y Meteorología" in climate_verdict["agent_role"]
    assert "monocultivo continuo" in climate_verdict["argument_localized"]


def test_simulation_international_outputs_english(client: TestClient, monkeypatch) -> None:
    """Verify that a simulation in the USA (Iowa) outputs agronomic English."""
    from app.core.config import get_settings
    settings = get_settings()
    monkeypatch.setattr(settings, "gemini_api_key", None)

    payload = {
        "location": {
            "name": "Ames, Iowa, United States",
            "latitude": 42.03,
            "longitude": -93.63,
        },
        "year": 2025,
        "soil_type": "limoneux_profond",
        "water_access": "appoint",
        "budget": "moyen",
        "climate_shock": "none",
        "primary_cereal": "ble_dur",
    }
    res = client.post("/api/ai/simulate", json=payload)
    assert res.status_code == 200
    data = res.json()

    assert data["output_language"] == "en"
    assert ("États-Unis" in data["detected_country"] or "United States" in data["detected_country"])
    assert "Virtual Laboratory Scientific Tribunal" in data["overall_synthesis_localized"]
    assert "Recommended Strategy" in data["overall_synthesis_localized"]

    climate_verdict = next(v for v in data["tribunal_verdicts"] if "NASA POWER Climate Agent" in v["agent_name"])
    assert "Climate & Meteorology Expert" in climate_verdict["agent_role"]
    assert "monoculture" in climate_verdict["argument_localized"].lower()


def test_ai_chat_location_aware_language(client: TestClient) -> None:
    """Verify that AI chat returns farm_country and localized metadata."""
    payload = {
        "message": "Quels sont les niveaux d'humidité du sol ?",
        "location": {
            "name": "Toulouse, France",
            "latitude": 43.60,
            "longitude": 1.44,
        },
        "year": 2025,
        "language": "auto",
    }
    res = client.post("/api/ai/chat", json=payload)
    assert res.status_code == 200
    data = res.json()

    assert data["language_detected"] == "fr"
    assert data["farm_country"] == "France"
    assert data["farm_language"] == "fr"
    assert "Diagnostic Agro-Climatique" in data["reply"]


def test_simulation_explicit_language_override(client: TestClient, monkeypatch) -> None:
    """Verify that an explicit language_override takes precedence over geographical location."""
    from app.core.config import get_settings
    settings = get_settings()
    monkeypatch.setattr(settings, "gemini_api_key", None)

    payload = {
        "location": {
            "name": "Meknes, Morocco",
            "latitude": 33.89,
            "longitude": -5.55,
        },
        "year": 2025,
        "language_override": "fr",
    }
    res = client.post("/api/ai/simulate", json=payload)
    assert res.status_code == 200
    data = res.json()

    assert data["output_language"] == "fr"
    assert "Synthèse Décisionnelle du Laboratoire Virtuel" in data["overall_synthesis_localized"]


def test_smap_explain_localized_multilingual(client: TestClient) -> None:
    """Verify that /api/smap-gee/explain adapts cleanly to requested language."""
    # 1. French explanation
    res_fr = client.get("/api/smap-gee/explain?variable=sm_surface&value=0.22&language=fr")
    assert res_fr.status_code == 200
    data_fr = res_fr.json()
    assert data_fr["language"] == "fr"
    assert "Indicateur d'observation" in data_fr["what"]
    assert "Humidité" in data_fr["interpretation"]

    # 2. Spanish explanation
    res_es = client.get("/api/smap-gee/explain?variable=sm_surface&value=0.12&language=es")
    assert res_es.status_code == 200
    data_es = res_es.json()
    assert data_es["language"] == "es"
    assert "Indicador de observación" in data_es["what"]
    assert "Déficit hídrico" in data_es["interpretation"]

    # 3. English explanation
    res_en = client.get("/api/smap-gee/explain?variable=sm_surface&value=0.30&language=en")
    assert res_en.status_code == 200
    data_en = res_en.json()
    assert data_en["language"] == "en"
    assert "NASA Earth observation" in data_en["what"]
    assert "Observed value:" in data_en["interpretation"]

    # 4. Default Darija
    res_ar = client.get("/api/smap-gee/explain?variable=sm_surface&value=0.20&language=darija")
    assert res_ar.status_code == 200
    data_ar = res_ar.json()
    assert data_ar["language"] == "darija"
    assert "رطوبة" in data_ar["interpretation"]

