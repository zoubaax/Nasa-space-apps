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
  Loader2,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  LayoutGrid,
  Table as TableIcon,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { useTranslation } from '../../context/LanguageContext';

function resolveCropName(crop, t) {
  if (!crop) return '';
  const raw = String(crop).trim();
  const clean = raw.replace(/\s*\((?:سنة|year|an|\d)\s*\d*\)\s*/gi, '').trim();

  if (/[\u0600-\u06FF]/.test(clean)) {
    return clean;
  }

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
  const [activeViewMode, setActiveViewMode] = useState('overview'); // 'overview' | 'matrix'

  const plans = simulationData?.plans || [];
  const winnerId = simulationData?.winner_plan_id || plans[0]?.id;
  const currentSelectedPlan =
    plans.find((p) => p.id === (selectedPlanId || winnerId)) || plans[0];
  const baseline = simulationData?.baseline_metrics || {};
  const tribunal = simulationData?.tribunal_verdicts || [];

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (selectedYear) {
      setActiveYear(selectedYear);
    }
  }, [selectedYear]);

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
          <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> {t('simulation.favorable', {}, 'Favorable')}
          </span>
        );
      case 'reserve':
        return (
          <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" /> {t('simulation.reserved', {}, 'Réservé')}
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center gap-1.5">
            <XCircle className="w-3.5 h-3.5 text-rose-400" /> {t('simulation.unfavorable', {}, 'Défavorable')}
          </span>
        );
    }
  };

  const residualValue =
    baseline.fao56_daily_water_balance?.unrounded_daily_mass_balance?.mass_balance_residual_mm;
  const formattedResidual =
    typeof residualValue === 'number'
      ? `${residualValue.toExponential(3)} mm`
      : '< 10⁻¹² mm';

  const BackArrow = isRtl ? ArrowRight : ArrowLeft;

  // Maximum water need to calculate relative chart bar heights
  const maxWaterNeed = Math.max(...plans.map((p) => p.water_need_mm || 400), 500);

  return (
    <div
      className="fixed inset-0 z-50 w-screen h-screen bg-[#080a0f] flex flex-col text-zinc-100 font-body overflow-hidden select-none animate-fade-in"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      {/* ── TOP PERSISTENT LABORATORY FLIGHT BAR ── */}
      <header className="relative px-6 sm:px-10 py-3.5 border-b border-zinc-800/90 bg-[#0d1017] flex flex-wrap items-center justify-between gap-4 shrink-0 z-20">
        
        {/* Left: Navigation & Context Breadcrumb */}
        <div className="flex items-center gap-3 sm:gap-5">
          <button
            onClick={onClose}
            type="button"
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-200 hover:text-white border border-zinc-800 transition cursor-pointer text-xs sm:text-sm font-semibold"
            title="Return to Earth Orbit View (Esc)"
          >
            <BackArrow className="w-4 h-4" />
            <span>{t('common.backToOrbit', {}, 'Orbit View')}</span>
          </button>

          <div className="h-5 w-px bg-zinc-800" />

          <div className="flex items-center gap-2.5">
            <span className="font-display font-bold text-base sm:text-lg text-white">
              {t('simulation.modalTitle', {}, 'Crop Rotation Laboratory')}
            </span>
            <span className="text-zinc-600 hidden sm:inline">•</span>
            <span className="text-sm font-medium text-zinc-300 hidden sm:inline">
              {locationData?.name || t('telemetry.fieldLocked', {}, 'Selected Field')}
            </span>
          </div>

          <span className="hidden md:inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-zinc-900 text-zinc-300 font-mono text-xs border border-zinc-800 font-medium">
            [{locationData?.lat?.toFixed(3)}°N, {locationData?.lng?.toFixed(3)}°E]
          </span>

          <span className="hidden lg:inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-mono text-zinc-400 bg-zinc-900 border border-zinc-800">
            {t('simulation.engineBadge', {}, 'FAO-56 Mass Balance Engine')}
          </span>
        </div>

        {/* Center: View Switcher */}
        <div className="hidden md:flex items-center p-1 rounded-xl bg-zinc-900 border border-zinc-800">
          <button
            type="button"
            onClick={() => setActiveViewMode('overview')}
            className={`px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition cursor-pointer flex items-center gap-2 ${
              activeViewMode === 'overview'
                ? 'bg-zinc-800 text-zinc-100 shadow-xs border border-zinc-700'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <LayoutGrid className="w-4 h-4" />
            <span>{t('simulation.comparativeOverview', {}, 'Comparative Overview')}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveViewMode('matrix')}
            className={`px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition cursor-pointer flex items-center gap-2 ${
              activeViewMode === 'matrix'
                ? 'bg-zinc-800 text-zinc-100 shadow-xs border border-zinc-700'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <TableIcon className="w-4 h-4" />
            <span>{t('simulation.technicalMatrix', {}, 'Technical Matrix')}</span>
          </button>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => handleConfigChange(activeSoilType, activeWaterAccess, activeShock, activeYear, activePrimaryCereal)}
            disabled={isLoading}
            type="button"
            className="px-4 py-2 rounded-xl bg-zinc-100 hover:bg-white text-zinc-950 font-bold text-xs sm:text-sm transition cursor-pointer disabled:opacity-50 shadow-sm flex items-center gap-2"
            title={t('simulation.reRunBtn', {}, 'Re-run Simulation')}
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            <span>{isLoading ? t('simulation.computing', {}, 'Computing…') : t('simulation.reRunBtn', {}, 'Re-Run Simulation')}</span>
          </button>

          <button
            onClick={onClose}
            type="button"
            className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 border border-zinc-800 transition cursor-pointer"
            title="Exit Fullscreen (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* ── INTERACTIVE SCENARIO CONTROLS BAR ── */}
      <div className="px-6 sm:px-10 py-3.5 border-b border-zinc-800 bg-[#0a0d13] flex flex-wrap items-center justify-between gap-4 text-xs sm:text-sm shrink-0 z-10">
        <div className="flex flex-wrap items-center gap-4 sm:gap-6">
          
          {/* Harvest Season Year */}
          <div className="flex items-center gap-2.5">
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">{t('simulation.harvestYear', {}, 'Harvest:')}</span>
            <select
              value={activeYear}
              onChange={(e) =>
                handleConfigChange(activeSoilType, activeWaterAccess, activeShock, parseInt(e.target.value, 10), activePrimaryCereal)
              }
              disabled={isLoading}
              className="bg-zinc-900 border border-zinc-700 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-zinc-100 font-bold focus:border-zinc-500 outline-none cursor-pointer"
            >
              {[2025, 2024, 2023, 2022, 2021].map((yr) => (
                <option key={yr} value={yr}>
                  {yr} ({yr - 1}–{yr})
                </option>
              ))}
            </select>
          </div>

          {/* Primary Cereal */}
          <div className="flex items-center gap-2.5">
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">{t('simulation.primaryCerealLabel', {}, 'Crop Focus:')}</span>
            <select
              value={activePrimaryCereal}
              onChange={(e) =>
                handleConfigChange(activeSoilType, activeWaterAccess, activeShock, activeYear, e.target.value)
              }
              disabled={isLoading}
              className="bg-zinc-900 border border-zinc-700 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-zinc-100 font-bold focus:border-zinc-500 outline-none cursor-pointer"
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
          <div className="flex items-center gap-2.5">
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">{t('simulation.soilTypeLabel', {}, 'Soil:')}</span>
            <select
              value={activeSoilType}
              onChange={(e) =>
                handleConfigChange(e.target.value, activeWaterAccess, activeShock, activeYear, activePrimaryCereal)
              }
              disabled={isLoading}
              className="bg-zinc-900 border border-zinc-700 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-zinc-100 font-bold focus:border-zinc-500 outline-none cursor-pointer"
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
          <div className="flex items-center gap-2.5">
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">{t('simulation.waterAccessLabel', {}, 'Water:')}</span>
            <select
              value={activeWaterAccess}
              onChange={(e) =>
                handleConfigChange(activeSoilType, e.target.value, activeShock, activeYear, activePrimaryCereal)
              }
              disabled={isLoading}
              className="bg-zinc-900 border border-zinc-700 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-zinc-100 font-bold focus:border-zinc-500 outline-none cursor-pointer"
            >
              <option value="appoint">{t('options.water.appoint', {}, 'Supplementary Irrigation')}</option>
              <option value="bour_strict">{t('options.water.bour_strict', {}, 'Rainfed')}</option>
              <option value="bour">{t('options.water.bour', {}, 'Rainfed')}</option>
              <option value="irrigue_total">{t('options.water.irrigue_total', {}, 'Full Irrigation')}</option>
              <option value="irrigue">{t('options.water.irrigue', {}, 'Full Irrigation')}</option>
            </select>
          </div>

          {/* Stress Testing Shocks */}
          <div className="flex items-center gap-2.5">
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">{t('simulation.climateShockLabel', {}, 'Shock:')}</span>
            <div className="flex items-center gap-1.5 bg-zinc-900 p-1 rounded-xl border border-zinc-800">
              <button
                type="button"
                onClick={() => handleConfigChange(activeSoilType, activeWaterAccess, 'none')}
                className={`px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition cursor-pointer ${
                  activeShock === 'none'
                    ? 'bg-zinc-800 text-zinc-100 font-bold border border-zinc-700'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {t('options.shocks.none', {}, 'Baseline')}
              </button>
              <button
                type="button"
                onClick={() => handleConfigChange(activeSoilType, activeWaterAccess, 'drought_30pct')}
                className={`px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition flex items-center gap-1.5 cursor-pointer ${
                  activeShock === 'drought_30pct' || activeShock === 'drought'
                    ? 'bg-zinc-800 text-amber-300 font-bold border border-amber-500/40'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <CloudOff className="w-3.5 h-3.5 text-amber-400" /> {t('options.shocks.drought_30pct', {}, 'Drought (-30%)')}
              </button>
              <button
                type="button"
                onClick={() => handleConfigChange(activeSoilType, activeWaterAccess, 'heatwave_early_spring')}
                className={`px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition flex items-center gap-1.5 cursor-pointer ${
                  activeShock === 'heatwave_early_spring' || activeShock === 'heatwave'
                    ? 'bg-zinc-800 text-rose-300 font-bold border border-rose-500/40'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Flame className="w-3.5 h-3.5 text-rose-400" /> {t('options.shocks.heatwave_early_spring', {}, 'Heat (+3.5°C)')}
              </button>
              <button
                type="button"
                onClick={() => handleConfigChange(activeSoilType, activeWaterAccess, 'delayed_rains_winter')}
                className={`px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition flex items-center gap-1.5 cursor-pointer ${
                  activeShock === 'delayed_rains_winter' || activeShock === 'delayed_rain'
                    ? 'bg-zinc-800 text-purple-300 font-bold border border-purple-500/40'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Clock className="w-3.5 h-3.5 text-purple-400" /> {t('options.shocks.delayed_rains_winter', {}, 'Delayed')}
              </button>
            </div>
          </div>
        </div>

        {/* Live Observation Indicators */}
        {baseline?.crop_cycle_rain_gross_mm !== undefined && (
          <div className="hidden lg:flex items-center gap-3.5 text-xs sm:text-sm text-zinc-300 font-mono" dir="ltr">
            <span>
              {t('simulation.cycleRain', {}, 'Cycle Rain:')} <bdi className="text-white font-bold">{baseline.crop_cycle_rain_gross_mm} mm</bdi>
            </span>
            <span className="text-zinc-700">•</span>
            <span>
              {t('simulation.sowingSmap', {}, 'Sowing SMAP L4:')} <bdi className="text-white font-bold">{baseline.sowing_period_moisture_m3m3} m³/m³</bdi>
            </span>
          </div>
        )}
      </div>

      {/* ── MAIN FULL-SCREEN SCROLLABLE WORKBENCH ── */}
      <main className="flex-1 overflow-y-auto p-6 sm:p-10 pb-28 custom-scrollbar">
        <div className="max-w-[1720px] mx-auto space-y-8">
          
          {error && (
            <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-500/20 text-amber-200 text-sm flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 shrink-0 text-amber-400 mt-0.5" />
              <div>
                <strong className="font-bold block text-amber-300">{t('simulation.serviceNotice', {}, 'Simulation Engine Notice:')}</strong>
                <span className="text-zinc-300 mt-0.5 block">{error}</span>
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="py-40 flex flex-col items-center justify-center gap-5 text-center max-w-lg mx-auto">
              <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center shadow-xl">
                <Loader2 className="w-8 h-8 animate-spin text-zinc-200" />
              </div>
              <p className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                {t('simulation.loadingTitle', {}, 'Computing FAO-56 Soil Water Balance Simulation…')}
              </p>
              <p className="text-sm sm:text-base text-zinc-400 leading-relaxed">
                {t('simulation.loadingSubtitle', {}, 'Assimilating NASA SMAP L4 rootzone soil moisture and NASA POWER agroclimatology.')}
              </p>
            </div>
          ) : (
            <>
              {/* ── 1. KEY BIOPHYSICAL WATER BALANCE KPIS ── */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs sm:text-sm font-bold text-zinc-400 uppercase tracking-wider">
                    {t('simulation.kpiTitle', {}, 'Assimilated NASA Climatology & Rootzone Balances')}
                  </span>
                  <span className="text-xs text-zinc-500 font-mono">
                    NASA Harvest Season {baseline.harvest_year ? `${baseline.harvest_year - 1}–${baseline.harvest_year}` : `${activeYear - 1}–${activeYear}`}
                  </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {/* Card 1 */}
                  <div className="p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800 shadow-xl">
                    <div className="flex items-center justify-between text-zinc-400 text-xs font-bold uppercase tracking-wider mb-2.5">
                      <span>{t('simulation.sowingStoredWater', {}, 'Sowing Stored Water')}</span>
                      <Droplets className="w-4 h-4 text-zinc-400" />
                    </div>
                    <div className="text-4xl sm:text-5xl lg:text-6xl font-black font-mono text-white tracking-tight" dir="ltr">
                      <bdi className="tabular-nums">
                        {baseline.stored_rootzone_water_at_sowing_mm !== undefined
                          ? baseline.stored_rootzone_water_at_sowing_mm
                          : '—'}
                      </bdi>{' '}
                      <span className="text-base font-normal text-zinc-400">mm</span>
                    </div>
                    <span className="text-xs sm:text-sm text-zinc-300 font-medium block mt-2.5">
                      {t('simulation.aboveWiltingPoint', {}, 'Above permanent wilting point (0–100 cm)')}
                    </span>
                  </div>

                  {/* Card 2 */}
                  <div className="p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800 shadow-xl">
                    <div className="flex items-center justify-between text-zinc-400 text-xs font-bold uppercase tracking-wider mb-2.5">
                      <span>{t('simulation.evapDemandReduction', {}, 'Evap Demand Reduction')}</span>
                      <TrendingDown className="w-4 h-4 text-zinc-400" />
                    </div>
                    <div className="text-4xl sm:text-5xl lg:text-6xl font-black font-mono text-white tracking-tight" dir="ltr">
                      <bdi className="tabular-nums">
                        {baseline.evaporative_demand_reduction_mm !== undefined
                          ? baseline.evaporative_demand_reduction_mm
                          : '—'}
                      </bdi>{' '}
                      <span className="text-base font-normal text-zinc-400">mm</span>
                    </div>
                    <span className="text-xs sm:text-sm text-zinc-300 font-medium block mt-2.5" dir="ltr">
                      {t('simulation.evapSavedM3', {
                        val: baseline.evaporative_demand_reduction_m3_ha !== undefined
                          ? baseline.evaporative_demand_reduction_m3_ha
                          : '—'
                      }, `≈ ${baseline.evaporative_demand_reduction_m3_ha || '—'} m³/ha saved`)}
                    </span>
                  </div>

                  {/* Card 3 */}
                  <div className="p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800 shadow-xl">
                    <div className="flex items-center justify-between text-zinc-400 text-xs font-bold uppercase tracking-wider mb-2.5">
                      <span>{t('simulation.deficitReduction', {}, 'Deficit Reduction')}</span>
                      <ShieldCheck className="w-4 h-4 text-zinc-400" />
                    </div>
                    <div className="text-4xl sm:text-5xl lg:text-6xl font-black font-mono text-white tracking-tight" dir="ltr">
                      <bdi className="tabular-nums">
                        {baseline.simulated_water_deficit_reduction_mm !== undefined
                          ? baseline.simulated_water_deficit_reduction_mm
                          : '—'}
                      </bdi>{' '}
                      <span className="text-base font-normal text-zinc-400">mm</span>
                    </div>
                    <span className="text-xs sm:text-sm text-zinc-300 font-medium block mt-2.5">
                      {t('simulation.avoidsDrought', {}, 'Mitigates rootzone mid-season drought')}
                    </span>
                  </div>

                  {/* Card 4 */}
                  <div className="p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800 shadow-xl">
                    <div className="flex items-center justify-between text-zinc-400 text-xs font-bold uppercase tracking-wider mb-2.5">
                      <span>{t('simulation.totalAnnualRainfall', {}, 'Total Annual Rainfall')}</span>
                      <Info className="w-4 h-4 text-zinc-400" />
                    </div>
                    <div className="text-4xl sm:text-5xl lg:text-6xl font-black font-mono text-white tracking-tight" dir="ltr">
                      <bdi className="tabular-nums">
                        {baseline.annual_precipitation_mm !== undefined
                          ? baseline.annual_precipitation_mm
                          : '—'}
                      </bdi>{' '}
                      <span className="text-base font-normal text-zinc-400">mm</span>
                    </div>
                    <span className="text-xs sm:text-sm text-zinc-300 font-medium block mt-2.5" dir="ltr">
                      {baseline.recorded_hot_days !== undefined
                        ? t('simulation.hotDaysNotice', { days: baseline.recorded_hot_days }, `${baseline.recorded_hot_days} Hot Days (≥30°C)`)
                        : t('simulation.powerClimatology', {}, 'NASA POWER Climatology')}
                    </span>
                  </div>
                </div>
              </div>

              {/* ── 2. VISUAL WATER BUDGET COMPARATIVE BENCHMARK ── */}
              <div className="p-6 sm:p-7 rounded-2xl bg-zinc-900/40 border border-zinc-800 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <BarChart3 className="w-5 h-5 text-zinc-300" />
                    <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-zinc-200">
                      {t('simulation.benchmarkTitle', {}, 'Comparative Water Budget & Deficit Benchmark')}
                    </h3>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 sm:gap-5 text-xs sm:text-sm font-mono text-zinc-400">
                    <span className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-sm bg-zinc-600" /> {t('simulation.waterNeedEtc', {}, 'Water Need (ETc)')}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-sm bg-rose-500/80" /> {t('simulation.rootzoneDeficit', {}, 'Rootzone Deficit')}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-sm bg-emerald-500/80" /> {t('simulation.soilHealthScoreLabel', {}, 'Soil Health Score')}
                    </span>
                  </div>
                </div>

                {/* Comparative Visual Histogram */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-2">
                  {plans.map((p) => {
                    const isWinner = p.id === winnerId;
                    const needPct = Math.min(100, Math.round(((p.water_need_mm || 350) / maxWaterNeed) * 100));
                    const defPct = Math.min(100, Math.round(((p.water_deficit_mm || 50) / 120) * 100));

                    const planTitle = (language === 'ar' || language === 'darija')
                      ? (p.name_ar || p.name_localized || p.name_fr || p.name)
                      : language === 'fr'
                      ? (p.name_fr || p.name_localized || p.name)
                      : language === 'es'
                      ? (p.name_es || p.name_localized || p.name_fr || p.name)
                      : (p.name_en || p.name_localized || p.name_fr || p.name);

                    return (
                      <div
                        key={p.id}
                        className={`p-5 sm:p-6 rounded-2xl border transition ${
                          isWinner
                            ? 'bg-zinc-900/90 border-emerald-500/40 ring-1 ring-emerald-500/20'
                            : 'bg-zinc-950/60 border-zinc-800/80'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <span className="font-bold text-sm sm:text-base text-zinc-100 truncate">
                            {planTitle?.split(':')[0] || planTitle || p.id}
                          </span>
                          {isWinner && (
                            <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                              {t('simulation.optimalWinner', {}, 'RECOMMENDED')}
                            </span>
                          )}
                        </div>

                        {/* Bars */}
                        <div className="space-y-3.5 text-xs sm:text-sm font-mono">
                          {/* ETc Bar */}
                          <div>
                            <div className="flex justify-between text-xs sm:text-sm text-zinc-400 mb-1.5">
                              <span>{t('simulation.etcNeed', {}, 'ETc Need')}</span>
                              <span className="text-zinc-100 font-bold">{p.water_need_mm} mm</span>
                            </div>
                            <div className="w-full bg-zinc-800 h-3.5 rounded-full overflow-hidden" dir="ltr">
                              <div
                                className="bg-zinc-300 h-full rounded-full transition-all duration-700"
                                style={{ width: `${needPct}%` }}
                              />
                            </div>
                          </div>

                          {/* Deficit Bar */}
                          <div>
                            <div className="flex justify-between text-xs sm:text-sm text-zinc-400 mb-1.5">
                              <span>{t('simulation.deficitGap', {}, 'Deficit Gap')}</span>
                              <span className={p.water_deficit_mm > 40 ? 'text-rose-400 font-bold' : 'text-zinc-200 font-bold'}>
                                {p.water_deficit_mm} mm
                              </span>
                            </div>
                            <div className="w-full bg-zinc-800 h-3.5 rounded-full overflow-hidden" dir="ltr">
                              <div
                                className={`h-full rounded-full transition-all duration-700 ${
                                  p.water_deficit_mm > 40 ? 'bg-rose-500' : 'bg-emerald-500'
                                }`}
                                style={{ width: `${defPct}%` }}
                              />
                            </div>
                          </div>

                          {/* Soil Health Score */}
                          <div className="flex justify-between items-center pt-3 border-t border-zinc-800/80 text-xs sm:text-sm">
                            <span className="text-zinc-400 font-medium">{t('simulation.soilHealthScoreLabel', {}, 'Soil Health Score')}</span>
                            <span className="font-black text-white text-lg sm:text-xl">{p.soil_health_score}/100</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ── 3. COMPARATIVE SCENARIO EVALUATION WORKBENCH ── */}
              {activeViewMode === 'overview' ? (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="font-display text-lg sm:text-xl font-bold text-white">
                        {t('simulation.evalScenariosTitle', {}, 'Evaluated Crop Rotation Scenarios (FAO-56 Mass Balance)')}
                      </h2>
                      <p className="text-xs sm:text-sm text-zinc-400 mt-1">
                        {t('simulation.evalScenariosSubtitle', {}, 'Comparing Monoculture, Triennial Rotation, and Regenerative Agroecology.')}
                      </p>
                    </div>
                    <span className="text-xs sm:text-sm font-semibold text-emerald-400 flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 px-3.5 py-1.5 rounded-lg">
                      <Award className="w-4 h-4 text-emerald-400" /> {t('simulation.winnerPlanBadge', {}, 'Optimal Strategy Recommended')}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
                    {plans.map((plan) => {
                      const isWinner = plan.id === winnerId;
                      const isSelected = plan.id === currentSelectedPlan?.id;

                      const primaryTitle = (language === 'ar' || language === 'darija')
                        ? (plan.name_ar || plan.name_localized || plan.name_fr || plan.name)
                        : language === 'fr'
                        ? (plan.name_fr || plan.name_localized || plan.name)
                        : language === 'es'
                        ? (plan.name_es || plan.name_localized || plan.name_fr || plan.name)
                        : (plan.name_en || plan.name_localized || plan.name_fr || plan.name);

                      const localizedSummary = (language === 'ar' || language === 'darija')
                        ? (plan.summary_darija || plan.summary_localized || plan.summary)
                        : language === 'fr'
                        ? (plan.summary_fr || plan.summary_localized || plan.summary)
                        : language === 'es'
                        ? (plan.summary_es || plan.summary_localized || plan.summary)
                        : (plan.summary_en || plan.summary_localized || plan.summary);

                      return (
                        <div
                          key={plan.id}
                          onClick={() => setSelectedPlanId(plan.id)}
                          className={`p-6 sm:p-7 rounded-2xl border transition cursor-pointer flex flex-col justify-between ${
                            isWinner
                              ? 'bg-zinc-900/80 border-emerald-500/40 ring-1 ring-emerald-500/20'
                              : isSelected
                              ? 'bg-zinc-900/90 border-zinc-600'
                              : 'bg-zinc-900/40 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900/60'
                          }`}
                        >
                          <div>
                            {/* Plan Header + Badge */}
                            <div className="flex items-start justify-between gap-3 mb-4">
                              <h3 className="font-display text-lg sm:text-xl font-bold text-white leading-snug">{primaryTitle}</h3>
                              {isWinner && (
                                <span className="px-3 py-1 rounded-md text-xs font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5 shrink-0">
                                  <Award className="w-3.5 h-3.5 text-emerald-400" /> {t('simulation.optimalWinner', {}, 'Recommended')}
                                </span>
                              )}
                            </div>

                            {/* Crop Sequence Flow */}
                            <div className="flex flex-wrap items-center gap-2 mb-5">
                              {plan.rotation_sequence?.map((crop, idx) => {
                                const translatedCrop = resolveCropName(crop, t);
                                return (
                                  <React.Fragment key={idx}>
                                    <span className="px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-xs sm:text-sm font-mono font-semibold text-zinc-100">
                                      {idx + 1}. {translatedCrop}
                                    </span>
                                    {idx < (plan.rotation_sequence.length - 1) && (
                                      <span className="text-zinc-600 text-sm">➔</span>
                                    )}
                                  </React.Fragment>
                                );
                              })}
                            </div>

                            {/* Structured Core Metrics Table */}
                            <div className="space-y-3 pt-4 border-t border-zinc-800 text-sm sm:text-base">
                              <div className="flex items-center justify-between">
                                <span className="text-zinc-400 font-medium">{t('simulation.waterNeed', {}, 'Water Need (ETc):')}</span>
                                <bdi className="font-mono text-zinc-100 font-bold tabular-nums" dir="ltr">
                                  {plan.water_need_mm} mm
                                </bdi>
                              </div>
                              
                              <div className="flex items-center justify-between">
                                <span className="text-zinc-400 font-medium">{t('simulation.waterDeficit', {}, 'Water Deficit:')}</span>
                                <bdi
                                  className={`font-mono tabular-nums font-bold ${
                                    plan.water_deficit_mm > 40 ? 'text-rose-400' : 'text-zinc-100'
                                  }`}
                                  dir="ltr"
                                >
                                  {plan.water_deficit_mm} mm
                                </bdi>
                              </div>

                              {/* Water Stress Risk Bar */}
                              <div>
                                <div className="flex items-center justify-between text-xs sm:text-sm mb-1.5">
                                  <span className="text-zinc-400 font-medium">{t('simulation.droughtStressRisk', {}, 'Drought Stress Risk:')}</span>
                                  <bdi
                                    className={`tabular-nums font-mono font-bold ${
                                      plan.water_stress_risk_pct > 20
                                        ? 'text-rose-400'
                                        : plan.water_stress_risk_pct > 10
                                        ? 'text-amber-400'
                                        : 'text-zinc-200'
                                    }`}
                                    dir="ltr"
                                  >
                                    {plan.water_stress_risk_pct}%
                                  </bdi>
                                </div>
                                <div className="w-full bg-zinc-800 h-2 rounded-full overflow-hidden" dir="ltr">
                                  <div
                                    className={`h-full ${
                                      plan.water_stress_risk_pct > 20
                                        ? 'bg-rose-500'
                                        : plan.water_stress_risk_pct > 10
                                        ? 'bg-amber-400'
                                        : 'bg-emerald-400'
                                    }`}
                                    style={{ width: `${Math.min(100, Math.max(5, plan.water_stress_risk_pct * 3))}%` }}
                                  />
                                </div>
                              </div>

                              {/* Soil Health Score */}
                              <div className="flex items-center justify-between pt-1">
                                <span className="text-zinc-400 font-medium">{t('simulation.soilHealthScore', {}, 'Soil Health Score:')}</span>
                                <bdi className="font-mono font-extrabold text-white tabular-nums text-lg" dir="ltr">
                                  {plan.soil_health_score}/100
                                </bdi>
                              </div>
                            </div>

                            {/* Terroir Agronomic Synthesis */}
                            {localizedSummary && (
                              <div className="mt-5 p-4 sm:p-5 rounded-xl bg-zinc-950/80 border border-zinc-800 text-xs sm:text-sm text-zinc-200 leading-relaxed shadow-inner">
                                <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider block mb-2">
                                  {t('simulation.synthesisTitle', {}, 'Terroir Agronomic Synthesis:')}
                                </span>
                                {localizedSummary}
                              </div>
                            )}
                          </div>

                          {/* Pros / Cons Highlights */}
                          <div className="mt-5 pt-4 border-t border-zinc-800 text-xs sm:text-sm space-y-2.5">
                            {plan.pros?.slice(0, 4).map((pro, i) => (
                              <div key={i} className="text-zinc-200 flex items-start gap-2.5">
                                <span className="font-bold text-emerald-400 shrink-0 text-base leading-none mt-0.5">+</span>
                                <span className="leading-snug">{pro}</span>
                              </div>
                            ))}
                            {plan.cons?.slice(0, 3).map((con, i) => (
                              <div key={i} className="text-zinc-400 flex items-start gap-2.5">
                                <span className="font-bold text-rose-400 shrink-0 text-base leading-none mt-0.5">-</span>
                                <span className="leading-snug">{con}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                /* ── 4. TECHNICAL COMPARISON MATRIX VIEW ── */
                <div className="rounded-2xl bg-zinc-900/40 border border-zinc-800 overflow-hidden">
                  <div className="p-5 border-b border-zinc-800 flex items-center justify-between">
                    <div>
                      <h3 className="font-display font-bold text-base sm:text-lg text-white">
                        {t('simulation.matrix.title', {}, 'Technical Rotation Benchmark Matrix')}
                      </h3>
                      <p className="text-xs sm:text-sm text-zinc-400 mt-1">
                        {t('simulation.matrix.subtitle', {}, 'Exhaustive multi-variable agronomic comparison across all evaluated strategies.')}
                      </p>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs sm:text-sm text-left border-collapse font-sans">
                      <thead>
                        <tr className="border-b border-zinc-800 bg-zinc-950/80 text-zinc-400 font-mono text-xs">
                          <th className="p-4 font-semibold uppercase tracking-wider">{t('simulation.matrix.metricHeader', {}, 'Evaluation Metric')}</th>
                          {plans.map((p) => {
                            const planColTitle = (language === 'ar' || language === 'darija')
                              ? (p.name_ar || p.name_localized || p.name_fr || p.name)
                              : language === 'fr'
                              ? (p.name_fr || p.name_localized || p.name)
                              : language === 'es'
                              ? (p.name_es || p.name_localized || p.name_fr || p.name)
                              : (p.name_en || p.name_localized || p.name_fr || p.name);

                            return (
                              <th key={p.id} className="p-4 font-semibold">
                                <span className="text-white block font-sans font-bold text-sm sm:text-base">{planColTitle}</span>
                                {p.id === winnerId && (
                                  <span className="text-xs text-emerald-400 font-mono font-semibold block mt-0.5">{t('simulation.optimalWinner', {}, 'Recommended Strategy')}</span>
                                )}
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800 font-mono text-zinc-200">
                        <tr>
                          <td className="p-4 font-sans font-medium text-zinc-400">{t('simulation.matrix.cropSequence', {}, 'Crop Sequence (3 Years)')}</td>
                          {plans.map((p) => (
                            <td key={p.id} className="p-4 font-semibold">
                              {p.rotation_sequence?.map((c) => resolveCropName(c, t)).join(' ➔ ') || '—'}
                            </td>
                          ))}
                        </tr>
                        <tr>
                          <td className="p-4 font-sans font-medium text-zinc-400">{t('simulation.matrix.waterDemand', {}, 'Water Demand (ETc)')}</td>
                          {plans.map((p) => (
                            <td key={p.id} className="p-4 font-bold text-white text-base">
                              {p.water_need_mm} mm
                            </td>
                          ))}
                        </tr>
                        <tr>
                          <td className="p-4 font-sans font-medium text-zinc-400">{t('simulation.matrix.netDeficit', {}, 'Simulated Net Deficit')}</td>
                          {plans.map((p) => (
                            <td key={p.id} className={`p-4 font-bold text-base ${p.water_deficit_mm > 40 ? 'text-rose-400' : 'text-emerald-400'}`}>
                              {p.water_deficit_mm} mm
                            </td>
                          ))}
                        </tr>
                        <tr>
                          <td className="p-4 font-sans font-medium text-zinc-400">{t('simulation.matrix.droughtRisk', {}, 'Drought Vulnerability Risk')}</td>
                          {plans.map((p) => (
                            <td key={p.id} className="p-4 font-bold">
                              {p.water_stress_risk_pct}%
                            </td>
                          ))}
                        </tr>
                        <tr>
                          <td className="p-4 font-sans font-medium text-zinc-400">{t('simulation.matrix.soilHealth', {}, 'Soil Biological Health Score')}</td>
                          {plans.map((p) => (
                            <td key={p.id} className="p-4 font-extrabold text-white text-base">
                              {p.soil_health_score}/100
                            </td>
                          ))}
                        </tr>
                        <tr>
                          <td className="p-4 font-sans font-medium text-zinc-400">{t('simulation.matrix.evapSavings', {}, 'Evaporative Water Savings')}</td>
                          {plans.map((p) => (
                            <td key={p.id} className="p-4 text-emerald-400 font-bold">
                              {p.evaporative_demand_reduction_mm ? `+${p.evaporative_demand_reduction_mm} mm` : t('simulation.matrix.baselineZero', {}, '0 mm (Baseline)')}
                            </td>
                          ))}
                        </tr>
                        <tr>
                          <td className="p-4 font-sans font-medium text-zinc-400">{t('simulation.matrix.nitrogenFixation', {}, 'Biological Nitrogen Fixation')}</td>
                          {plans.map((p) => (
                            <td key={p.id} className="p-4 font-sans">
                              {p.id === 'plan_agroecologie' ? t('simulation.matrix.bnfHigh', {}, 'High (Legumes + Cover Crop)') : p.id === 'plan_rotation_triennale' ? t('simulation.matrix.bnfModerate', {}, 'Moderate (Legumes)') : t('simulation.matrix.bnfZero', {}, 'Zero (Monoculture N-Depleting)')}
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── 5. EXPERT CONSENSUS TRIBUNAL & VERIFICATION FOOTER ── */}
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 pt-3">
                
                {/* Left 2 Cols: Expert Panel Consensus */}
                {tribunal.length > 0 && (
                  <div className="xl:col-span-2 p-6 rounded-2xl bg-zinc-900/30 border border-zinc-800 space-y-4">
                    <div>
                      <h3 className="font-display text-base sm:text-lg font-bold text-white flex items-center gap-2.5">
                        <Scale className="w-5 h-5 text-zinc-300" />
                        {t('simulation.tribunalTitle', {}, 'Scientific Panel Consensus (Multi-Perspective Evaluation)')}
                      </h3>
                      <p className="text-xs sm:text-sm text-zinc-400 mt-1">
                        {t('simulation.tribunalSubtitle', {}, 'Independent cross-examination grounded in NASA Earth observations and FAO-56 physics.')}
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                            className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 hover:border-zinc-700 transition space-y-2.5 text-xs sm:text-sm"
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <span className="font-bold text-white block text-sm">
                                  {agent.agent_role}
                                </span>
                                <span className="text-xs text-zinc-400 font-mono">
                                  {agent.agent_name}
                                </span>
                              </div>
                              {getStanceBadge(agent.stance)}
                            </div>

                            {/* Argument text */}
                            <div className="p-3 rounded-lg bg-zinc-950/70 text-xs sm:text-sm text-zinc-200 leading-relaxed border border-zinc-800">
                              {agentArgument}
                            </div>

                            {/* Key evidence note */}
                            {agent.key_evidence && (
                              <div className="text-xs text-zinc-400 font-mono flex items-start gap-1.5">
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

                {/* Right 1 Col: Overall Decision Synthesis & Physical Transparency */}
                <div className="space-y-4">
                  {/* Synthesis Box */}
                  {(simulationData?.overall_synthesis_localized || simulationData?.overall_synthesis_darija || simulationData?.synthesis) && (
                    <div className="p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800 text-xs sm:text-sm text-zinc-200 leading-relaxed">
                      <span className="font-bold text-white block mb-2 uppercase text-xs tracking-wider">
                        {t('simulation.finalSynthesisTitle', {}, 'Final Agronomic Decision Synthesis')}
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

                  {/* Physical Mass Balance & Transparency */}
                  <div className="p-5 rounded-2xl bg-zinc-900/30 border border-zinc-800 text-xs sm:text-sm text-zinc-400 space-y-3.5">
                    <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                      <span className="font-semibold text-zinc-200 flex items-center gap-2">
                        <Cpu className="w-4 h-4 text-zinc-400" />
                        {t('simulation.massBalanceResidual', {}, 'Mass Balance Residual:')}
                      </span>
                      <bdi className="font-mono text-white px-2.5 py-1 rounded-md bg-zinc-900 border border-zinc-800 text-xs font-bold tabular-nums">
                        {formattedResidual}
                      </bdi>
                    </div>

                    <div>
                      <span className="text-xs font-bold uppercase tracking-wider text-zinc-400 block mb-2">
                        {t('simulation.dataSources', {}, 'Assimilated Datasets')}
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {(simulationData?.sources_used || [
                          'NASA SMAP L4 SPL4SMGP V008',
                          'NASA POWER Climatology',
                          'FAO-56 Penman-Monteith Rootzone Engine',
                        ]).map((src, idx) => (
                          <span
                            key={idx}
                            className="px-2.5 py-1 rounded-md bg-zinc-900 text-zinc-300 border border-zinc-800 text-xs font-mono"
                          >
                            {src}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            </>
          )}

        </div>
      </main>
    </div>
  );
}
