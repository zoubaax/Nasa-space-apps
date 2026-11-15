<div align="center">

# 🌾 Farmer's Eye
### Adaptive Crop Rotation with NASA Earth Observations & In-Situ IoT

[![NASA Space Apps Challenge 2026](https://img.shields.io/badge/NASA%20Space%20Apps-2026%20Global%20Challenge-blue.svg?style=for-the-badge&logo=nasa)](https://www.spaceappschallenge.org/)
[![Challenge Track](https://img.shields.io/badge/Track-Field%20Shift%3A%20Adapting%20Farms%20with%20NASA%20Data-06b6d4.svg?style=for-the-badge)](https://www.spaceappschallenge.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688.svg?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React 19](https://img.shields.io/badge/React%2019-Vite%208-61DAFB.svg?style=for-the-badge&logo=react&logoColor=black)](https://react.dev)
[![MapLibre GL](https://img.shields.io/badge/MapLibre%20GL-3D%20Globe-396B9E.svg?style=for-the-badge&logo=maplibre&logoColor=white)](https://maplibre.org)
[![Scientific Rigor](https://img.shields.io/badge/Physics%20Engine-FAO--56%20Dual%20Crop-10b981.svg?style=for-the-badge)](https://www.fao.org/land-water/databases-and-software/cropwat/en/)

**A scientifically defensible, explainable digital twin and decision-support platform that fuses regional NASA Earth observation satellites, localized farm IoT sensors, and deterministic FAO-56 crop models to compare 3-season crop rotation scenarios under drought stress — without hallucinated AI numbers.**

[Live Architecture](#-system-architecture) • [Documentation Matrix](#-clickable-documentation-matrix) • [5 Judging Criteria](#-evaluation-against-the-5-nasa-judging-criteria) • [Quickstart Guide](#-quickstart-guide-in-60-seconds)

---

</div>

## 📑 Clickable Documentation Matrix

To facilitate thorough evaluation by NASA Space Apps judges and peer reviewers, our comprehensive system specifications, scientific validation audits, judging dossiers, and hardware blueprints are cataloged below. Click any link to jump directly to the detailed technical dossier:

| 📂 Evaluation Pillar / Domain | 📄 Document / Whitepaper | 🎯 Primary Audience | 🔍 Key Contents & Verification Proof |
| :--- | :--- | :--- | :--- |
| **1. Impact** | [`docs/IMPACT.md`](docs/IMPACT.md) | NASA Impact Judges | Real-world Saïss drought crisis, $-934\text{ m}^3\text{/ha}$ water demand avoidance, biological $N_2$ fixation, and smallholder equity. |
| **2. Creativity** | [`docs/CREATIVITY.md`](docs/CREATIVITY.md) | NASA Innovation Judges | "Earth Trials" 4-laboratory digital twin (Crop Battle, Climate Attack, Time Machine, AI Tribunal) & authentic Moroccan Darija AI. |
| **3. Validity** | [`docs/VALIDITY.md`](docs/VALIDITY.md) | Agronomists & Scientists | Deterministic FAO-56 Penman-Monteith physics, USDA Curve Number infiltration, machine mass balance residual ($2.84 \times 10^{-14}\text{ mm}$). |
| **4. Relevance** | [`docs/RELEVANCE.md`](docs/RELEVANCE.md) | Remote Sensing Judges | Direct ingestion of NASA SMAP L4 (SPL4SMGP V008 9km), NASA POWER, GPM IMERG, CMR catalog, and two-tier spatial fusion. |
| **5. Presentation** | [`docs/PRESENTATION.md`](docs/PRESENTATION.md) | UX / Hackathon Judges | Aerospace mission control HUD, 60fps MapLibre 3D globe, quad-lingual i18n (AR/FR/EN/ES), and 30-second elevator pitch script. |
| **Orchestrator Architecture** | [`docs/ORCHESTRATOR_ARCHITECTURE.md`](docs/ORCHESTRATOR_ARCHITECTURE.md) | Software Architects | Hierarchical Multi-Agent Supervisor DAG, input/output schemas for all sub-agents, SSE streaming protocols, and guardrails. |
| **Scientific Proof Dossier** | [`docs/SCIENTIFIC_VALIDATION_AND_AUDIT.md`](docs/SCIENTIFIC_VALIDATION_AND_AUDIT.md) | Mathematical Reviewers | Full mathematical derivations, phenological $K_c$ step curves, soil moisture depletion limits, and IEEE-754 precision audit. |
| **NASA Data Pipeline** | [`docs/NASA_DATA_SOURCES_AND_RELEVANCE.md`](docs/NASA_DATA_SOURCES_AND_RELEVANCE.md) | Earth Observation Leads | Technical data dictionary for SMAP 9km rootzone, MERRA-2 radiation, CERES solar, and -999 data hygiene protocols. |
| **Hardware & In-Situ IoT** | [`docs/ESP32_SOIL_SENSOR_INTEGRATION_PLAN.md`](docs/ESP32_SOIL_SENSOR_INTEGRATION_PLAN.md) | IoT / Hardware Judges | Capacitive v1.2 sensor, ADC transfer curves, GPIO34 telemetry ingestion, Wi-Fi token authentication, and BOM under \$8. |
| **Master Blueprint** | [`docs/FARMER_EYE_MASTER_CONTEXT.md`](docs/FARMER_EYE_MASTER_CONTEXT.md) | General Reviewers | Comprehensive challenge contextualization, Saïss pilot farm baseline, botanical family succession rules, and data provenance. |
| **Milestone Tracking** | [`docs/PROGRESS.md`](docs/PROGRESS.md) | Hackathon Evaluators | Chronological milestone validation checklist tracking Phase 0 through Phase 6 deliverables (100% verified complete). |

---

## 🏛️ System Architecture

Farmer's Eye bridges the gap between **coarse regional satellite observations** (~9–11 km grid cells) and **micro-farm physical realities** (point sensors at 15 cm depth) via a 5-tier reactive architecture:

```mermaid
flowchart TD
    subgraph DataSources["1. Environmental & In-Situ Data Ingestion"]
        GEE["NASA SMAP Level-4 (SPL4SMGP V008)\n• 9-11 km Global EASE-Grid 2.0\n• Root-zone (0-100cm) & Surface (0-5cm) Moisture"]
        PWR["NASA POWER Daily Agroclimatology (AG)\n• Daily T2M, Tmax, Tmin, Radiation, Humidity\n• 0.5° × 0.625° Resolution Point API"]
        ESP["In-Situ ESP32 Soil Probe Telemetry\n• Capacitive v1.2 on GPIO34 (15cm depth)\n• Raw ADC + Piecewise VWC Calibration"]
    end

    subgraph BackendCore["2. FastAPI Core & Spatial Provenance Service"]
        API["FastAPI Ingestion Endpoints (/api/v1)"]
        PROV["Spatial Provenance & Resolution Demarcator\n(Enforces explicit separation of 9km pixel vs point sensor)"]
        CACHE["Offline Pre-Cached Real Satellite Extracts\n(Meknès, Casablanca, Tangier Fixtures)"]
    end

    subgraph ScienceEngine["3. Deterministic Agronomic Digital Twin (agri_simulation.py)"]
        FAO["FAO-56 Dual Crop Water Balance\n• Daily Penman-Monteith ET0 Calculation\n• USDA SCS Curve Number Infiltration & Runoff\n• Root-Zone Depletion (Dr) & Stress Coefficient (Ks)"]
        MASS["Machine Mass Balance Conservation Gate\nResidual: |ΔDr - (-[Inf + Irr] + ETa + DP)| < 1e-12 mm"]
        MCDA["Multi-Criteria Decision Analysis (MCDA)\nResilience = 0.35·(100 - Stress) + 0.25·Soil + 0.20·Stab + 0.20·Budget"]
    end

    subgraph MultiAgentLayer["4. Multi-Agent Orchestrator & AI Scientific Tribunal"]
        ORCH["Central Supervisor Orchestrator (DAG)"]
        AG_CLIM["Climate Specialist\n(NASA POWER Data)"]
        AG_HYDRO["Hydrology Specialist\n(SMAP L4 Data)"]
        AG_AGRO["Agronomy Specialist\n(Crop Succession Rules)"]
        AG_SENSOR["In-Situ IoT Specialist\n(ESP32 Ground Truth)"]
        AG_GUARD["Scientific Guardrail Sentinel\n(Blocks Unverified Claims)"]
    end

    subgraph FrontendDeck["5. Mission Control UI (React 19 + MapLibre GL 3D)"]
        GLOBE["3D Planetary Globe\n(Atmospheric entry, GPU spin, 3.8s fly-to)"]
        HUD["Mission Telemetry HUD\n(0-re-render direct DOM ref streaming)"]
        LABS["Virtual Agricultural Laboratories (Earth Trials)\n• Crop Battle • Climate Attack • Time Machine • Tribunal"]
        MASCOT["Interactive 3D Agronomist Mascot & Speech Cloud"]
        I18N["Multilingual Dialect Engine\n(العربية المغربية / Français / English / Español)"]
    end

    GEE --> API
    PWR --> API
    ESP --> API
    CACHE -. Offline Fallback .-> PROV
    API --> PROV --> FAO --> MASS --> MCDA
    MCDA --> ORCH
    ORCH --> AG_CLIM & AG_HYDRO & AG_AGRO & AG_SENSOR --> AG_GUARD
    AG_GUARD --> FrontendDeck
```

---

## 🏆 Evaluation Against the 5 NASA Judging Criteria

### 1. 🌟 Impact: Solves the Real-World Mediterranean Drought Crisis
> 📄 **Dedicated Evaluation Whitepaper:** [`docs/IMPACT.md`](docs/IMPACT.md)

* **The Critical Problem:** Across semi-arid agricultural basins such as Morocco’s Saïss Plateau (`33.89°N, -5.55°W`), traditional continuous cereal monocropping (Wheat $\rightarrow$ Wheat $\rightarrow$ Wheat) faces catastrophic collapse due to erratic rainfall and groundwater depletion. Generic LLM chatbots hallucinate misleading agricultural advice, while coarse satellites do not speak the farmer’s local dialect.
* **Quantifiable Outcomes:**
  * **Water Deficit Reduction:** Farmer's Eye proves through daily simulation that shifting to a 3-year triennial rotation (Durum Wheat $\rightarrow$ Food Legumes/Lentils $\rightarrow$ Drought-Tolerant Barley) reduces atmospheric evaporative water demand by **$93.4\text{ mm}$ ($934\text{ m}^3\text{/ha}$)** and reduces crop stress deficit by **$42.3\text{ mm}$ ($423\text{ m}^3\text{/ha}$)**.
  * **Fertilizer & Soil Health Savings:** Legume break crops fix an estimated **30–50 kg of biological nitrogen ($N_2$) per hectare**, breaking root pathogen (*Fusarium*) cycles and mitigating input costs.
  * **Actionable Farm Guidance:** Yields clear, risk-mitigated strategies delivered in Moroccan Darija (الدارجة المغربية الفلاحية) directly understood by rural smallholders.

### 2. 🎨 Creativity: The "Earth Trials" Virtual Laboratories & 3D Interactive Mascot
> 📄 **Dedicated Evaluation Whitepaper:** [`docs/CREATIVITY.md`](docs/CREATIVITY.md)

* **Interactive Scientific Gamification:** Instead of static charts, Farmer's Eye embeds the user into **4 Virtual Agricultural Laboratories**:
  1. ⚔️ **Crop Battle Lab:** Head-to-head competition comparing Monoculture Cereal vs. Resilient Triennale vs. Agroecological Conservation Cover.
  2. 🌪️ **Climate Attack Lab:** Interactive stress-testing applying real physical shocks: **Acute Drought (-35% rain)**, **Heatwave (+3.5°C & Chergui winds)**, and **Delayed Autumn Establishment Rains (-55% sowing rain)**.
  3. ⏳ **Farm Time Machine Lab:** Retrospective historical counterfactual simulation re-running rotations against authentic historical drought seasons (e.g., the severe 2022–2023 Moroccan drought).
  4. ⚖️ **AI Scientific Tribunal:** Multi-agent consensus debate where autonomous specialist agents challenge each other's conclusions in real-time.
* **3D Animated Agronomist Mascot:** Features a responsive 3D agronomist avatar and dynamic speech cloud, welcoming farmers and translating complex satellite radar metrics into engaging, accessible dialogues.

### 3. 🔬 Validity: Machine Mass Balance Conservation & Zero Hallucination
> 📄 **Dedicated Evaluation Whitepaper:** [`docs/VALIDITY.md`](docs/VALIDITY.md)

* **Zero Black-Box Math:** Artificial intelligence models (such as Google Gemini) **never compute numbers or simulate water budgets**. All water requirements, root-zone depletion curves, and stress indices run in deterministic Python functions based on peer-reviewed FAO-56 standards.
* **Strict Mass Balance Conservation:** Daily water fluxes are governed by:
  $$\Delta D_r = -(P_{inf} + Irr) + ET_a + DP$$
  Every simulation cycle checks the mathematical mass balance residual. Farmer's Eye achieves an unrounded machine residual of **$2.84 \times 10^{-14}\text{ mm}$** (sub-picometer scale), mathematically proving zero fluid loss or artificial creation.
* **Scientific Guardrail Sentinel:** An autonomous validation agent audits every claim. If unmetered groundwater savings are asserted, the sentinel automatically prepends explicit caveats: `"Simulated Irrigation Saving (Model Estimation - Unverified by On-Farm Metering)"`.

### 4. 🛰️ Relevance: Authentic NASA Earth Observation Data Pipeline
> 📄 **Dedicated Evaluation Whitepaper:** [`docs/RELEVANCE.md`](docs/RELEVANCE.md)

Farmer's Eye extracts, assimilates, and exposes primary NASA Earth Science data products:
* **NASA SMAP Level-4 Geophysical Data V8 (`NASA/SMAP/SPL4SMGP/008`):**
  * Assimilates 3-hourly $9\text{ km}$ EASE-Grid 2.0 surface soil moisture (`sm_surface`, 0–5 cm) and root-zone soil moisture (`sm_rootzone`, 0–100 cm).
  * Exposes vegetative biosphere metrics: Leaf Area Index (`leaf_area_index`), Vegetation Greenness Fraction (`vegetation_greenness_fraction`), and Soil Water Infiltration Flux (`soil_water_infiltration_flux`).
* **NASA POWER Daily Point Agroclimatology API (`/api/temporal/daily/point`):**
  * Direct ingestion of solar radiation (`ALLSKY_SFC_SW_DWN`), mean temperature (`T2M`), extreme temperatures (`T2M_MAX`, `T2M_MIN`), relative humidity (`RH2M`), and corrected precipitation (`PRECTOTCORR`).
* **NASA GPM IMERG V07 (`NASA/GPM_L3/IMERG_V07`):**
  * Calibrated satellite precipitation accumulation verifying seasonal rainfed thresholds.
* **Scientific Honesty on Spatial Resolution:** Regional 9 km satellite observations and 15 cm in-situ sensor telemetry are presented as complementary layers with distinct visual provenance—never claiming fake downscaling.

### 5. 🖥️ Presentation: Mission Control Ergonomics & Native Quad-Language i18n
> 📄 **Dedicated Evaluation Whitepaper:** [`docs/PRESENTATION.md`](docs/PRESENTATION.md)
* **Planetary Mission Control Interface:** Built with React 19, Tailwind CSS v4, and MapLibre GL 6. Features GPU-accelerated globe rotation, raycasted cursor behavior (arrow in deep space, grab hand over Earth), and a 3.8-second parabolic camera descent.
* **Lag-Free Mission HUD:** Telemetry coordinates and orbital altitudes update directly via DOM references, achieving zero React component re-renders during high-speed camera flights.
* **Comprehensive Localization (i18n):** Native, instant toggle across 4 complete languages with right-to-left (RTL) typographic safeguards:
  * 🇲🇦 **الدارجة المغربية الفلاحية (Moroccan Darija)**
  * 🇫🇷 **Français Agronomique**
  * 🇬🇧 **English (Scientific)**
  * 🇪🇸 **Español**

---

## 🛠️ The In-Situ Hardware Pipeline: ESP32 "Farmer's Eye"

Farmer's Eye incorporates physical on-farm ground truth via the ESP32 Soil Probe Telemetry client:
* **Hardware Profile:** ESP-WROOM-32 micro-controller paired with a Capacitive Soil Moisture Sensor v1.2 inserted at root seedbed depth ($15\text{ cm}$).
* **Analog Acquisition:** Reads on low-noise ADC channel **GPIO34** ($0–4095$ raw 12-bit range).
* **Calibrated Volumetric Conversion:** Raw analog readings are converted via a piecewise linear calibration curve:
  $$\text{VWC} = \min\left(\theta_{fc}, \max\left(0.0, \frac{\text{ADC}_{dry} - \text{ADC}_{raw}}{\text{ADC}_{dry} - \text{ADC}_{wet}} \times (\theta_{fc} - \theta_{wp}) + \theta_{wp}\right)\right)$$
* **API Ingestion Contract:** Telemetry posts directly to `POST /api/v1/sensors/readings` with device authentication and hardware health telemetry (battery voltage, sensor temperature).

```json
{
  "device_id": "esp32-saiss-probe-01",
  "farm_id": "farm-saiss-meknes",
  "latitude": 33.8938,
  "longitude": -5.5516,
  "timestamp_utc": "2026-11-15T10:45:00Z",
  "sensor_model": "Capacitive_v1.2",
  "depth_cm": 15.0,
  "raw_adc": 2420,
  "calibration_status": "calibrated",
  "soil_moisture_vwc": 0.248,
  "soil_temperature_c": 18.4,
  "battery_voltage": 3.28
}
```

---

## 🚀 Quickstart Guide (In 60 Seconds)

### Prerequisites
* **Python 3.10+** (with `pip` or `poetry`)
* **Node.js 18+** & `npm`

### 1. Clone the Repository
```bash
git clone https://github.com/your-username/farmers-eye.git
cd farmers-eye
```

### 2. Configure Environment
```bash
cp backend/.env.example backend/.env
# Optional: Add your Google Gemini API Key for live AI tribunal deliberations
```

### 3. Launch the Backend (FastAPI)
```bash
cd backend
python -m venv .venv && source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```
*API docs available at:* `http://127.0.0.1:8000/docs`

### 4. Launch the Frontend (React 19 + Vite)
In a new terminal:
```bash
cd frontend
npm install
npm run dev
```
*Application available at:* `http://localhost:5173`

---

## 🎤 30-Second Elevator Pitch & Video Demo Script

* **0:00 – 0:15 [The Hook & Crisis]:**  
  *(Camera cuts to arid fields in Morocco's Saïss Plain)*  
  *"Across semi-arid agricultural basins, climate change is destroying traditional mono-cropping. Farmers continuously plant wheat, depleting soil moisture until consecutive droughts wipe out their livelihoods. But generic AI chatbots hallucinate agricultural advice, while regional satellites are too coarse for farm-level decisions."*

* **0:15 – 0:45 [The Solution & Innovation]:**  
  *(Screen shares Farmer's Eye 3D Globe flying to Meknès; HUD locks coordinates)*  
  *"Meet Farmer's Eye. We bridge this divide by fusing NASA SMAP 9-kilometer radar soil moisture, NASA POWER daily climate observations, and local ESP32 capacitive soil probes into a zero-hallucination FAO-56 digital twin."*

* **0:45 – 1:15 [The Live Earth Trials]:**  
  *(Demonstrates Crop Battle Lab and pushes Climate Attack slider to -35% Drought)*  
  *"In our Virtual Agricultural Laboratory, farmers test rotations before sowing. Watch what happens under a 35% drought shock: continuous wheat suffers severe stress, while our triennial legume-barley rotation cuts water demand by 93 millimeters and nitrogen-fertilizes the soil—verified by sub-picometer mass conservation."*

* **1:15 – 1:30 [The Closing Impact]:**  
  *(AI Tribunal debates in Moroccan Darija with 3D mascot speech cloud)*  
  *"Our multi-agent tribunal delivers clear, defensible counsel in authentic Moroccan Darija. Farmer's Eye empowers smallholders to adapt with science, preserve groundwater, and thrive in an unpredictable climate."*

---

## 👥 Farmer's Eye Engineering Team

* **Marwane FARIDI** — Lead Backend Architect, Agronomic Engine & Multi-Agent DAG Developer
* **Zoubaa** — Lead Frontend Architect, 3D MapLibre Globe & UI/UX Systems Engineer

---

## 📜 Academic References & Citations

1. **Allen, R. G., Pereira, L. S., Raes, D., & Smith, M. (1998).** *Crop evapotranspiration - Guidelines for computing crop water requirements.* FAO Irrigation and drainage paper 56. Food and Agriculture Organization of the United Nations, Rome.
2. **Reichle, R., et al. (2022).** *SMAP L4 Global 3-hourly 9 km EASE-Grid Surface and Root Zone Volumetric Soil Moisture (SPL4SMGP), Version 8.* NASA National Snow and Ice Data Center Distributed Active Archive Center (NSIDC DAAC).
3. **NASA Langley Research Center.** *NASA Prediction Of Worldwide Energy Resources (POWER) Project.* Daily Point Agroclimatology Methodology (AG Community, Version 2.0).

---

<div align="center">
  <sub>Developed with passion for the <strong>2026 NASA Space Apps Challenge</strong>. Dedicated to the resilience of dryland farmers worldwide.</sub>
</div>
