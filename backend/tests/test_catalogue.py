"""IMERG and HLS catalogue tests. CMR is mocked and no pixel value is produced."""

from __future__ import annotations

import httpx

PERIOD = {"start_date": "2025-06-01", "end_date": "2025-06-02"}


def _feed(title: str) -> dict:
    return {
        "feed": {
            "entry": [
                {
                    "id": "G1",
                    "title": title,
                    "time_start": "2025-06-01T00:00:00.000Z",
                    "time_end": "2025-06-01T23:59:59.999Z",
                    "dataset_id": title,
                    "granule_size": "12.5",
                    "precipitation": 4.2,
                    "NDVI": 0.55,
                    "links": [
                        {
                            "rel": "http://esipfed.org/ns/fedsearch/1.1/data#",
                            "href": "https://data.example.nasa.gov/granule",
                        }
                    ],
                }
            ]
        }
    }


def test_imerg_and_hls_list_granules_without_pixel_values(api_factory) -> None:
    seen: list[tuple[str, str]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        if "granules.json" not in str(request.url):
            return httpx.Response(500)
        seen.append((request.url.params["short_name"], request.url.params["version"]))
        title = request.url.params["short_name"]
        return httpx.Response(200, headers={"CMR-Hits": "1"}, json=_feed(title))

    with api_factory(handler) as api:
        imerg = api.client.get(
            "/api/catalogue",
            params={"product": "GPM_3IMERGDF", "latitude": 35.7695, "longitude": -5.8045, **PERIOD},
        )
        hls = api.client.get(
            "/api/catalogue",
            params={"product": "HLSL30", "latitude": 35.7695, "longitude": -5.8045, **PERIOD},
        )
        rejected = api.client.get(
            "/api/smap",
            params={"product": "GPM_3IMERGDF", "latitude": 35.7695, "longitude": -5.8045, **PERIOD},
        )

    assert imerg.status_code == 200
    imerg_body = imerg.json()
    assert imerg_body["source"] == "NASA CMR / GES DISC GPM IMERG"
    assert imerg_body["version"] == "07"
    assert imerg_body["resolution"] == "0,1° (environ 10 km)"
    assert "millimètre" in " ".join(imerg_body["notes"])
    assert "precipitation" not in imerg_body["granules"][0]
    assert hls.status_code == 200
    hls_body = hls.json()
    assert hls_body["source"] == "NASA CMR / LP DAAC HLS"
    assert hls_body["version"] == "2.0"
    assert hls_body["resolution"] == "30 m"
    assert hls_body["resolution_km"] is None
    assert "NDVI" in " ".join(hls_body["notes"])
    assert "NDVI" not in hls_body["granules"][0]
    assert seen == [("GPM_3IMERGDF", "07"), ("HLSL30", "2.0")]
    assert rejected.status_code == 422
