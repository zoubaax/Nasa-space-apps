"""Tests for Universal Dynamic i18n Translation Service and API."""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.mark.anyio
async def test_i18n_translate_english_identity():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        payload = {
            "target_language": "en",
            "strings": {"common": {"appName": "FieldShift AI", "orbit": "Earth Orbit"}},
        }
        res = await client.post("/api/i18n/translate", json=payload)
        assert res.status_code == 200
        data = res.json()
        assert data["language_code"] == "en"
        assert data["translated_strings"]["common"]["appName"] == "FieldShift AI"
        assert data["direction"] == "ltr"


@pytest.mark.anyio
async def test_i18n_translate_universal_location():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        payload = {
            "location": {
                "name": "Meknes, Morocco",
                "country": "Morocco",
                "country_code": "ma",
                "lat": 33.89,
                "lng": -5.55,
            },
            "strings": {"common": {"appName": "FieldShift AI"}},
        }
        res = await client.post("/api/i18n/translate", json=payload)
        assert res.status_code == 200
        data = res.json()
        assert data["direction"] == "rtl"
        assert data["language_code"] == "ar"
        assert data["country"] == "Morocco"


@pytest.mark.anyio
async def test_i18n_translate_france_location():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        payload = {
            "location": {
                "name": "Toulouse, France",
                "country": "France",
                "country_code": "fr",
                "lat": 43.60,
                "lng": 1.44,
            },
            "strings": {"common": {"appName": "FieldShift AI"}},
        }
        res = await client.post("/api/i18n/translate", json=payload)
        assert res.status_code == 200
        data = res.json()
        assert data["language_code"] == "fr"
        assert data["direction"] == "ltr"
