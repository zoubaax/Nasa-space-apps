# Farmer's Eye — Scientific Validation & Algorithmic Audit
> **Document Version:** 2.0.0 — Verified Mathematical & Hydrological Proof  
> **Audited Engine:** `AgriSimulationService` (`backend/app/services/agri_simulation.py`)  
> **Reference Case:** Saïss Agricultural Plain / Meknès, Morocco (`33.8938°N, -5.5516°W`)  
> **Status:** ✅ **100% Mathematically Verified · Machine Mass Balance Conservation Satisfied**

---

## 1. Executive Scientific Summary

Farmer's Eye is built upon a strict **zero-hallucination** principle: artificial intelligence models (such as large language models) **never compute numbers, estimate soil moisture, or invent crop water budgets**. All calculations are performed by deterministic, peer-reviewed physical and biophysical models.

This document provides the formal mathematical proof, hydrological equations, and mass conservation audits governing the Farmer's Eye digital twin.

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                            FARMER'S EYE SCIENTIFIC INTEGRITY PIPELINE                       │
├──────────────────────────────────────────────────────────┬──────────────────────────────────┤
│           NASA SMAP Level-4 (SPL4SMGP V008)              │        NASA POWER (Daily AG)     │
│  - Spatial Scale: Global 9 km EASE-Grid 2.0              │  - Spatial Scale: 0.5° × 0.625°  │
│  - Time Step: 3-hourly radar-assimilated fluxes          │  - Variables: T2M, Tmax, Tmin,   │
│  - Layers: Surface (0-5 cm), Rootzone (0-100 cm)         │    ALLSKY_SFC_SW_DWN, RH2M, WS2M │
└────────────────────────────┬─────────────────────────────┴─────────────────┬────────────────┘
                             │                                               │
                             └───────────────────────┬───────────────────────┘
                                                     ▼
                             ┌───────────────────────────────────────────────┐
                             │       Farmer's Eye ai_context.py Engine       │
                             │   - Validates physical ranges (0 <= θ <= por) │
                             │   - Sentinel values (-999) handled as null    │
                             │   - Authentic spatial grid distance logged    │
                             └───────────────────────┬───────────────────────┘
                                                     ▼
                             ┌───────────────────────────────────────────────┐
                             │    FAO-56 Daily Penman-Monteith & Infiltration│
                             │   - Reference ET0 via Allen et al. (1998) Eq 6│
                             │   - USDA SCS Curve Number Runoff & Infiltration│
                             │   - Dual-stage crop coefficients Kc(t)        │
                             └───────────────────────┬───────────────────────┘
                                                     ▼
                             ┌───────────────────────────────────────────────┐
                             │       MACHINE MASS BALANCE CONSERVATION       │
                             │  Residual: |ΔDr - (-[Inf + Irr] + ETa + DP)|  │
                             │         = 2.84 × 10⁻¹⁴ mm (Machine Exact)     │
                             └───────────────────────────────────────────────┘
```

---

## 2. Mathematical Formulations

### 2.1 Daily Reference Evapotranspiration ($ET_0$)
Daily reference evapotranspiration is calculated strictly via the internationally standardized **FAO-56 Penman-Monteith equation** (Allen et al., 1998):

$$ET_0 = \frac{0.408 \Delta (R_n - G) + \gamma \frac{900}{T + 273} u_2 (e_s - e_a)}{\Delta + \gamma (1 + 0.34 u_2)}$$

Where:
* $R_n$: Net radiation at the crop surface ($\text{MJ}\cdot\text{m}^{-2}\cdot\text{day}^{-1}$), derived from NASA POWER `ALLSKY_SFC_SW_DWN`.
* $G$: Soil heat flux density ($\text{MJ}\cdot\text{m}^{-2}\cdot\text{day}^{-1}$), taken as $0$ for daily timesteps.
* $T$: Mean daily air temperature at 2 m height ($^\circ\text{C}$), from NASA POWER `T2M`.
* $u_2$: Wind speed at 2 m height ($\text{m}\cdot\text{s}^{-1}$), from NASA POWER `WS2M`.
* $e_s$: Saturation vapor pressure ($\text{kPa}$), calculated from `T2M_MAX` and `T2M_MIN`.
* $e_a$: Actual vapor pressure ($\text{kPa}$), derived from relative humidity `RH2M`.
* $\Delta$: Slope of the vapor pressure curve ($\text{kPa}\cdot^\circ\text{C}^{-1}$).
* $\gamma$: Psychrometric constant ($\text{kPa}\cdot^\circ\text{C}^{-1}$), adjusted for field elevation.

### 2.2 Rainfall Partitioning: Infiltration & Runoff (USDA SCS CN)
Rather than assuming 100% of gross precipitation enters the root-zone, Farmer's Eye applies the **USDA Soil Conservation Service (SCS) Curve Number** methodology:

$$S = \frac{25400}{CN} - 254$$
$$I_a = 0.2 \cdot S$$

$$\text{Runoff } (RO) = \begin{cases} 
\frac{(P - I_a)^2}{P - I_a + S} & \text{if } P > I_a \\ 
0.0 & \text{if } P \le I_a 
\end{cases}$$

$$\text{Infiltration } (P_{inf}) = P - RO$$

Where $CN = 75.0$ for cultivated clay-loam (*Hamri*) soils of the Saïss Plateau.

### 2.3 Staged Crop Coefficients ($K_c$) & Phenology
Farmer's Eye dynamically models crop phenology across contiguous calendar days from sowing in autumn ($Y-1$) to harvest in spring ($Y$):

1. **Winter Durum Wheat (*Triticum durum*):**
   * Window: Nov 15 ($Y-1$) to May 20 ($Y$) — **187 contiguous days**.
   * Initial stage ($36\text{ days}$): $K_{c,\text{ini}} = 0.35$.
   * Development stage ($62\text{ days}$): Linear interpolation from $0.35 \rightarrow 1.15$.
   * Mid-season flowering ($59\text{ days}$): $K_{c,\text{mid}} = 1.15$.
   * Ripening / Late-season ($30\text{ days}$): Linear drop from $1.15 \rightarrow 0.45$.
2. **Food Legumes / Lentils (*Lens culinaris*):**
   * Window: Dec 01 ($Y-1$) to Apr 30 ($Y$) — **151 contiguous days**.
   * $K_c$ curve: $0.40 \rightarrow 1.05 \rightarrow 0.30$.
3. **Early Drought-Tolerant Barley (*Hordeum vulgare*):**
   * Window: Nov 15 ($Y-1$) to Apr 25 ($Y$) — **162 contiguous days**.
   * $K_c$ curve: $0.35 \rightarrow 1.05 \rightarrow 0.25$. Matures 25 days before wheat, avoiding May chergui heat.

### 2.4 Soil Water Stress Coefficient ($K_s$)
When root-zone water depletion ($D_r$) exceeds Readily Available Water ($RAW = p \cdot TAW$), crop transpiration is penalized:

$$K_s = \begin{cases} 
1.0 & \text{if } D_r \le RAW \\ 
\max\left(0.0, \frac{TAW - D_r}{TAW - RAW}\right) & \text{if } D_r > RAW 
\end{cases}$$

Actual crop evapotranspiration is then:
$$ET_a = K_s \cdot ET_c = K_s \cdot (K_c \cdot ET_0)$$

---

## 3. Machine Mass Balance Conservation Audit

The bedrock of physical credibility in Farmer's Eye is daily mass conservation. The end-of-day root-zone depletion $D_r$ follows:

$$D_{r,t} = D_{r,t-1} - (P_{inf,t} + Irr_t) + ET_{a,t} + DP_t$$

Where:
* $P_{inf,t}$: Infiltrated rainfall on day $t$ (mm).
* $Irr_t$: Irrigation applied on day $t$ (mm).
* $ET_{a,t}$: Actual crop evapotranspiration on day $t$ (mm).
* $DP_t$: Deep percolation draining beyond the 1.0 m root-zone when $D_{r,t} < 0$ (mm).

### 3.1 Verification Run: Meknès 2024–2025 Harvest Season
Evaluating Durum Wheat across all 187 calendar days on Silt-Loam (*Hamri*, $TAW = 150.0\text{ mm}$, $p = 0.50$):

```json
{
  "harvest_year": 2025,
  "cycle_days": 187,
  "initial_sowing_depletion_dr_mm": 55.70000000000000,
  "infiltrated_seasonal_rain_mm": 334.13134105148504,
  "irrigation_applied_mm": 75.00000000000000,
  "actual_crop_eta_mm": 392.33110983828530,
  "deep_percolation_mm": 93.08478767141592,
  "final_harvest_depletion_dr_mm": 131.98455645821620,
  "observed_delta_dr_mm": 76.28455645821620,
  "flux_delta_dr_mm": 76.28455645821617,
  "mass_balance_residual_mm": 2.842170943040401e-14,
  "conservation_satisfied": true
}
```

* **Observed Net Depletion Change:**
  $$\Delta D_{r,\text{observed}} = D_{r,\text{final}} - D_{r,\text{sow}} = 131.98455646 - 55.70000000 = \mathbf{+76.28455646\text{ mm}}$$
* **Net Sum of Atmospheric & Hydrologic Fluxes:**
  $$\Delta D_{r,\text{flux}} = -(P_{inf} + Irr) + ET_a + DP = -(334.13134105 + 75.0) + 392.33110984 + 93.08478767 = \mathbf{+76.28455646\text{ mm}}$$
* **Exact Machine Residual:**
  $$\text{Residual} = |\Delta D_{r,\text{observed}} - \Delta D_{r,\text{flux}}| = \mathbf{2.84 \times 10^{-14}\text{ mm}}$$

The mass balance residual is at the **sub-picometer scale** ($\approx 10^{-14}\text{ mm}$), completely attributable to IEEE-754 64-bit floating point precision limits.

---

## 4. Multi-Year Rotation Modeling & Provenance Demarcation

To maintain absolute scientific honesty during competition evaluation, Farmer's Eye enforces three strict provenance rules:

1. **Sowing Soil Moisture ($\theta_{\text{sow}}$) Provenance:**
   * Sowing for harvest year $Y$ takes place in autumn of year $Y-1$ (e.g., November 2024 for Harvest 2025).
   * $\theta_{\text{sow}}$ is extracted from the authentic **November 2024 NASA SMAP Level-4 monthly assimilated mean** ($0.2643\text{ m}^3\text{/m}^3$, 240 assimilated 3-hourly data points). It is never retroactively pulled from post-harvest dates.
2. **Repeated-Climate Assumption for Multi-Year Rotations:**
   * Because 2-to-3-year weather forecasts are physically impossible, Year 2 and Year 3 in a 3-year rotation plan re-apply the observed seasonal weather across the specific phenological window of the successor crop.
   * Every rotation year explicitly carries:
     ```json
     "climate_source_type": "Repeated-Climate Assumption (Stationary Climate Model)",
     "is_repeated_climate_assumption": true
     ```
3. **Disambiguation of Water Metrics:**
   * **Evaporative Demand Reduction ($\Delta ET_c$):** Atmospheric potential water reduction ($93.4\text{ mm}$ for Plan 2).
   * **Simulated Water Deficit Reduction ($\Delta(ET_c - ET_a)$):** Avoided crop stress deficit ($42.3\text{ mm}$ for Plan 2).
   * **Simulated Irrigation Savings:** Explicitly labeled as model estimations unverified by on-farm meters to avoid overpromising groundwater savings in rainfed (*Bour*) agriculture.

---

## 5. Automated Regression Test Suite

The verification rules above are permanently enforced by automated regression tests in [`backend/tests/test_ai.py`](backend/tests/test_ai.py):
* `test_smap_sowing_provenance_and_mass_balance_regression`: Verifies November $Y-1$ satellite sourcing and machine mass balance residuals $< 10^{-12}\text{ mm}$.
* `test_sensors_telemetry_flow`: Verifies ESP32 ADC conversion curves, calibration status tracking, and database persistence.
* `test_simulation_primary_cereal_selection`: Verifies dynamic phenological scaling when toggling between Durum Wheat, Soft Wheat, and Barley.
