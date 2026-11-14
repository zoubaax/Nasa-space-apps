"""Agronomic rules follow the mocked POWER observations."""

from __future__ import annotations

import json

from tests.test_api import _nasa_handler

PERIOD = {"start_date": "2025-01-01", "end_date": "2025-01-03"}


def test_agro_recommendations_use_observed_power_values(api_factory) -> None:
    with api_factory(_nasa_handler()) as api:
        response = api.client.get(
            "/api/agro",
            params={"latitude": 35.7595, "longitude": -5.834, **PERIOD},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["indicators"]["total_precipitation"] == 5.0
    assert body["indicators"]["dry_days"] == 1
    assert body["indicators"]["hot_days"] == 1
    assert body["indicators"]["cold_days"] == 2
    status = {item["code"]: item["status"] for item in body["recommendations"]}
    assert status == {"water": "stress_hydrique", "heat": "chaleur", "cold": "froid"}
    assert [step["order"] for step in body["rotation"]] == [1, 2, 3]
    serialized = json.dumps(body, ensure_ascii=False).casefold()
    assert "rendement" not in serialized or "aucun rendement" in serialized
    assert body["nasa_request_url"]
