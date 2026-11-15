# Farmer's Eye — NASA Earth Science Data Pipeline & Provenance

> **Document Version:** 2.0.0 — Comprehensive NASA Dataset Integration Dossier  
> **Challenge Track:** _Field Shift: Adapting Farms with NASA Data_  
> **Status:** ✅ **Production Data Pipeline Active · Authentic Provenance Verified**

---

## 1. Overview of NASA Earth Observation Datasets

Farmer's Eye is engineered to turn coarse, global NASA Earth observation instruments into actionable, scientifically defensible farm-level decision support. Rather than relying on static tables or synthetic figures, Farmer's Eye interfaces directly with three premier NASA missions:

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                FARMER'S EYE NASA DATA INGESTION MATRIX                                 │
├──────────────────────┬──────────────────────────┬────────────────────────────┬─────────────────────────┤
│ NASA MISSION / SENSOR│ PRODUCT ID & VERSION     │ SPATIAL / TEMPORAL SUPPORT │ KEY VARIABLES EXTRACTED │
├──────────────────────┼──────────────────────────┼────────────────────────────┼─────────────────────────┤
│ NASA SMAP            │ SPL4SMGP V008            │ 9 km EASE-Grid 2.0         │ • sm_rootzone (0-100cm) │
│ (Soil Moisture       │ (Level-4 Surface &       │ 3-hourly assimilation      │ • sm_surface (0-5cm)    │
│ Active Passive)      │ Root-Zone Geophysical)   │ (2,928 obs/year)           │ • leaf_area_index       │
│                      │                          │                            │ • veg_greenness_fraction│
│                      │                          │                            │ • soil_temp_layer1      │
├──────────────────────┼──────────────────────────┼────────────────────────────┼─────────────────────────┤
│ NASA POWER           │ Daily Point AG           │ 0.5° × 0.625° native       │ • T2M, T2M_MAX, T2M_MIN │
│ (Prediction of       │ (GMAO MERRA-2 and        │ Daily timestep             │ • PRECTOTCORR           │
│ Worldwide Energy)    │ GEOS-FP IT assimilation) │ (365/366 records/year)     │ • ALLSKY_SFC_SW_DWN     │
│                      │                          │                            │ • RH2M, WS2M            │
├──────────────────────┼──────────────────────────┼────────────────────────────┼─────────────────────────┤
│ NASA GPM             │ GPM_3IMERGDF V07         │ 0.1° × 0.1° (~10 km)       │ • precipitationCal      │
│ (Global Precipitation│ (Integrated Multi-       │ Daily / Monthly            │ • Calibrated rainfall   │
│ Measurement)         │ satellitE Retrievals)    │ accumulation               │   accumulation          │
├──────────────────────┼──────────────────────────┼────────────────────────────┼─────────────────────────┤
│ NASA CMR             │ Earthdata CMR API        │ Global point-in-polygon    │ • HDF5 Granule metadata │
│ (Common Metadata     │ Granule Search           │ Real-time cataloging       │ • Download direct links │
│ Repository)          │                          │                            │ • NSIDC & GES DISC DAAC │
└──────────────────────┴──────────────────────────┴────────────────────────────┴─────────────────────────┘
```

---

## 2. Deep-Dive: NASA SMAP Level-4 Geophysical Data

### 2.1 The Value of Level-4 Over Level-3

While SMAP Level-3 radiometer measurements only penetrate the upper $0\text{–}5\text{ cm}$ of topsoil, crop root systems (such as Wheat, Barley, and Legumes) extract water down to **$100\text{ cm}$ ($1.0\text{ m}$)**. Farmer's Eye utilizes **SMAP Level-4 (SPL4SMGP)**, which assimilates L-band radar/radiometer brightness temperatures into the NASA Catchment Land Surface Model (CLSM).

- **Target Dataset:** `NASA/SMAP/SPL4SMGP/008` (via Google Earth Engine API).
- **Spatial Support:** Global Cylindrical Equal-Area Scalable Earth Grid (EASE-Grid 2.0, $\approx 9\text{ km}$).
- **Temporal Resolution:** 3-hourly assimilations ($8\text{ snapshots/day} = 2,928\text{ points/year}$).

### 2.2 Variables Assimilated into Farmer's Eye

1. `sm_rootzone`: Volumetric soil moisture in the root zone ($0\text{–}100\text{ cm}$, $\text{m}^3\text{/m}^3$). Used to initialize pre-sowing soil water storage ($W_{\text{stored,sow}}$) and monitor chronic depletion.
2. `sm_surface`: Surface soil moisture ($0\text{–}5\text{ cm}$, $\text{m}^3\text{/m}^3$). Evaluates seedbed moisture during sowing windows.
3. `sm_rootzone_pctl`: Soil moisture percentile relative to a 20-year climatological baseline ($0\text{–}100\%$). Provides intuitive drought status.
4. `soil_temp_layer1`: Surface soil temperature ($^\circ\text{C}$). Detects germination-inhibiting frost ($< 5^\circ\text{C}$) or seedbed heat stress.
5. `vegetation_greenness_fraction` & `leaf_area_index`: Biosphere vegetative density verifying actual canopy development versus simulated growth.
6. `soil_water_infiltration_flux`: Topsoil flux ($\text{kg}\cdot\text{m}^{-2}\cdot\text{s}^{-1}$) validating rainfall penetration.

---

## 3. Deep-Dive: NASA POWER Daily Agroclimatology (AG)

### 3.1 Uncapped, Real-Time Climate Assimilation

Farmer's Eye queries the **NASA POWER Daily Point API** (`/api/temporal/daily/point`) in real time. POWER combines NASA's GMAO MERRA-2 reanalysis and GEOS-FP IT assimilation models to produce continuous meteorological series without missing weather station gaps.

- **Parameters Queried:**
  - `T2M`: Daily average temperature at 2 meters ($^\circ\text{C}$).
  - `T2M_MAX` & `T2M_MIN`: Maximum and minimum daily temperatures ($^\circ\text{C}$), used for diurnal vapor pressure deficit calculation.
  - `PRECTOTCORR`: Corrected daily precipitation ($\text{mm/day}$).
  - `ALLSKY_SFC_SW_DWN`: All-sky insolation incident on a horizontal surface ($\text{MJ}\cdot\text{m}^{-2}\cdot\text{day}^{-1}$), the key driver of the Penman-Monteith net radiation term.
  - `RH2M`: Relative humidity at 2 meters ($\%$).
  - `WS2M`: Wind speed at 2 meters ($\text{m/s}$).

### 3.2 Strict NASA Fill-Value Policy

NASA POWER flags missing or unobserved data with **`-999`** sentinel values. Farmer's Eye enforces a strict normalization rule:

- Sentinel `-999` values are immediately converted to `null` and isolated.
- **They are NEVER replaced with synthetic approximations or hallucinated averages.**
- The API returns explicit coverage indicators (`days_with_values / total_days`) so users know the exact completeness of the observational record.

---

## 4. Spatial Provenance & The "Honest Resolution" Policy

A common failure mode in AI hackathons is claiming that an IoT sensor or interpolation model "downscales" a 9 km satellite pixel into a 1-meter micro-farm measurement. Farmer's Eye explicitly rejects this false claim.

### 4.1 Explicit Two-Tier Spatial Representation

Farmer's Eye enforces strict spatial provenance across the frontend and backend:

1. **Tier 1 — Regional Satellite Context (9–11 km):**  
   Represents regional environmental forcing (atmospheric evaporative demand $ET_0$, regional drought stress, watershed-scale precipitation trends). Displayed as the **SMAP 9 km EASE-Grid Cell**.
2. **Tier 2 — Local Farm Ground Truth (Point Sensor at 15 cm):**  
   Represents localized root-zone dielectric permittivity measured in-situ by the **ESP32 Capacitive Soil Probe v1.2** on GPIO34. Displayed as an independent in-situ ground-truth tile.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       FIELD TELEMETRY CARD PROVENANCE                       │
├─────────────────────────────────────────────────────────────────────────────┤
│  [SMAP 9km Grid] SPL4SMGP V8 · Root-zone (0-100cm): 0.248 m³/m³              │
│  [NASA POWER AG] Daily Agrometeorology (0.5° × 0.625°): 334.1 mm/yr         │
│  [ESP32 SENSOR]  Local In-Situ Probe (GPIO34, Depth: 15cm): 2,420 Raw ADC   │
│                  Calibrated VWC: 0.231 m³/m³ (±3.5% in-situ accuracy)        │
└─────────────────────────────────────────────────────────────────────────────┘
```

Both measurements are displayed side-by-side with clear provenance tags, allowing farmers to observe how local irrigation and mulching decouple their field from regional drought.

---

## 5. Offline Fallback & Hackathon Presentation Resilience

To ensure that live pitch demonstrations never break due to external network outages or Earthdata rate limits, Farmer's Eye implements a multi-tiered fallback architecture:

1. **Tier 1 — Live Online Extraction:**
   - Direct HTTPS calls to NASA POWER API and Google Earth Engine.
2. **Tier 2 — Local Atomic Cache (`backend/data/`):**
   - Every successful satellite extraction is cached as an atomic JSON file on disk, keyed by coordinates, date range, and resolution digest.
3. **Tier 3 — Pre-Cached Verified Regional Extracts:**
   - Pre-cached, authentic SMAP L4 and NASA POWER datasets are included in `backend/data/smap_gee/` for key Moroccan agricultural hubs:
     - **Meknès / Saïss Plateau** (`33.8900°N, -5.5500°W`) — Years 2021, 2022, 2023, 2024, 2025.
     - **Casablanca / Chaouia Plain** (`33.5731°N, -7.5898°W`) — Year 2025.
     - **Tangier / Loukkos Basin** (`35.7687°N, -5.8139°W`) — Years 2021, 2023, 2025.
4. **Geodesic Nearest-Neighbor Fallback:**
   - If a user selects a farm without local cached data and external APIs are offline, Farmer's Eye finds the nearest regional pixel in Morocco, transparently noting:
     `"Assimilated from nearest regional NASA SMAP L4 pixel in Morocco (42 km away)."`

---

## 6. Authoritative Network & Data Endpoint Inventory

Below is the complete, verified list of all live external URLs, satellite data repositories, and edge endpoints consumed across the Farmer's Eye platform:

### 6.1 NASA Earth Observation Endpoints

| Service                           | Provider / Authority                    | Exact URL / Endpoint                                                                 | Integration Mode & Role                                                                                                                                                          |
| :-------------------------------- | :-------------------------------------- | :----------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **NASA POWER Daily Point API**    | NASA Langley Research Center            | `https://power.larc.nasa.gov/api/temporal/daily/point`                               | Live REST API queries: daily solar radiation (`ALLSKY_SFC_SW_DWN`), temperatures (`T2M`, `T2M_MAX`, `T2M_MIN`), precipitation (`PRECTOTCORR`), humidity (`RH2M`), wind (`WS2M`). |
| **NASA POWER Web Portal**         | NASA POWER Project                      | `https://power.larc.nasa.gov/`                                                       | Official documentation, parameter dictionary, and validation standards.                                                                                                          |
| **NASA SMAP Level-4 (GEE Asset)** | NASA / JPL / GSFC                       | `NASA/SMAP/SPL4SMGP/008`                                                             | Google Earth Engine cloud asset: 3-hourly $9\text{ km}$ root-zone (`sm_rootzone`) and surface (`sm_surface`) soil moisture.                                                      |
| **NASA SMAP GEE Data Catalog**    | Google Earth Engine                     | `https://developers.google.com/earth-engine/datasets/catalog/NASA_SMAP_SPL4SMGP_008` | Catalog entry, band definitions, scale factor ($11,000\text{ m}$), and temporal boundaries.                                                                                      |
| **NASA SMAP NSIDC DAAC Portal**   | NSIDC Distributed Active Archive Center | `https://doi.org/10.5067/129990F62DEE`                                               | Official NASA DOI landing page, science user guide, and calibration papers.                                                                                                      |
| **NASA Earthdata CMR API**        | NASA EOSDIS                             | `https://cmr.earthdata.nasa.gov/search/granules.json`                                | Real-time spatio-temporal catalog search for HDF5 granules covering farm coordinates.                                                                                            |
| **NASA Earthdata Portal**         | NASA EOSDIS                             | `https://earthdata.nasa.gov/`                                                        | Earthdata authentication, DAAC routing, and user registration.                                                                                                                   |
| **NASA GPM IMERG Precipitation**  | NASA GES DISC                           | `https://doi.org/10.5067/GPM/IMERGDF/DAY/07`                                         | Ground-truth satellite precipitation calibration (GPM_3IMERGDF V07).                                                                                                             |

### 6.2 Geospatial Basemap, Tile & Geocoding Endpoints

| Service                         | Provider                 | Exact URL / Template                                                                            | Role                                                                                  |
| :------------------------------ | :----------------------- | :---------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------ |
| **Esri World Imagery**          | ArcGIS Online / Esri     | `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}` | High-resolution satellite raster tiles for MapLibre 3D spherical globe basemap.       |
| **MapLibre Font Glyphs**        | MapLibre CDN             | `https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf`                                   | Clean vector typography on the 3D globe.                                              |
| **Nominatim Forward Search**    | OpenStreetMap Foundation | `https://nominatim.openstreetmap.org/search`                                                    | Geocoding: resolves farm/commune search text into latitude and longitude coordinates. |
| **Nominatim Reverse Geocoding** | OpenStreetMap Foundation | `https://nominatim.openstreetmap.org/reverse`                                                   | Reverse geocoding: derives administrative Moroccan province from GPS coordinates.     |
| **IP Geolocation Services**     | GeoJS / IPWhoIs / IPAPI  | `https://get.geojs.io/v1/ip/geo.json`<br>`https://ipwho.is/`<br>`https://ipapi.co/json/`        | Triple-redundant auto-centering of camera to user's geographic region.                |

### 6.3 Artificial Intelligence & In-Situ IoT Edge Endpoints

| Service                      | Endpoint                                                                                                                      | Role                                                                                 |
| :--------------------------- | :---------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------- |
| **Google Gemini API**        | `https://generativelanguage.googleapis.com/v1beta`                                                                            | Multi-Agent Tribunal consensus debate and Moroccan Darija dialect translation.       |
| **In-Situ Telemetry Ingest** | `POST http://127.0.0.1:8000/api/sensors/soil-moisture`                                                                        | Real-time ingest of raw ADC and calibrated VWC from ESP32 capacitive probe (GPIO34). |
| **In-Situ Telemetry Query**  | `GET http://127.0.0.1:8000/api/sensors/soil-moisture/latest`                                                                  | Telemetry HUD polling of 15cm point root-zone soil ground truth.                     |
| **Edge Broadcast Control**   | `POST http://127.0.0.1:8000/api/sensors/edge-broadcast/start`<br>`POST http://127.0.0.1:8000/api/sensors/edge-broadcast/stop` | Controls the hardware probe simulation stream for live demonstrations.               |
| **Live Web Documentation**   | `https://nasa-docs.vercel.app/`                                                                                               | Production web portal hosting all technical dossiers and scientific proofs.          |

---

## 7. Official NASA Product Links & Citations

- **NASA SMAP Level-4 Soil Moisture:**  
  Reichle, R., et al. (2022). _SMAP L4 Global 3-hourly 9 km EASE-Grid Surface and Root Zone Volumetric Soil Moisture (SPL4SMGP), Version 8._ Boulder, Colorado USA. NASA National Snow and Ice Data Center Distributed Active Archive Center.  
  [https://doi.org/10.5067/129990F62DEE](https://doi.org/10.5067/129990F62DEE)
- **NASA POWER Project:**  
  NASA Langley Research Center. _Prediction of Worldwide Energy Resources (POWER) Daily Point API._  
  [https://power.larc.nasa.gov/](https://power.larc.nasa.gov/)
- **NASA GPM IMERG Precipitation:**  
  Huffman, G. J., et al. (2020). _GPM IMERG Final Precipitation L3 1 day 0.1 degree x 0.1 degree V07._ Goddard Earth Sciences Data and Information Services Center (GES DISC).  
  [https://doi.org/10.5067/GPM/IMERGDF/DAY/07](https://doi.org/10.5067/GPM/IMERGDF/DAY/07)
