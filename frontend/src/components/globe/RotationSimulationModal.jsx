import React, { useState, useEffect } from 'react';
import {
  X,
  Award,
  Droplets,
  TrendingDown,
  ShieldCheck,
  AlertTriangle,
  Scale,
  Flame,
  CloudOff,
  Clock,
  RefreshCw,
  Check,
  Info,
  Cpu,
} from 'lucide-react';
import { useTranslation } from '../../context/LanguageContext';

function resolveCropName(crop, t) {
  if (!crop) return '';
  const raw = String(crop).trim();

  // Strip year references like "(سنة 1)", "(Year 1)", "(an 1)" so pills display cleanly with sequence numbers
  const clean = raw.replace(/\s*\((?:سنة|year|an|\d)\s*\d*\)\s*/gi, '').trim();

  // If the crop is already a natural localized description from AI (e.g. contains Arabic script or custom terroir phrasing)
  // preserve it verbatim so we don't overwrite Gemini's nuanced agronomic predictions!
  if (/[\u0600-\u06FF]/.test(clean)) {
    return clean;
  }

  // Direct slug lookup if it's a raw technical slug (e.g. ble_dur, orge, jachere)
  const slug = clean.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  if (slug && t(`crops.${slug}`) && t(`crops.${slug}`) !== `crops.${slug}`) {
    return t(`crops.${slug}`);
  }

  return clean;
}

export default function RotationSimulationModal({
  isOpen,
  onClose,
  locationData,
  simulationData,
  selectedYear = 2025,
  isLoading,
  error,
  onReSimulate,
}) {
  const { t, language, isRtl } = useTranslation();

  const [activeSoilType, setActiveSoilType] = useState('limoneux_profond');
  const [activeWaterAccess, setActiveWaterAccess] = useState('appoint');
  const [activeShock, setActiveShock] = useState('none');
  const [activeYear, setActiveYear] = useState(selectedYear || 2025);
  const [activePrimaryCereal, setActivePrimaryCereal] = useState('ble_dur');
  const [selectedPlanId, setSelectedPlanId] = useState(null);

  const plans = simulationData?.plans || [];
  const winnerId = simulationData?.winner_plan_id || plans[0]?.id;
  const currentSelectedPlan =
    plans.find((p) => p.id === (selectedPlanId || winnerId)) || plans[0];
  const baseline = simulationData?.baseline_metrics || {};
  const tribunal = simulationData?.tribunal_verdicts || [];

  useEffect(() => {
    if (selectedYear) {
      setActiveYear(selectedYear);
    }
  }, [selectedYear]);

  // Sync active controls directly with simulation results when loaded
  useEffect(() => {
    if (simulationData?.soil_type) {
      setActiveSoilType(simulationData.soil_type);
    }
    if (simulationData?.water_access) {
      setActiveWaterAccess(simulationData.water_access);
    }
    if (simulationData?.shock_applied) {
      setActiveShock(simulationData.shock_applied);
    }
    if (simulationData?.baseline_metrics?.primary_cereal) {
      setActivePrimaryCereal(simulationData.baseline_metrics.primary_cereal);
    }
  }, [simulationData]);

  // Dynamically auto-detect Soil texture, Water access, and Crop focus from real NASA observations
  useEffect(() => {
    if (!isOpen) return;

    const rain = baseline?.annual_precipitation_mm;
    const smap = baseline?.sowing_period_moisture_m3m3;
    const countryCode = (locationData?.country_code || '').toLowerCase();

    if (rain !== undefined) {
      if (rain < 150 || (smap !== undefined && smap < 0.14)) {
        setActiveSoilType('sableux');
      } else if (rain > 650) {
        setActiveSoilType('argilo_limoneux');
      } else if (rain > 450) {
        setActiveSoilType('limoneux_profond');
      } else {
        setActiveSoilType('argilo_limoneux');
      }

      if (rain < 120) {
        setActiveWaterAccess('irrigue');
      } else if (rain > 450) {
        setActiveWaterAccess('bour');
      } else {
        setActiveWaterAccess('appoint');
      }

      if (rain < 160) {
        setActivePrimaryCereal('orge');
      } else if (countryCode === 'us' || countryCode === 'ca' || countryCode === 'br' || countryCode === 'ar') {
        setActivePrimaryCereal('mais');
      } else if (countryCode === 'fr' || countryCode === 'de' || countryCode === 'gb' || countryCode === 'pl' || countryCode === 'ua') {
        setActivePrimaryCereal('ble_tendre');
      } else if (countryCode === 'es' || countryCode === 'ma' || countryCode === 'dz' || countryCode === 'tn' || countryCode === 'it' || countryCode === 'eg') {
        setActivePrimaryCereal('ble_dur');
      }
    }
  }, [isOpen, baseline?.annual_precipitation_mm, baseline?.sowing_period_moisture_m3m3, locationData?.country_code]);

  if (!isOpen) return null;

  const handleConfigChange = (
    newSoil = activeSoilType,
    newWater = activeWaterAccess,
    newShock = activeShock,
    newYear = activeYear,
    newCereal = activePrimaryCereal
  ) => {
    setActiveSoilType(newSoil);
    setActiveWaterAccess(newWater);
    setActiveShock(newShock);
    setActiveYear(newYear);
    setActivePrimaryCereal(newCereal);
    if (onReSimulate) {
      onReSimulate({
        soilType: newSoil,
        waterAccess: newWater,
        climateShock: newShock,
        year: newYear,
        primaryCereal: newCereal,
        language: language,
      });
    }
  };

  const getStanceBadge = (stance) => {
    switch (stance) {
      case 'favorable':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
            <Check className="w-3 h-3 text-emerald-700" /> {t('simulation.favorable', {}, 'Favorable')}
          </span>
        );
      case 'reserve':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-amber-700" /> {t('simulation.reserved', {}, 'Réservé')}
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300">
            {t('simulation.unfavorable', {}, 'Défavorable')}
          </span>
        );
    }
  };

  // Format exact scientific residual (< 10^-12 mm)
  const residualValue =
    baseline.fao56_daily_water_balance?.unrounded_daily_mass_balance?.mass_balance_residual_mm;
  const formattedResidual =
    typeof residualValue === 'number'
      ? `${residualValue.toExponential(3)} mm`
      : '< 10⁻¹² mm';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-xl animate-fade-in font-body text-slate-800"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <div className="relative w-full max-w-6xl max-h-[92vh] flex flex-col rounded-2xl bg-white/98 border border-slate-200/90 shadow-[0_25px_80px_-15px_rgba(15,23,42,0.3)] text-slate-800 overflow-hidden">
        
        {/* Subtle Brand Accent Line */}
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 pointer-events-none" />

        {/* ── Modal Header ── */}
        <div className="relative px-6 py-4 border-b border-slate-200 bg-slate-50/60 flex flex-wrap items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-100 border border-cyan-200 text-cyan-700 shrink-0">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="font-display text-lg sm:text-xl font-bold text-slate-900 leading-snug">
                  {t('simulation.modalTitle', {}, 'Farmer Eye · Virtual Agricultural Laboratory')}
                </h1>
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-cyan-100 text-cyan-800 border border-cyan-200">
                  {t('simulation.engineBadge', {}, 'FAO-56 Dual Crop Engine')}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                {locationData?.name || t('telemetry.fieldLocked', {}, 'Selected Field')} • [
                {locationData?.lat?.toFixed(3)}°N, {locationData?.lng?.toFixed(3)}°E] • NASA
                Harvest Season {baseline.harvest_year ? `${baseline.harvest_year - 1}–${baseline.harvest_year}` : `${activeYear - 1}–${activeYear}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleConfigChange(activeSoilType, activeWaterAccess, activeShock, activeYear, activePrimaryCereal)}
              disabled={isLoading}
              type="button"
              className="px-3.5 py-1.5 rounded-xl bg-cyan-50 hover:bg-cyan-100 border border-cyan-300 text-xs font-semibold text-cyan-800 flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 shadow-xs"
              title={t('simulation.reRunBtn', {}, 'Re-run Simulation')}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>{isLoading ? t('simulation.computing', {}, 'Computing…') : t('simulation.reRunBtn', {}, 'Re-Run')}</span>
            </button>
            <button
              onClick={onClose}
              type="button"
              className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition cursor-pointer border border-slate-200"
              title={t('common.close', {}, 'Close modal')}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Interactive Scenario Controls Strip ── */}
        <div className="px-6 py-2.5 border-b border-slate-200 bg-slate-50/40 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
          <div className="flex flex-wrap items-center gap-4">
            {/* Harvest Season Year */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-slate-600">{t('simulation.harvestYear', {}, 'Harvest:')}</span>
              <select
                value={activeYear}
                onChange={(e) =>
                  handleConfigChange(activeSoilType, activeWaterAccess, activeShock, parseInt(e.target.value, 10), activePrimaryCereal)
                }
                disabled={isLoading}
                className="bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs text-slate-800 font-medium focus:border-cyan-500 outline-none shadow-xs"
              >
                {[2025, 2024, 2023, 2022, 2021].map((yr) => (
                  <option key={yr} value={yr}>
                    {yr} ({yr - 1}–{yr})
                  </option>
                ))}
              </select>
            </div>

            {/* Primary Cereal */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-slate-600">{t('simulation.primaryCerealLabel', {}, 'Crop Focus:')}</span>
              <select
                value={activePrimaryCereal}
                onChange={(e) =>
                  handleConfigChange(activeSoilType, activeWaterAccess, activeShock, activeYear, e.target.value)
                }
                disabled={isLoading}
                className="bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs text-slate-800 font-medium focus:border-cyan-500 outline-none shadow-xs"
              >
                <option value="ble_dur">{t('options.cereals.ble_dur', {}, 'Durum Wheat')}</option>
                <option value="ble_tendre">{t('options.cereals.ble_tendre', {}, 'Bread Wheat')}</option>
                <option value="orge">{t('options.cereals.orge', {}, 'Barley')}</option>
                <option value="mais">{t('options.cereals.mais', {}, 'Corn / Maize')}</option>
                <option value="tournesol">{t('options.cereals.tournesol', {}, 'Sunflower')}</option>
                <option value="soja">{t('options.cereals.soja', {}, 'Soybean')}</option>
                <option value="colza">{t('options.cereals.colza', {}, 'Canola / Rapeseed')}</option>
                <option value="avoine">{t('options.cereals.avoine', {}, 'Oats')}</option>
              </select>
            </div>

            {/* Soil Type */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-slate-600">{t('simulation.soilTypeLabel', {}, 'Soil:')}</span>
              <select
                value={activeSoilType}
                onChange={(e) =>
                  handleConfigChange(e.target.value, activeWaterAccess, activeShock, activeYear, activePrimaryCereal)
                }
                disabled={isLoading}
                className="bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs text-slate-800 font-medium focus:border-cyan-500 outline-none shadow-xs"
              >
                <option value="limoneux_profond">{t('options.soil.limoneux_profond', {}, 'Deep Fertile Loam')}</option>
                <option value="argilo_limoneux">{t('options.soil.argilo_limoneux', {}, 'Clay Loam')}</option>
                <option value="sablonneux">{t('options.soil.sablonneux', {}, 'Sandy Loam')}</option>
                <option value="argileux_lourd">{t('options.soil.argileux_lourd', {}, 'Heavy Clay')}</option>
                <option value="sableux">{t('options.soil.sableux', {}, 'Sandy Soil')}</option>
                <option value="calcaire">{t('options.soil.calcaire', {}, 'Calcareous Soil')}</option>
              </select>
            </div>

            {/* Water Access */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-slate-600">{t('simulation.waterAccessLabel', {}, 'Water:')}</span>
              <select
                value={activeWaterAccess}
                onChange={(e) =>
                  handleConfigChange(activeSoilType, e.target.value, activeShock, activeYear, activePrimaryCereal)
                }
                disabled={isLoading}
                className="bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs text-slate-800 font-medium focus:border-cyan-500 outline-none shadow-xs"
              >
                <option value="appoint">{t('options.water.appoint', {}, 'Supplementary Irrigation')}</option>
                <option value="bour_strict">{t('options.water.bour_strict', {}, 'Rainfed')}</option>
                <option value="bour">{t('options.water.bour', {}, 'Rainfed')}</option>
                <option value="irrigue_total">{t('options.water.irrigue_total', {}, 'Full Irrigation')}</option>
                <option value="irrigue">{t('options.water.irrigue', {}, 'Full Irrigation')}</option>
              </select>
            </div>

            {/* Stress Testing Shocks */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-slate-600">{t('simulation.climateShockLabel', {}, 'Shock:')}</span>
              <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                <button
                  type="button"
                  onClick={() => handleConfigChange(activeSoilType, activeWaterAccess, 'none')}
                  className={`px-2 py-0.5 rounded text-xs transition cursor-pointer ${
                    activeShock === 'none'
                      ? 'bg-white text-cyan-900 font-bold shadow-xs border border-slate-200'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {t('options.shocks.none', {}, 'Baseline')}
                </button>
                <button
                  type="button"
                  onClick={() => handleConfigChange(activeSoilType, activeWaterAccess, 'drought_30pct')}
                  className={`px-2 py-0.5 rounded text-xs transition flex items-center gap-1 cursor-pointer ${
                    activeShock === 'drought_30pct' || activeShock === 'drought'
                      ? 'bg-white text-amber-900 font-bold shadow-xs border border-amber-300'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <CloudOff className="w-3 h-3 text-amber-600" /> {t('options.shocks.drought_30pct', {}, 'Drought (-30%)')}
                </button>
                <button
                  type="button"
                  onClick={() => handleConfigChange(activeSoilType, activeWaterAccess, 'heatwave_early_spring')}
                  className={`px-2 py-0.5 rounded text-xs transition flex items-center gap-1 cursor-pointer ${
                    activeShock === 'heatwave_early_spring' || activeShock === 'heatwave'
                      ? 'bg-white text-rose-900 font-bold shadow-xs border border-rose-300'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Flame className="w-3 h-3 text-rose-600" /> {t('options.shocks.heatwave_early_spring', {}, 'Heatwave (+3.5°C)')}
                </button>
                <button
                  type="button"
                  onClick={() => handleConfigChange(activeSoilType, activeWaterAccess, 'delayed_rains_winter')}
                  className={`px-2 py-0.5 rounded text-xs transition flex items-center gap-1 cursor-pointer ${
                    activeShock === 'delayed_rains_winter' || activeShock === 'delayed_rain'
                      ? 'bg-white text-purple-900 font-bold shadow-xs border border-purple-300'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Clock className="w-3 h-3 text-purple-600" /> {t('options.shocks.delayed_rains_winter', {}, 'Delayed Rains')}
                </button>
              </div>
            </div>
          </div>

          {baseline?.crop_cycle_rain_gross_mm !== undefined && (
            <div className="hidden lg:flex items-center gap-3 text-xs text-slate-500" dir="ltr">
              <span>
                {t('simulation.cycleRain', {}, 'Cycle Rain:')} <bdi className="font-mono text-cyan-800 font-bold">{baseline.crop_cycle_rain_gross_mm} mm</bdi>
              </span>
              <span className="text-slate-300">•</span>
              <span>
                {t('simulation.sowingSmap', {}, 'Sowing SMAP L4:')} <bdi className="font-mono text-emerald-800 font-bold">{baseline.sowing_period_moisture_m3m3} m³/m³</bdi>
              </span>
            </div>
          )}
        </div>

        {/* ── Main Scrollable Body ── */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          {error && (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 shrink-0 text-amber-600 mt-0.5" />
              <div>
                <strong className="font-semibold block">{t('simulation.serviceNotice', {}, 'Simulation Engine Notice:')}</strong>
                <span className="text-slate-700 mt-0.5 block">{error}</span>
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="py-24 flex flex-col items-center justify-center gap-4 text-center">
              <div className="relative w-16 h-16">
                <div className="absolute inset-0 rounded-full border-2 border-cyan-200 border-t-cyan-600 animate-spin" />
                <div className="absolute inset-2 rounded-full border-2 border-emerald-200 border-b-emerald-600 animate-spin-reverse" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Droplets className="w-6 h-6 text-cyan-600 animate-pulse" />
                </div>
              </div>
              <p className="text-sm font-semibold text-cyan-800 animate-pulse">
                {t('simulation.loadingTitle', {}, 'Running FAO-56 Penman-Monteith Mass Balance & AI Scientific Tribunal…')}
              </p>
              <p className="text-xs text-slate-500 max-w-md">
                {t('simulation.loadingSubtitle', {}, 'Assimilating authentic NASA SMAP L4 9km root-zone moisture and NASA POWER daily agrometeorology.')}
              </p>
            </div>
          ) : (
            <>
              {/* ── Key Metrics Summary Ribbon ── */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-4 rounded-xl bg-slate-50/90 border border-slate-200/90">
                  <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1.5">
                    <span>{t('simulation.sowingStoredWater', {}, 'Sowing Stored Water')}</span>
                    <Droplets className="w-4 h-4 text-cyan-600" />
                  </div>
                  <div className="text-2xl font-bold text-slate-900" dir="ltr">
                    <bdi className="font-mono tabular-nums">
                      {baseline.stored_rootzone_water_at_sowing_mm !== undefined
                        ? baseline.stored_rootzone_water_at_sowing_mm
                        : '—'}
                    </bdi>{' '}
                    <span className="text-xs font-normal text-slate-500">mm</span>
                  </div>
                  <span className="text-[11px] text-slate-500 block mt-1">
                    {t('simulation.aboveWiltingPoint', {}, 'Above wilting point (0–100 cm)')}
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-slate-50/90 border border-slate-200/90">
                  <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1.5">
                    <span>{t('simulation.evapDemandReduction', {}, 'Evap Demand Reduction')}</span>
                    <TrendingDown className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="text-2xl font-bold text-emerald-800" dir="ltr">
                    <bdi className="font-mono tabular-nums">
                      {baseline.evaporative_demand_reduction_mm !== undefined
                        ? baseline.evaporative_demand_reduction_mm
                        : '—'}
                    </bdi>{' '}
                    <span className="text-xs font-normal text-slate-500">mm</span>
                  </div>
                  <span className="text-[11px] text-emerald-700 block mt-1" dir="ltr">
                    {t('simulation.evapSavedM3', {
                      val: baseline.evaporative_demand_reduction_m3_ha !== undefined
                        ? baseline.evaporative_demand_reduction_m3_ha
                        : '—'
                    }, `≈ ${baseline.evaporative_demand_reduction_m3_ha || '—'} m³/ha saved`)}
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-slate-50/90 border border-slate-200/90">
                  <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1.5">
                    <span>{t('simulation.deficitReduction', {}, 'Deficit Reduction')}</span>
                    <ShieldCheck className="w-4 h-4 text-cyan-600" />
                  </div>
                  <div className="text-2xl font-bold text-cyan-800" dir="ltr">
                    <bdi className="font-mono tabular-nums">
                      {baseline.simulated_water_deficit_reduction_mm !== undefined
                        ? baseline.simulated_water_deficit_reduction_mm
                        : '—'}
                    </bdi>{' '}
                    <span className="text-xs font-normal text-slate-500">mm</span>
                  </div>
                  <span className="text-[11px] text-cyan-700 block mt-1">
                    {t('simulation.avoidsDrought', {}, 'Avoids mid-season rootzone drought')}
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-slate-50/90 border border-slate-200/90">
                  <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1.5">
                    <span>{t('simulation.totalAnnualRainfall', {}, 'Total Annual Rainfall')}</span>
                    <Info className="w-4 h-4 text-purple-600" />
                  </div>
                  <div className="text-2xl font-bold text-slate-900" dir="ltr">
                    <bdi className="font-mono tabular-nums">
                      {baseline.annual_precipitation_mm !== undefined
                        ? baseline.annual_precipitation_mm
                        : '—'}
                    </bdi>{' '}
                    <span className="text-xs font-normal text-slate-500">mm</span>
                  </div>
                  <span className="text-[11px] text-slate-500 block mt-1" dir="ltr">
                    {baseline.recorded_hot_days !== undefined
                      ? t('simulation.hotDaysNotice', { days: baseline.recorded_hot_days }, `${baseline.recorded_hot_days} Hot Days (≥30°C)`)
                      : t('simulation.powerClimatology', {}, 'NASA POWER Climatology')}
                  </span>
                </div>
              </div>

              {/* ── Evaluated Rotation Strategies ── */}
              <div>
                <div className="flex items-center justify-between mb-3.5">
                  <div>
                    <h2 className="font-display text-base font-bold text-slate-900">
                      {t('simulation.evalScenariosTitle', {}, 'Evaluated Crop Rotation Scenarios (FAO-56 Mass Balance)')}
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {t('simulation.evalScenariosSubtitle', {}, 'Comparing Monoculture, Triennial Rotation, and Regenerative Agroecology.')}
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-emerald-800 flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                    <Award className="w-4 h-4 text-emerald-600" /> {t('simulation.winnerPlanBadge', {}, 'Optimal Scenario Recommended')}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {plans.map((plan) => {
                    const isWinner = plan.id === winnerId;
                    const isSelected = plan.id === currentSelectedPlan?.id;

                    const primaryTitle =
                      plan.name_localized ||
                      (language === 'ar'
                        ? (plan.name_ar || plan.name_fr || plan.name)
                        : language === 'fr'
                        ? (plan.name_fr || plan.name)
                        : language === 'es'
                        ? (plan.name_es || plan.name_fr || plan.name)
                        : (plan.name_en || plan.name_fr || plan.name));

                    const localizedSummary =
                      plan.summary_localized ||
                      (language === 'ar'
                        ? (plan.summary_darija || plan.summary)
                        : language === 'fr'
                        ? (plan.summary_fr || plan.summary)
                        : language === 'es'
                        ? (plan.summary_es || plan.summary)
                        : (plan.summary_en || plan.summary));

                    return (
                      <div
                        key={plan.id}
                        onClick={() => setSelectedPlanId(plan.id)}
                        className={`relative p-5 rounded-2xl border transition cursor-pointer flex flex-col justify-between ${
                          isWinner
                            ? 'bg-gradient-to-b from-emerald-50/80 to-white border-2 border-emerald-500/80 shadow-[0_10px_30px_rgba(16,185,129,0.15)]'
                            : isSelected
                            ? 'bg-white border-2 border-cyan-500 shadow-md'
                            : 'bg-slate-50/70 border-slate-200 hover:border-slate-300 hover:bg-white'
                        }`}
                      >
                        {isWinner && (
                          <div className={`absolute -top-3 ${isRtl ? 'right-5' : 'left-5'} px-3 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-bold uppercase shadow-sm flex items-center gap-1`}>
                            <Award className="w-3 h-3" /> {t('simulation.optimalWinner', {}, 'Optimal Winner')}
                          </div>
                        )}

                        <div>
                          {/* Plan Title */}
                          <div className="mb-3">
                            <h3 className="font-display text-base font-bold text-slate-900 leading-snug">{primaryTitle}</h3>
                          </div>

                          {/* Crop Sequence Pills */}
                          <div className="flex flex-wrap gap-1.5 mb-4">
                            {plan.rotation_sequence?.map((crop, idx) => {
                              const translatedCrop = resolveCropName(crop, t);
                              return (
                                <span
                                  key={idx}
                                  className="px-2.5 py-1 rounded-md bg-white border border-slate-200 text-xs font-medium text-slate-800 shadow-xs"
                                >
                                  {idx + 1}. {translatedCrop}
                                </span>
                              );
                            })}
                          </div>

                          {/* Core Metrics Grid */}
                          <div className="space-y-2.5 pt-3 border-t border-slate-200/80 text-xs">
                            <div className="flex items-center justify-between">
                              <span className="text-slate-500 font-medium">{t('simulation.waterNeed', {}, 'Water Need (ETc):')}</span>
                              <bdi className="font-mono font-semibold text-slate-800 tabular-nums" dir="ltr">
                                {plan.water_need_mm} mm
                              </bdi>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-slate-500 font-medium">{t('simulation.waterDeficit', {}, 'Water Deficit:')}</span>
                              <bdi
                                className={`font-mono font-bold tabular-nums ${
                                  plan.water_deficit_mm > 40 ? 'text-rose-600' : 'text-emerald-700'
                                }`}
                                dir="ltr"
                              >
                                {plan.water_deficit_mm} mm
                              </bdi>
                            </div>

                            {/* Water Stress Risk Bar */}
                            <div>
                              <div className="flex items-center justify-between text-xs mb-1">
                                <span className="text-slate-500 font-medium">{t('simulation.droughtStressRisk', {}, 'Drought Stress Risk:')}</span>
                                <bdi
                                  className={`font-bold tabular-nums ${
                                    plan.water_stress_risk_pct > 20
                                      ? 'text-rose-600'
                                      : plan.water_stress_risk_pct > 10
                                      ? 'text-amber-600'
                                      : 'text-emerald-700'
                                  }`}
                                  dir="ltr"
                                >
                                  {plan.water_stress_risk_pct}%
                                </bdi>
                              </div>
                              <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden" dir="ltr">
                                <div
                                  className={`h-full ${
                                    plan.water_stress_risk_pct > 20
                                      ? 'bg-rose-500'
                                      : plan.water_stress_risk_pct > 10
                                      ? 'bg-amber-400'
                                      : 'bg-emerald-500'
                                  }`}
                                  style={{ width: `${Math.min(100, Math.max(5, plan.water_stress_risk_pct * 3))}%` }}
                                />
                              </div>
                            </div>

                            {/* Soil Health Score */}
                            <div className="flex items-center justify-between pt-1">
                              <span className="text-slate-500 font-medium">{t('simulation.soilHealthScore', {}, 'Soil Health Score:')}</span>
                              <bdi className="font-mono font-bold text-cyan-800 tabular-nums" dir="ltr">
                                {plan.soil_health_score}/100
                              </bdi>
                            </div>
                          </div>

                          {/* Localized Summary */}
                          {localizedSummary && (
                            <div className="mt-4 p-3 rounded-xl bg-slate-100 border border-slate-200 text-xs text-slate-700 leading-relaxed">
                              <span className="text-[11px] font-bold text-emerald-800 block mb-1">
                                {t('simulation.synthesisTitle', {}, 'Terroir Agronomic Synthesis:')}
                              </span>
                              {localizedSummary}
                            </div>
                          )}
                        </div>

                        {/* Pros / Cons Highlights */}
                        <div className="mt-4 pt-3 border-t border-slate-200 text-xs space-y-1">
                          {plan.pros?.slice(0, 3).map((pro, i) => (
                            <div key={i} className="text-emerald-800 flex items-start gap-1.5">
                              <span className="font-bold text-emerald-600 shrink-0">+</span>
                              <span>{pro}</span>
                            </div>
                          ))}
                          {plan.cons?.slice(0, 2).map((con, i) => (
                            <div key={i} className="text-rose-700 flex items-start gap-1.5">
                              <span className="font-bold text-rose-500 shrink-0">-</span>
                              <span>{con}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ── AI Scientific Tribunal (Multi-Agent Consensus) ── */}
              {tribunal.length > 0 && (
                <div className="p-5 rounded-2xl bg-slate-50/80 border border-slate-200 space-y-3.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-display text-base font-bold text-slate-900 flex items-center gap-2">
                        <Scale className="w-4 h-4 text-cyan-600" />
                        {t('simulation.tribunalTitle', {}, 'AI Scientific Tribunal (Multi-Agent Consensus)')}
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {t('simulation.tribunalSubtitle', {}, 'Independent cross-examination grounded in NASA Earth observations and FAO-56 physics.')}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {tribunal.map((agent, i) => {
                      const agentArgument =
                        agent.argument_localized ||
                        (language === 'ar'
                          ? (agent.argument_darija || agent.argument)
                          : language === 'fr'
                          ? (agent.argument_fr || agent.argument)
                          : language === 'es'
                          ? (agent.argument_es || agent.argument)
                          : (agent.argument_en || agent.argument));

                      return (
                        <div
                          key={i}
                          className="p-4 rounded-xl bg-white border border-slate-200 hover:border-slate-300 shadow-xs transition space-y-2.5 text-xs"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                              <span className="text-xl">{agent.avatar || '🧑‍🔬'}</span>
                              <div>
                                <span className="font-bold text-slate-900 block text-xs">
                                  {agent.agent_role}
                                </span>
                                <span className="text-[11px] text-slate-500 font-medium">
                                  {agent.agent_name}
                                </span>
                              </div>
                            </div>
                            {getStanceBadge(agent.stance)}
                          </div>

                          {/* Argument text */}
                          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 text-xs text-slate-700 leading-relaxed">
                            {agentArgument}
                          </div>

                          {/* Key evidence note */}
                          {agent.key_evidence && (
                            <div className="text-[11px] text-cyan-900 flex items-start gap-1 font-medium">
                              <span className="text-slate-400 font-semibold shrink-0">
                                {t('common.evidence', {}, 'Evidence')}:
                              </span>
                              <span className="truncate">{agent.key_evidence}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── Overall Decision Synthesis Quote ── */}
              {(simulationData?.overall_synthesis_localized || simulationData?.overall_synthesis_darija || simulationData?.synthesis) && (
                <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-50 via-teal-50 to-cyan-50 border border-emerald-300 text-xs text-slate-800 leading-relaxed shadow-xs">
                  <span className="font-bold text-emerald-900 block mb-1">
                    {t('simulation.finalSynthesisTitle', {}, '★ Final Agronomic Decision Synthesis:')}
                  </span>
                  {simulationData.overall_synthesis_localized ||
                    (language === 'ar'
                      ? (simulationData.overall_synthesis_darija || simulationData.synthesis)
                      : language === 'fr'
                      ? (simulationData.overall_synthesis_fr || simulationData.synthesis)
                      : language === 'es'
                      ? (simulationData.overall_synthesis_es || simulationData.synthesis)
                      : (simulationData.overall_synthesis_en || simulationData.synthesis))}
                </div>
              )}

              {/* ── Scientific Data Transparency Footer ── */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="font-semibold text-slate-700">{t('simulation.dataSources', {}, 'Data Sources:')}</span>
                  {(simulationData?.sources_used || [
                    'NASA SMAP L4 SPL4SMGP V008',
                    'NASA POWER Daily Agrometeorology',
                    'FAO-56 Penman-Monteith Rootzone Engine',
                  ]).map((src, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 rounded bg-white text-slate-700 border border-slate-200 shadow-xs"
                    >
                      {src}
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-1.5 text-emerald-800 font-semibold" dir="ltr">
                  <Cpu className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                  <span>{t('simulation.massBalanceResidual', {}, 'Physical Mass Balance Residual:')}</span>
                  <bdi className="font-mono text-emerald-900 ml-1 px-2 py-0.5 rounded bg-white border border-emerald-200 tabular-nums shadow-xs" dir="ltr">
                    {formattedResidual}
                  </bdi>
                </div>
              </div>
            </>
          )}
        </div>

      </div>
    </div>
  );
}
