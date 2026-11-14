"""SMAP catalogue tests. CMR and Nominatim are mocked. No soil-moisture value is produced."""

from __future__ import annotations

import httpx

from tests.conftest import tangier_geocode

PERIOD = {"start_date": "2025-06-01", "end_date": "2025-06-02"}
_DATA_REL = "http://esipfed.org/ns/fedsearch/1.1/data#"


def _feed() -> dict:
    return {
        "feed": {
            "entry": [
                {
                    "id": "G3555797543-NSIDC_CPRD",
                    "title": "SMAP_L3_SM_P_E_20250601_R19240_001.h5",
                    "producer_granule_id": "SMAP_L3_SM_P_E_20250601_R19240_001.h5",
                    "time_start": "2025-06-01T00:00:00.000Z",
                    "time_end": "2025-06-01T23:59:59.999Z",
                    "dataset_id": (
                        "SMAP Enhanced L3 Radiometer Global and Polar Grid Daily "
                        "9 km EASE-Grid Soil Moisture V006"
                    ),
                    "granule_size": "647.257",
                    "soil_moisture": 0.21,
                    "links": [
                        {
                            "rel": _DATA_REL,
                            "href": "https://data.nsidc.earthdatacloud.nasa.gov/example.h5",
                        },
                        {
                            "rel": "http://esipfed.org/ns/fedsearch/1.1/s3#",
                            "href": "s3://private/example.h5",
                        },
                    ],
                }
            ]
        }
    }


def test_smap_lists_real_granule_metadata_and_drops_moisture(api_factory) -> None:
    calls = {"cmr": 0, "geo": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        if "nominatim" in url:
            calls["geo"] += 1
            return tangier_geocode()
        if "granules.json" in url:
            calls["cmr"] += 1
            assert request.url.params["short_name"] == "SPL3SMP_E"
            assert request.url.params["version"] == "006"
            assert request.url.params["point"] == "-5.8340,35.7595"
            assert request.url.params["temporal"].startswith("2025-06-01T00:00:00Z")
            return httpx.Response(200, headers={"CMR-Hits": "2"}, json=_feed())
        return httpx.Response(500, json={"message": url})

    with api_factory(handler) as api:
        first = api.client.get("/api/smap", params={"product": "spl3smp_e", "city": "Tangier, Morocco", **PERIOD})
        second = api.client.get("/api/smap", params={"product": "SPL3SMP_E", "city": "Tangier, Morocco", **PERIOD})
        refreshed = api.client.get(
            "/api/smap",
            params={"product": "SPL3SMP_E", "city": "Tangier, Morocco", "refresh": "true", **PERIOD},
        )

    assert first.status_code == 200
    body = first.json()
    assert body["source"] == "NASA CMR / NSIDC SMAP"
    assert body["product"] == "SPL3SMP_E"
    assert body["version"] == "006"
    assert body["data"] == "Humidité superficielle du sol"
    assert body["resolution_km"] == 9
    assert body["usage"] == "Analyse régionale de l'humidité"
    assert body["granule_count"] == 2
    assert body["granules_returned"] == 1
    assert body["cached"] is False
    granule = body["granules"][0]
    assert granule["title"] == "SMAP_L3_SM_P_E_20250601_R19240_001.h5"
    assert granule["size_mb"] == 647.257
    assert granule["download_url"] == "https://data.nsidc.earthdatacloud.nasa.gov/example.h5"
    assert "soil_moisture" not in body
    assert "soil_moisture" not in granule
    assert 0.21 not in granule.values()
    assert "HDF5" in " ".join(body["notes"])
    assert "2 granules" in " ".join(body["notes"])
    assert second.json()["cached"] is True
    assert refreshed.json()["cached"] is False
    assert calls == {"cmr": 2, "geo": 1}


def test_smap_root_zone_product_uses_its_version(api_factory) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if "granules.json" not in str(request.url):
            return httpx.Response(500)
        assert request.url.params["short_name"] == "SPL4SMGP"
        assert request.url.params["version"] == "008"
        assert request.url.params["point"] == "-5.8340,35.7595"
        return httpx.Response(200, headers={"CMR-Hits": "0"}, json={"feed": {"entry": []}})

    with api_factory(handler) as api:
        response = api.client.get(
            "/api/smap",
            params={"product": "SPL4SMGP", "latitude": 35.7595, "longitude": -5.834, **PERIOD},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["usage"] == "Analyse agricole plus complète"
    assert body["temporal_resolution"] == "toutes les 3 heures"
    assert body["granule_count"] == 0
    assert body["granules"] == []
    assert body["location"]["geocoded"] is False
    assert "Aucun granule" in " ".join(body["notes"])


def test_smap_rejects_unknown_product_and_dates_before_the_mission(api_factory) -> None:
    calls = {"cmr": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        if "granules.json" in str(request.url):
            calls["cmr"] += 1
        return httpx.Response(500)

    with api_factory(handler) as api:
        unknown = api.client.get("/api/smap", params={"product": "SPL2SMP", "latitude": 35.7, "longitude": -5.8, **PERIOD})
        early = api.client.get(
            "/api/smap",
            params={
                "product": "SPL3SMP_E",
                "latitude": 35.7,
                "longitude": -5.8,
                "start_date": "2015-03-01",
                "end_date": "2015-03-02",
            },
        )

    assert unknown.status_code == 422
    assert "SPL3SMP_E" in unknown.json()["message"]
    assert early.status_code == 422
    assert "2015-03-31" in early.json()["message"]
    assert calls["cmr"] == 0
