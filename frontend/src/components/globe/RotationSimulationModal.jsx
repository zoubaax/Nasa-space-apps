import React, { useState, useEffect } from 'react';
import {
  TbX,
  TbAward,
  TbDroplet,
  TbTrendingDown,
  TbShieldCheck,
  TbAlertTriangle,
  TbScale,
  TbFlame,
  TbCloudOff,
  TbClock,
  TbRefresh,
  TbCheck,
  TbInfoCircle,
  TbCpu,
} from 'react-icons/tb';
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
      // 1. Soil auto-detection from rainfall and SMAP root-zone moisture
      if (rain < 150 || (smap !== undefined && smap < 0.14)) {
        setActiveSoilType('sableux'); // Sandy desert soil (e.g. Sahara, Dakhla, Imlili)
      } else if (rain > 650) {
        setActiveSoilType('argilo_limoneux');
      } else if (rain > 450) {
        setActiveSoilType('limoneux_profond');
      } else {
        setActiveSoilType('argilo_limoneux');
      }

      // 2. Water access auto-detection
      if (rain < 120) {
        setActiveWaterAccess('irrigue'); // Hyper-arid requires full irrigation/oasis
      } else if (rain > 450) {
        setActiveWaterAccess('bour'); // Rainfed in high rain
      } else {
        setActiveWaterAccess('appoint'); // Supplementary in semi-arid
      }

      // 3. Primary crop auto-detection from climate + geographic terroir
      if (rain < 160) {
        setActivePrimaryCereal('orge'); // In desert/arid border, barley is the resilient grain
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
          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
            <TbCheck className="w-3 h-3" /> {t('simulation.favorable', {}, 'Favorable')}
          </span>
        );
      case 'reserve':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
            <TbAlertTriangle className="w-3 h-3" /> {t('simulation.reserved', {}, 'Réservé')}
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
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
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-xl animate-fade-in font-sans"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <div className="relative w-full max-w-6xl max-h-[92vh] flex flex-col rounded-3xl bg-zinc-950/95 border border-cyan-500/40 shadow-[0_0_80px_rgba(6,182,212,0.25)] text-white overflow-hidden">
        
        {/* ── Modal Header ── */}
        <div className="relative px-6 py-4 border-b border-zinc-800/80 bg-gradient-to-r from-zinc-950 via-cyan-950/20 to-zinc-950 flex flex-wrap items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-2xl bg-cyan-500/10 border border-cyan-400/30 text-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.3)] shrink-0">
              <TbScale className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-zinc-100 font-mono tracking-tight">
                  {t('simulation.modalTitle', {}, 'FIELDShift Virtual Agricultural Laboratory')}
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-cyan-500/20 text-cyan-300 border border-cyan-400/30">
                  {t('simulation.engineBadge', {}, 'FAO-56 Dual Crop Engine')}
                </span>
              </div>
              <p className="text-xs text-zinc-400 font-mono">
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
              className="px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-700/80 hover:border-cyan-400 text-xs font-mono text-cyan-300 flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
              title={t('simulation.reRunBtn', {}, 'Re-run Simulation')}
            >
              <TbRefresh className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>{isLoading ? t('simulation.computing', {}, 'Computing…') : t('simulation.reRunBtn', {}, 'Re-Run')}</span>
            </button>
            <button
              onClick={onClose}
              type="button"
              className="p-2 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-white transition cursor-pointer"
              title={t('common.close', {}, 'Close modal')}
            >
              <TbX className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ── Interactive Scenario Controls Strip ── */}
        <div className="px-6 py-2.5 border-b border-zinc-800/80 bg-zinc-900/40 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
          <div className="flex flex-wrap items-center gap-4">
            {/* Harvest Season Year */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-mono text-zinc-400">{t('simulation.harvestYear', {}, 'Harvest Year:')}</span>
              <select
                value={activeYear}
                onChange={(e) =>
                  handleConfigChange(activeSoilType, activeWaterAccess, activeShock, parseInt(e.target.value, 10), activePrimaryCereal)
                }
                disabled={isLoading}
                className="bg-zinc-950 border border-zinc-700 rounded-lg px-2 py-1 text-xs text-zinc-200 font-mono focus:border-cyan-400 outline-none"
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
              <span className="text-[11px] font-mono text-zinc-400">{t('simulation.primaryCerealLabel', {}, 'Crop Focus:')}</span>
              <select
                value={activePrimaryCereal}
                onChange={(e) =>
                  handleConfigChange(activeSoilType, activeWaterAccess, activeShock, activeYear, e.target.value)
                }
                disabled={isLoading}
                className="bg-zinc-950 border border-zinc-700 rounded-lg px-2 py-1 text-xs text-zinc-200 font-mono focus:border-cyan-400 outline-none"
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
              <span className="text-[11px] font-mono text-zinc-400">{t('simulation.soilTypeLabel', {}, 'Soil:')}</span>
              <select
                value={activeSoilType}
                onChange={(e) =>
                  handleConfigChange(e.target.value, activeWaterAccess, activeShock, activeYear, activePrimaryCereal)
                }
                disabled={isLoading}
                className="bg-zinc-950 border border-zinc-700 rounded-lg px-2 py-1 text-xs text-zinc-200 font-mono focus:border-cyan-400 outline-none"
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
              <span className="text-[11px] font-mono text-zinc-400">{t('simulation.waterAccessLabel', {}, 'Water:')}</span>
              <select
                value={activeWaterAccess}
                onChange={(e) =>
                  handleConfigChange(activeSoilType, e.target.value, activeShock, activeYear, activePrimaryCereal)
                }
                disabled={isLoading}
                className="bg-zinc-950 border border-zinc-700 rounded-lg px-2 py-1 text-xs text-zinc-200 font-mono focus:border-cyan-400 outline-none"
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
              <span className="text-[11px] font-mono text-zinc-400">{t('simulation.climateShockLabel', {}, 'Climate Shock:')}</span>
              <div className="flex items-center gap-1 bg-zinc-950 p-0.5 rounded-lg border border-zinc-800">
                <button
                  type="button"
                  onClick={() => handleConfigChange(activeSoilType, activeWaterAccess, 'none')}
                  className={`px-2 py-0.5 rounded text-[11px] font-mono transition cursor-pointer ${
                    activeShock === 'none'
                      ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {t('options.shocks.none', {}, 'Baseline')}
                </button>
                <button
                  type="button"
                  onClick={() => handleConfigChange(activeSoilType, activeWaterAccess, 'drought_30pct')}
                  className={`px-2 py-0.5 rounded text-[11px] font-mono transition flex items-center gap-1 cursor-pointer ${
                    activeShock === 'drought_30pct' || activeShock === 'drought'
                      ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <TbCloudOff className="w-3 h-3" /> {t('options.shocks.drought_30pct', {}, 'Severe Drought (-30%)')}
                </button>
                <button
                  type="button"
                  onClick={() => handleConfigChange(activeSoilType, activeWaterAccess, 'heatwave_early_spring')}
                  className={`px-2 py-0.5 rounded text-[11px] font-mono transition flex items-center gap-1 cursor-pointer ${
                    activeShock === 'heatwave_early_spring' || activeShock === 'heatwave'
                      ? 'bg-rose-500/20 text-rose-300 font-bold border border-rose-500/40'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <TbFlame className="w-3 h-3" /> {t('options.shocks.heatwave_early_spring', {}, 'Heatwave (+3.5°C)')}
                </button>
                <button
                  type="button"
                  onClick={() => handleConfigChange(activeSoilType, activeWaterAccess, 'delayed_rains_winter')}
                  className={`px-2 py-0.5 rounded text-[11px] font-mono transition flex items-center gap-1 cursor-pointer ${
                    activeShock === 'delayed_rains_winter' || activeShock === 'delayed_rain'
                      ? 'bg-purple-500/20 text-purple-300 font-bold border border-purple-500/40'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <TbClock className="w-3 h-3" /> {t('options.shocks.delayed_rains_winter', {}, 'Delayed Rains')}
                </button>
              </div>
            </div>
          </div>

          {baseline?.crop_cycle_rain_gross_mm !== undefined && (
            <div className="hidden lg:flex items-center gap-3 text-[11px] font-mono text-zinc-400" dir="ltr">
              <span>
                {t('simulation.cycleRain', {}, 'Cycle Rain:')} <strong className="text-blue-300">{baseline.crop_cycle_rain_gross_mm} mm</strong>
              </span>
              <span>•</span>
              <span>
                {t('simulation.sowingSmap', {}, 'Sowing SMAP L4:')} <strong className="text-cyan-300">{baseline.sowing_period_moisture_m3m3} m³/m³</strong>
              </span>
            </div>
          )}
        </div>

        {/* ── Main Scrollable Body ── */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          {error && (
            <div className="p-4 rounded-2xl bg-amber-950/40 border border-amber-500/40 text-amber-200 text-xs flex items-start gap-3">
              <TbAlertTriangle className="w-5 h-5 shrink-0 text-amber-400 mt-0.5" />
              <div>
                <strong className="font-semibold block">{t('simulation.serviceNotice', {}, 'Simulation Engine Notice:')}</strong>
                <span>{error}</span>
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-4 text-center">
              <div className="relative w-16 h-16">
                <div className="absolute inset-0 rounded-full border-2 border-cyan-500/20 border-t-cyan-400 animate-spin"></div>
                <div className="absolute inset-2 rounded-full border-2 border-emerald-500/20 border-b-emerald-400 animate-spin-reverse"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <TbDroplet className="w-6 h-6 text-cyan-300 animate-pulse" />
                </div>
              </div>
              <p className="text-sm font-mono text-cyan-300 font-semibold animate-pulse">
                {t('simulation.loadingTitle', {}, 'Running FAO-56 Penman-Monteith Mass Balance & AI Scientific Tribunal…')}
              </p>
              <p className="text-xs text-zinc-500 max-w-md font-mono">
                {t('simulation.loadingSubtitle', {}, 'Assimilating authentic NASA SMAP L4 9km root-zone moisture and NASA POWER daily agrometeorology.')}
              </p>
            </div>
          ) : (
            <>
              {/* ── Hero Metrics Summary Ribbon ── */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-2xl bg-zinc-900/60 border border-cyan-500/30">
                  <div className="flex items-center justify-between text-zinc-400 text-[11px] font-mono mb-1">
                    <span>{t('simulation.sowingStoredWater', {}, 'Sowing Stored Water')}</span>
                    <TbDroplet className="w-4 h-4 text-cyan-400" />
                  </div>
                  <div className="text-xl font-bold font-mono text-cyan-300" dir="ltr">
                    {baseline.stored_rootzone_water_at_sowing_mm !== undefined
                      ? baseline.stored_rootzone_water_at_sowing_mm
                      : '—'}{' '}
                    <span className="text-xs font-normal text-zinc-400">mm</span>
                  </div>
                  <span className="text-[10px] text-zinc-500 font-mono block mt-0.5">
                    {t('simulation.aboveWiltingPoint', {}, 'Above wilting point (0–100 cm)')}
                  </span>
                </div>

                <div className="p-3.5 rounded-2xl bg-zinc-900/60 border border-emerald-500/30">
                  <div className="flex items-center justify-between text-zinc-400 text-[11px] font-mono mb-1">
                    <span>{t('simulation.evapDemandReduction', {}, 'Evap Demand Reduction')}</span>
                    <TbTrendingDown className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="text-xl font-bold font-mono text-emerald-300" dir="ltr">
                    {baseline.evaporative_demand_reduction_mm !== undefined
                      ? baseline.evaporative_demand_reduction_mm
                      : '—'}{' '}
                    <span className="text-xs font-normal text-zinc-400">mm</span>
                  </div>
                  <span className="text-[10px] text-emerald-400/80 font-mono block mt-0.5" dir="ltr">
                    {t('simulation.evapSavedM3', {
                      val: baseline.evaporative_demand_reduction_m3_ha !== undefined
                        ? baseline.evaporative_demand_reduction_m3_ha
                        : '—'
                    }, `≈ ${baseline.evaporative_demand_reduction_m3_ha || '—'} m³/ha saved`)}
                  </span>
                </div>

                <div className="p-3.5 rounded-2xl bg-zinc-900/60 border border-blue-500/30">
                  <div className="flex items-center justify-between text-zinc-400 text-[11px] font-mono mb-1">
                    <span>{t('simulation.deficitReduction', {}, 'Deficit Reduction')}</span>
                    <TbShieldCheck className="w-4 h-4 text-blue-400" />
                  </div>
                  <div className="text-xl font-bold font-mono text-blue-300" dir="ltr">
                    {baseline.simulated_water_deficit_reduction_mm !== undefined
                      ? baseline.simulated_water_deficit_reduction_mm
                      : '—'}{' '}
                    <span className="text-xs font-normal text-zinc-400">mm</span>
                  </div>
                  <span className="text-[10px] text-blue-400/80 font-mono block mt-0.5">
                    {t('simulation.avoidsDrought', {}, 'Avoids mid-season rootzone drought')}
                  </span>
                </div>

                <div className="p-3.5 rounded-2xl bg-zinc-900/60 border border-purple-500/30">
                  <div className="flex items-center justify-between text-zinc-400 text-[11px] font-mono mb-1">
                    <span>{t('simulation.totalAnnualRainfall', {}, 'Total Annual Rainfall')}</span>
                    <TbInfoCircle className="w-4 h-4 text-purple-400" />
                  </div>
                  <div className="text-xl font-bold font-mono text-purple-300" dir="ltr">
                    {baseline.annual_precipitation_mm !== undefined
                      ? baseline.annual_precipitation_mm
                      : '—'}{' '}
                    <span className="text-xs font-normal text-zinc-400">mm</span>
                  </div>
                  <span className="text-[10px] text-zinc-500 font-mono block mt-0.5" dir="ltr">
                    {baseline.recorded_hot_days !== undefined
                      ? t('simulation.hotDaysNotice', { days: baseline.recorded_hot_days }, `${baseline.recorded_hot_days} Hot Days (≥30°C)`)
                      : t('simulation.powerClimatology', {}, 'NASA POWER Climatology')}
                  </span>
                </div>
              </div>

              {/* ── Evaluated Rotation Strategies (The Crop Battle Lab) ── */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h2 className="text-sm font-bold font-mono text-zinc-200 tracking-wide uppercase">
                      {t('simulation.evalScenariosTitle', {}, 'Evaluated Crop Rotation Scenarios (FAO-56 Mass Balance)')}
                    </h2>
                    <p className="text-xs text-zinc-400">
                      {t('simulation.evalScenariosSubtitle', {}, 'Comparing Monoculture, Triennial Rotation, and Regenerative Agroecology.')}
                    </p>
                  </div>
                  <span className="text-xs font-mono text-emerald-400 flex items-center gap-1.5">
                    <TbAward className="w-4 h-4" /> {t('simulation.winnerPlanBadge', {}, 'Recommended Winner Highlighted')}
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
                        className={`relative p-5 rounded-3xl border transition cursor-pointer flex flex-col justify-between ${
                          isWinner
                            ? 'bg-gradient-to-b from-emerald-950/30 via-zinc-900/80 to-zinc-950 border-emerald-500/60 shadow-[0_0_35px_rgba(16,185,129,0.2)]'
                            : isSelected
                            ? 'bg-zinc-900/90 border-cyan-500/50'
                            : 'bg-zinc-900/40 border-zinc-800 hover:border-zinc-700'
                        }`}
                      >
                        {isWinner && (
                          <div className={`absolute -top-3 ${isRtl ? 'right-5' : 'left-5'} px-3 py-0.5 rounded-full bg-emerald-500 text-zinc-950 font-mono text-[10px] font-bold uppercase tracking-wider shadow-md flex items-center gap-1`}>
                            <TbAward className="w-3.5 h-3.5" /> {t('simulation.optimalWinner', {}, 'Optimal Winner')}
                          </div>
                        )}

                        <div>
                          {/* Plan Titles */}
                          <div className="mb-3">
                            <h3 className="font-bold text-sm text-zinc-100">{primaryTitle}</h3>
                          </div>

                          {/* Crop Sequence Pills */}
                          <div className="flex flex-wrap gap-1.5 mb-4">
                            {plan.rotation_sequence?.map((crop, idx) => {
                              const translatedCrop = resolveCropName(crop, t);
                              return (
                                <span
                                  key={idx}
                                  className="px-2.5 py-1 rounded-md bg-zinc-800/90 border border-zinc-700/80 text-[11px] font-sans font-medium text-zinc-200 tracking-normal shadow-sm"
                                >
                                  {idx + 1}. {translatedCrop}
                                </span>
                              );
                            })}
                          </div>

                          {/* Core Metrics Grid */}
                          <div className="space-y-2.5 pt-2 border-t border-zinc-800/80 text-xs">
                            <div className="flex items-center justify-between">
                              <span className="text-zinc-400 font-mono text-[11px]">{t('simulation.waterNeed', {}, 'Water Need (ETc):')}</span>
                              <span className="font-mono font-bold text-zinc-200" dir="ltr">
                                {plan.water_need_mm} mm
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-zinc-400 font-mono text-[11px]">{t('simulation.waterDeficit', {}, 'Water Deficit:')}</span>
                              <span
                                className={`font-mono font-bold ${
                                  plan.water_deficit_mm > 40 ? 'text-rose-400' : 'text-emerald-400'
                                }`}
                                dir="ltr"
                              >
                                {plan.water_deficit_mm} mm
                              </span>
                            </div>

                            {/* Water Stress Risk Bar */}
                            <div>
                              <div className="flex items-center justify-between text-[11px] font-mono mb-1">
                                <span className="text-zinc-400">{t('simulation.droughtStressRisk', {}, 'Drought Stress Risk:')}</span>
                                <span
                                  className={`font-bold ${
                                    plan.water_stress_risk_pct > 20
                                      ? 'text-rose-400'
                                      : plan.water_stress_risk_pct > 10
                                      ? 'text-amber-400'
                                      : 'text-emerald-400'
                                  }`}
                                  dir="ltr"
                                >
                                  {plan.water_stress_risk_pct}%
                                </span>
                              </div>
                              <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden" dir="ltr">
                                <div
                                  className={`h-full ${
                                    plan.water_stress_risk_pct > 20
                                      ? 'bg-rose-500'
                                      : plan.water_stress_risk_pct > 10
                                      ? 'bg-amber-400'
                                      : 'bg-emerald-400'
                                  }`}
                                  style={{ width: `${Math.min(100, Math.max(5, plan.water_stress_risk_pct * 3))}%` }}
                                ></div>
                              </div>
                            </div>

                            {/* Soil Health Score */}
                            <div className="flex items-center justify-between pt-1">
                              <span className="text-zinc-400 font-mono text-[11px]">{t('simulation.soilHealthScore', {}, 'Soil Health Score:')}</span>
                              <span className="font-mono font-bold text-cyan-300" dir="ltr">
                                {plan.soil_health_score}/100
                              </span>
                            </div>
                          </div>

                          {/* Localized Summary */}
                          {localizedSummary && (
                            <div className="mt-4 p-3 rounded-2xl bg-zinc-950/70 border border-zinc-800/80 text-[11px] text-zinc-300 leading-relaxed font-sans">
                              <span className="text-[10px] font-mono text-emerald-400 block mb-0.5">
                                {t('simulation.synthesisTitle', {}, 'Terroir Agronomic Synthesis:')}
                              </span>
                              {localizedSummary}
                            </div>
                          )}
                        </div>

                        {/* Pros / Cons Highlights */}
                        <div className="mt-4 pt-3 border-t border-zinc-800/60 text-[11px] space-y-1">
                          {plan.pros?.slice(0, 3).map((pro, i) => (
                            <div key={i} className="text-emerald-300 flex items-start gap-1.5">
                              <span className="font-bold text-emerald-400 shrink-0">+</span>
                              <span>{pro}</span>
                            </div>
                          ))}
                          {plan.cons?.slice(0, 2).map((con, i) => (
                            <div key={i} className="text-rose-300/80 flex items-start gap-1.5">
                              <span className="font-bold text-rose-400 shrink-0">-</span>
                              <span>{con}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ── AI Scientific Tribunal (4 Expert Persona Verdicts) ── */}
              {tribunal.length > 0 && (
                <div className="p-5 rounded-3xl bg-zinc-900/40 border border-zinc-800/80 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold font-mono text-zinc-200 tracking-wide uppercase flex items-center gap-2">
                        <TbScale className="w-4 h-4 text-cyan-400" />
                        {t('simulation.tribunalTitle', {}, 'AI Scientific Tribunal (Multi-Agent Consensus)')}
                      </h3>
                      <p className="text-xs text-zinc-400">
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
                          className="p-4 rounded-2xl bg-zinc-950/80 border border-zinc-800 hover:border-zinc-700 transition space-y-2 text-xs"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-lg">{agent.avatar || '🧑‍🔬'}</span>
                              <div>
                                <span className="font-bold text-zinc-200 block text-xs">
                                  {agent.agent_role}
                                </span>
                                <span className="text-[10px] font-mono text-zinc-400">
                                  {agent.agent_name}
                                </span>
                              </div>
                            </div>
                            {getStanceBadge(agent.stance)}
                          </div>

                          {/* Localized Argument */}
                          <div className="p-2.5 rounded-xl bg-zinc-900/50 text-[11px] text-zinc-300 leading-relaxed font-sans">
                            {agentArgument}
                          </div>

                          {/* Key Scientific Evidence */}
                          {agent.key_evidence && (
                            <div className="text-[10px] font-mono text-cyan-300/90 flex items-start gap-1">
                              <span className="text-zinc-500 font-semibold shrink-0">
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
                <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-950/40 via-cyan-950/30 to-zinc-900 border border-emerald-500/40 text-xs text-zinc-200 leading-relaxed font-sans shadow-lg">
                  <span className="text-[10px] font-mono text-emerald-300 block mb-1">
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
              <div className="p-3 rounded-2xl bg-zinc-900/30 border border-zinc-800/60 font-mono text-[10px] text-zinc-400 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                  <span>{t('simulation.dataSources', {}, 'Data Sources:')}</span>
                  {(simulationData?.sources_used || [
                    'NASA SMAP L4 SPL4SMGP V008',
                    'NASA POWER Daily Agrometeorology',
                    'FAO-56 Penman-Monteith Rootzone Engine',
                  ]).map((src, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 rounded bg-zinc-800/80 text-zinc-300 border border-zinc-700"
                    >
                      {src}
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-1.5 text-emerald-400/90 font-semibold" dir="ltr">
                  <TbCpu className="w-3.5 h-3.5 shrink-0" />
                  <span>{t('simulation.massBalanceResidual', {}, 'Physical Mass Balance Residual:')}</span>
                  <bdi className="font-mono text-emerald-300 ml-1 px-1.5 py-0.5 rounded bg-zinc-800/80 border border-emerald-500/20" dir="ltr">
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
