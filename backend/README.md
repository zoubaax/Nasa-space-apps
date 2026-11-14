# NASA POWER Climate Data Service

Local climate service for the NASA Space Apps Challenge agricultural decision-support platform. It loads **observed** daily data from the [NASA POWER Daily Point API](https://power.larc.nasa.gov/docs/services/api/temporal/daily/), converts a city name to coordinates when needed, and exposes normalized observations plus agricultural indicators over HTTP.

The service does not invent weather values. NASA fill values (typically `-999`) stay missing. Averages, sums, and day counts use only the days NASA actually returned.

LangGraph, an LLM, RAG, and the other planned agents are not part of this service. `ClimateDataService` is the boundary a future Climate Agent can call.

## Setup (Windows, PowerShell)

From this directory:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload
```

If activation is blocked by execution policy, run this once in the same window and then activate again:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

Use this command while developing. It reloads when application code changes and ignores the cache files written under `data/`:

```powershell
uvicorn app.main:app --reload --reload-dir app
```

Interactive API docs: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

No `.env` file is required. Copy `.env.example` to `.env` to change timeouts, thresholds, the cache directory, or the Nominatim User-Agent. Set `GEOCODING_USER_AGENT` to identify your installation before you share the service. Nominatim's usage policy is at <https://operations.osmfoundation.org/policies/nominatim/>.

## What a request does

1. Require a city or a latitude/longitude pair. Explicit coordinates are used as given and are not geocoded. A city is resolved with OpenStreetMap Nominatim.
2. Coordinates sent to NASA are rounded to 4 decimal places.
3. Reject periods that start before `1981-01-01`, end after today (UTC), run backwards, or exceed 3660 days.
4. Request the AG community daily point endpoint in local solar time (`time-standard=LST`) for `T2M`, `T2M_MAX`, `T2M_MIN`, `PRECTOTCORR`, `RH2M`, `WS2M`, and `ALLSKY_SFC_SW_DWN`.
5. Store the NASA response bytes under `data/raw/` and a normalized CSV under `data/processed/`.
6. Return JSON. Missing observations are `null`.

Example:

```text
GET /api/climate?city=Tangier,%20Morocco&start_date=2025-01-01&end_date=2025-12-31
```

The same request with the sample coordinate pair:

```text
GET /api/climate?latitude=35.7595&longitude=-5.8340&start_date=2025-01-01&end_date=2025-12-31
```

Those coordinates are an input example for Tangier. They are not climate observations.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Process health and whether the cache directory is writable. Does not call NASA or Nominatim. |
| `GET` | `/api/climate` | Normalized daily observations. |
| `GET` | `/api/climate/summary` | Agricultural indicators, coverage, and the formula for each indicator. |
| `GET` | `/api/climate/export` | The same daily table as CSV. Empty cells are missing observations. |
| `GET` | `/api/smap` | SMAP granules from the public NASA CMR catalogue. |
| `GET` | `/api/catalogue` | SMAP, GPM IMERG Final daily, or HLS Landsat granules from CMR. |
| `GET` | `/api/agro` | Recommendations and a rotation order computed from the NASA POWER summary. |

Shared query parameters:

| Parameter | Required | Meaning |
|---|---|---|
| `city` | one of city or coordinates | For example `Tangier, Morocco`. |
| `latitude`, `longitude` | together, or omit both | Decimal degrees. When both are present they win over `city`. |
| `start_date`, `end_date` | yes | Inclusive `YYYY-MM-DD`. |
| `refresh` | no | `true` bypasses the NASA file cache and requests POWER again. |

Summary-only thresholds:

| Parameter | Default | Rule |
|---|---|---|
| `hot_day_threshold` | `30` | Hot day when observed `T2M_MAX` is greater than or equal to this value. |
| `cold_day_threshold` | `5` | Cold day when observed `T2M_MIN` is less than or equal to this value. |
| `dry_day_threshold` | `1.0` | Dry day when observed `PRECTOTCORR` is strictly below this value. |

Defaults are Celsius and millimeters because that is what the POWER AG community publishes for these parameters. The service does not convert units. Each response includes the units NASA sent. If a unit does not match that assumption, the summary adds a warning and still applies the threshold numerically.

## SMAP

`GET /api/smap` searches the public NASA CMR catalogue for granules that cover the same city or coordinates. It uses the products:

| Product | Data | Resolution | Use | Version |
|---|---|---|---|---|
| `SPL3SMP_E` | Humidité superficielle du sol | 9 km | Analyse régionale de l'humidité | 006, daily |
| `SPL4SMGP` | Humidité en surface et dans la zone racinaire | 9 km | Analyse agricole plus complète | 008, every 3 hours |

`GET /api/catalogue` accepts `product=SPL3SMP_E`, `SPL4SMGP`, `GPM_3IMERGDF` (IMERG Final daily, version 07), or `HLSL30` (HLS Landsat, version 2.0, 30 m). `GET /api/smap` still accepts only the two SMAP products. The point sent to CMR is `longitude,latitude`. Coverage starts on 2015-03-31, and a search can span at most 366 days. The response lists granule names, times, sizes, and the HTTPS download link. `granule_count` is the `CMR-Hits` total. Only the first page is returned, 20 granules by default.

The volumetric soil moisture, the IMERG precipitation amount, and the HLS reflectance stay inside the data files. Downloading those files needs a NASA Earthdata login. These endpoints do not extract those values and do not invent them.

`GET /api/agro` calls the same POWER summary, then applies three documented rules: water stress when at least half of the observed precipitation days are dry, heat when at least one day reaches the hot-day threshold, and cold when at least one day reaches the cold-day threshold. The rotation orders those constraints. It does not name a crop species and it does not estimate a yield.

The local tester at `http://127.0.0.1:8000/` has an API select for POWER and these two products. A short period is the useful test for `SPL4SMGP`, because a long period contains thousands of 3-hour granules.

## Indicator calculations

The summary response repeats these rules in `definitions`. Days with a null observation are left out. They are never replaced with zero, with a neighboring day, or with an estimate.

| Indicator | Formula | If the series is entirely missing |
|---|---|---|
| `average_temperature` | mean of observed `T2M` | `null`. `T2M` is not estimated from `T2M_MIN` and `T2M_MAX`. |
| `minimum_temperature` | minimum of observed `T2M_MIN` | `null` |
| `maximum_temperature` | maximum of observed `T2M_MAX` | `null` |
| `total_precipitation` | sum of observed `PRECTOTCORR` | `null`. A partial sum is labeled in `notes` and is not a zero-filled total. |
| `average_relative_humidity` | mean of observed `RH2M` | `null` |
| `average_wind_speed` | mean of observed `WS2M` | `null` |
| `average_solar_radiation` | mean of observed `ALLSKY_SFC_SW_DWN` | `null`. Kept in NASA's reported unit. |
| `dry_days` | count of observed `PRECTOTCORR < dry_day_threshold` | `null`, not zero |
| `hot_days` | count of observed `T2M_MAX >= hot_day_threshold` | `null`, not zero |
| `cold_days` | count of observed `T2M_MIN <= cold_day_threshold` | `null`, not zero |

`coverage` reports how many requested days had a value, how many did not, and which dates NASA did not return. A date NASA omitted is listed in `dates_not_returned`. It is not inserted as a fabricated row.

A precipitation value of `0` is an observation. It counts toward the sum and can count as a dry day. Only the NASA fill value becomes null.

Daily values use NASA POWER local solar time. `retrieved_at` is when this service stored the NASA document. `nasa_request_url` is the POWER request that produced it. `nasa_grid_latitude` and `nasa_grid_longitude` are the grid point POWER returned, which can differ from the coordinate that was requested.

## Cache

Identical historical requests are served from disk.

- `data/raw/*.json` is the NASA response body, unchanged, including fill values.
- `data/raw/*.meta.json` stores `retrieved_at`, the request URL, the coordinates, and the period.
- `data/processed/*.csv` is the normalized table. Empty cells are missing observations.
- `data/geocode/` remembers successful Nominatim lookups so repeated city requests do not exceed Nominatim's rate limit. `refresh=true` does not clear this directory.
- `data/smap/` stores the CMR granule search for a product, point, and period. `refresh=true` requests CMR again.

The cache key is the community, time standard, rounded coordinates, period, and parameter list. A second identical call returns `"cached": true` and the original `retrieved_at`. `refresh=true` downloads POWER again and replaces those files.

POWER's near-real-time window can later replace fill values. For a period that ended in the last few days, call again with `refresh=true`.

## Errors

Transient timeouts, connection failures, HTTP 408, HTTP 429, and HTTP 5xx are retried with exponential backoff. The default is 3 retries for NASA (4 attempts) and 2 retries for Nominatim. HTTP 400 and other completed client errors are not retried.

| Situation | HTTP status | `error` |
|---|---|---|
| Missing location, bad period, or a rejected upstream query | 422 | `invalid_request` |
| City not found | 404 | `city_not_found` |
| NASA or Nominatim rate limit after retries | 429 | `nasa_rate_limited` or `geocoding_rate_limited` |
| Upstream HTTP failure or unusable NASA document | 502 | `nasa_http_error`, `nasa_empty`, `nasa_invalid_payload`, or `geocoding_error` |
| Network failure after retries | 503 | `nasa_network` or `geocoding_network` |
| Timeout after retries | 504 | `nasa_timeout` or `geocoding_timeout` |

## Tests

Unit tests mock NASA and Nominatim. The synthetic JSON fixture lives in `tests/sample_payload.py` and is not used by the running service.

```powershell
pytest
```

Optional live check for 1–7 June 2025 at Tangier. This calls NASA POWER, and the city test also calls Nominatim:

```powershell
$env:RUN_LIVE_NASA = "1"
pytest -m live
```

## Future Climate Agent

A later LangGraph Climate Agent can call `ClimateDataService` directly instead of adding a second NASA client:

```python
from app.services.climate_service import ClimateDataService, ClimateRequest

summary = await service.get_summary(request)
payload = await service.build_agent_payload(request)
```

`build_agent_payload` returns the summary document as a JSON-ready dictionary: observations provenance, units, indicator values, formulas, missing-day coverage, and the NASA request URL. The planned Supervisor, Soil, Crop, Rotation, RAG, and Validation agents are out of scope for this service.

## Verification

Checked with Python 3.12.9 on Windows.

- Mocked unit tests: `pytest` — 33 passed. The two live tests stay skipped unless `RUN_LIVE_NASA=1`.
- Live week at latitude 35.7595, longitude -5.8340, 1–7 June 2025: NASA POWER returned HTTP 200, seven complete days, and units `C`, `mm/day`, `%`, `m/s`, and `MJ/m^2/day`. The summary and CSV for that same request were cache hits, and the CSV contained no `-999`.
- Live city request for `Tangier, Morocco`, 1 January–31 December 2025: Nominatim resolved the city, NASA returned 365 days with no missing values for the seven parameters, and the service wrote the raw JSON and normalized CSV under `data/`. That exact request is now cached. Call it again with `refresh=true` to download POWER once more.

The June and full-year figures come from those NASA responses. They are not stored in the application code.

## Project layout

```text
nasa-power-service/
├── app/
│   ├── main.py
│   ├── api/
│   ├── services/
│   ├── models/
│   └── core/
├── data/
│   ├── raw/
│   ├── processed/
│   ├── geocode/
│   └── smap/
├── tests/
├── requirements.txt
├── .env.example
└── README.md
```
