# EARTH TRIALS — Final Scientific Provenance & Labeling Verification Report
**FieldShift AI Virtual Agricultural Laboratories**

**Date:** November 14, 2026  
**Audited Service:** `AgriSimulationService` (`nasa-power-service/app/services/agri_simulation.py`)  
**AI Intelligence Layer:** FieldShift AI Engine  
**Reference Case:** Meknès 2025 (Saïss Plateau, `33.8938°N, -5.5516°W`) & Meknès 2023 Counterfactual  
**Verification Status:** ✅ **Authentic Sowing Provenance · Explicit Climate Alignment · Machine Mass Conservation**

---

## 1. Provenance Audit of Sowing Soil Moisture ($\theta_{sow}$)

### 1.1 Detected Discrepancy & Root Cause
- **Suspicious Prior Value:** $\theta_{sow} = 0.2362\text{ m}^3\text{/m}^3$.
- **Investigation:** Slicing the 2025 SMAP Level-4 monthly evolution table revealed that `0.2362` corresponded to **November 2025**. Because the 2025 harvest occurred on **May 20, 2025**, November 2025 took place **6 months after harvest**.
- **Agronomic Ground Truth:** Sowing for Harvest Year 2025 took place in autumn of calendar year $Y-1$, specifically **November 15, 2024**.

### 1.2 Authentic GEE Satellite Sourcing
- Extracted authentic NASA SMAP Level-4 SPL4SMGP V008 observations for Meknès (`33.8900°N, -5.5500°W`) across calendar year 2024 via Google Earth Engine (`fieldshift-514709`).
- **Cache File:** `nasa-power-service/data/smap_gee/smap_gee_33.8900_-5.5500_20240101_20241231_agricultural_02b0d31445c870ea.json` (2,928 3-hourly observations assimilated).
- **Verified Sowing Soil Moisture:** **$\theta_{sow} = 0.2643\text{ m}^3\text{/m}^3$** (monthly spatial/temporal mean across November 2024, 240 3-hourly assimilated data points).
- **October 2024 Pre-Sowing Baseline:** $0.2439\text{ m}^3\text{/m}^3$ (248 3-hourly data points).

### 1.3 Recalculated Physical Soil Water Storage
On *Hamri* Silt-Loam ($TAW = 150.0\text{ mm}$, $\theta_{fc} = 0.320$, $\theta_{wp} = 0.170$, $Z_r = 1.0\text{ m}$, $p = 0.50$, $RAW = 75.0\text{ mm}$):
- **Stored Soil Water at Sowing:**
  $$W_{stored,sow} = 1000 \times (\theta_{sow} - \theta_{wp}) \times Z_r = 1000 \times (0.2643 - 0.1700) \times 1.0 = \mathbf{94.3\text{ mm}}$$
- **Initial Root-Zone Depletion at Sowing:**
  $$D_{r,sow} = TAW - W_{stored,sow} = 150.0 - 94.3 = \mathbf{55.7\text{ mm}}$$
- **Water Remaining Before Stress:**
  $$\max(0, RAW - D_{r,sow}) = \max(0, 75.0 - 55.7) = \mathbf{19.3\text{ mm}}$$
- **Total Physical Water Budget:**
  $$W_{budget} = P_{inf} + Irr + W_{stored,sow} = 334.1 + 75.0 + 94.3 = \mathbf{503.4\text{ mm}}$$

---

## 2. Multi-Year Rotation Climate Modeling & Labeling

Every year of each 3-year rotation plan now carries an explicit `climate_source_type` and `is_repeated_climate_assumption` flag to eliminate ambiguous multi-year forecasting claims:

| Plan | Year Index | Crop | Phenological Window | Climate Source Type | Repeated Assumption |
| :--- | :---: | :--- | :--- | :--- | :---: |
| **Plan 1 (Monoculture)** | 1 | Wheat (Blé) | 2024-11-15 to 2025-05-20 (187d) | **Independently Observed Harvest Season** | `False` |
| | 2 | Wheat (Blé) | 2024-11-15 to 2025-05-20 (187d) | **Repeated-Climate Assumption (Stationary)** | `True` |
| | 3 | Wheat (Blé) | 2024-11-15 to 2025-05-20 (187d) | **Repeated-Climate Assumption (Stationary)** | `True` |
| **Plan 2 (Triennale)** | 1 | Wheat (Blé) | 2024-11-15 to 2025-05-20 (187d) | **Independently Observed Harvest Season** | `False` |
| | 2 | Lentils (القطاني) | 2024-12-01 to 2025-04-30 (151d) | **Repeated-Climate Assumption (Stationary)** | `True` |
| | 3 | Barley (الشعير) | 2024-11-15 to 2025-04-25 (162d) | **Repeated-Climate Assumption (Stationary)** | `True` |
| **Plan 3 (Agroécologie)** | 1 | Wheat (Blé) | 2024-11-15 to 2025-05-20 (187d) | **Independently Observed Harvest Season** | `False` |
| | 2 | Forage (علف) | 2024-12-01 to 2025-03-20 (110d) | **Repeated-Climate Assumption (Stationary)** | `True` |
| | 3 | Active Fallow | 2025-03-01 to 2025-05-29 (90d) | **Repeated-Climate Assumption (Stationary)** | `True` |

---

## 3. Disambiguation & Relabeling of Irrigation Reductions

All metrics previously referred to as "irrigation savings" or "actual pumping savings" are strictly demarcated:
1. **Evaporative Demand Reduction ($\Delta ET_c$):** Reduced atmospheric potential transpiration ($93.4\text{ mm}$ / $934\text{ m}^3\text{/ha}$ for Plan 2).
2. **Simulated Water Deficit Reduction ($\Delta(ET_c - ET_a)$):** Avoided crop stress deficit ($42.3\text{ mm}$ / $423\text{ m}^3\text{/ha}$ for Plan 2).
3. **Simulated Irrigation Saving:**
   - Field: `simulated_irrigation_savings_mm`
   - Label: `"Simulated Irrigation Saving (Model Estimation - Unverified by On-Farm Metering)"`
   - Explicitly labeled in the UI as: `"تقليص سقي محاكى (تقدير رقمي غير معاير بعدادات ضخ ميدانية)"` to prevent misrepresentation as measured flowmeter telemetry.

---

## 4. Unrounded Daily Mass Balance Conservation Verification

The simulation exposes raw, unrounded IEEE-754 floating point numbers for daily mass balance verification:

```json
{
  "initial_depletion_dr_mm": 55.7,
  "infiltrated_rain_mm": 334.13134105148504,
  "irrigation_applied_mm": 75.0,
  "actual_eta_mm": 392.3311098382853,
  "deep_percolation_mm": 93.08478767141592,
  "final_depletion_dr_mm": 131.9845564582162,
  "observed_delta_dr_mm": 76.28455645821619,
  "flux_delta_dr_mm": 76.28455645821616,
  "mass_balance_residual_mm": 2.842170943040401e-14,
  "conservation_satisfied": true
}
```

- **Observed Root-Zone Depletion Change:** $\Delta D_{r,observed} = D_{r,final} - D_{r,sow} = 131.98455646 - 55.70000000 = \mathbf{+76.28455646\text{ mm}}$.
- **Sum of Modeled Daily Mass Fluxes:** $-(P_{inf} + Irr) + ET_a + DP = -(334.13134105 + 75.0) + 392.33110984 + 93.08478767 = \mathbf{+76.28455646\text{ mm}}$.
- **Exact Machine Residual:** **$2.84 \times 10^{-14}\text{ mm}$** (sub-picometer scale, exactly satisfying physical mass conservation).

---

## 5. Verification & Test Suite Summary

- **Pytest Suite:** 50 passed, 3 skipped (live NASA API calls disabled in sandbox), **0 failures**.
- **Dedicated Regression Test:** `test_smap_sowing_provenance_and_mass_balance_regression` in `tests/test_ai.py` permanently validates:
  1. November 2024 SMAP L4 sourcing ($0.2643\text{ m}^3\text{/m}^3$, 240 obs).
  2. $W_{stored,sow} = 94.3\text{ mm}$, $D_{r,sow} = 55.7\text{ mm}$, $W_{before\_stress} = 19.3\text{ mm}$, $W_{budget} = 503.4\text{ mm}$.
  3. Machine mass residual $< 10^{-12}\text{ mm}$.
  4. Climate source type tags across all rotation plans.
  5. Relabeled simulated irrigation savings.
