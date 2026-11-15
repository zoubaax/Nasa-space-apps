import React, { useState } from 'react';
import {
  TbLeaf,
  TbDroplet,
  TbCloudRain,
  TbSun,
  TbX,
  TbArrowRight,
  TbArrowLeft,
  TbCheck,
  TbInfoCircle,
  TbLayersLinked,
  TbLoader2,
  TbAlertTriangle,
  TbPlant,
  TbSparkles,
} from 'react-icons/tb';
import { fetchVariableExplanation } from '../../utils/geo';
import { useTranslation } from '../../context/LanguageContext';

export default function FieldTelemetryCard({
  locationData,
  telemetry,
  selectedYear = 2025,
  onYearChange,
  onEvaluateRotation,
  onClose,
}) {
  const { t, language, isRtl } = useTranslation();

  if (!locationData) return null;

  const lat = locationData.lat;
  const lng = locationData.lng;
  const name = locationData.name || t('telemetry.fieldLocked', {}, 'Selected Field Coordinate');
  const isLoading = telemetry?.isLoading;

  const [activeExplanation, setActiveExplanation] = useState(null);
  const [, setIsExplaining] = useState(false);

  const handleExplain = async (variableId, value, fallbackTitle) => {
    if (value === null || value === undefined) return;
    setIsExplaining(true);
    setActiveExplanation({
      isLoading: true,
      title: fallbackTitle,
      selected_value: value,
    });
    try {
      const data = await fetchVariableExplanation(variableId, value, lat, lng, selectedYear, language);
      if (data) {
        setActiveExplanation(data);
      } else {
        setActiveExplanation({
          title: fallbackTitle,
          display_value: `${value}`,
          what: t('telemetry.assimilatedNotice', {}, 'Environmental and agricultural observation indicator from NASA satellites.'),
          why_agri: t('hud.missionSubtitle', {}, 'Assists growers in tracking soil moisture and plant stress with scientific accuracy.'),
          interpretation: `${t('telemetry.assimilatedTitle', {}, 'Assimilated NASA observation')}: ${value}.`,
        });
      }
    } catch (err) {
      console.warn('Explain failed:', err);
      setActiveExplanation({
        title: fallbackTitle,
        display_value: `${value}`,
        interpretation: t('common.error', {}, 'Temporarily unable to connect to the agro-intelligence engine.'),
      });
    } finally {
      setIsExplaining(false);
    }
  };

  const ArrowIcon = isRtl ? TbArrowLeft : TbArrowRight;

  return (
    <div
      className={`absolute top-20 ${isRtl ? 'left-5' : 'right-5'} z-30 w-96 max-w-[calc(100vw-2.5rem)] max-h-[calc(100vh-6.5rem)] flex flex-col rounded-3xl bg-zinc-950/90 border border-cyan-500/30 backdrop-blur-2xl shadow-[0_0_40px_rgba(6,182,212,0.2)] text-white font-sans animate-fade-in-right overflow-hidden select-none`}
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      {/* ── Header ── */}
      <div className="relative p-5 pb-4 border-b border-zinc-800/80 bg-gradient-to-b from-cyan-950/30 to-transparent">
        <button
          onClick={onClose}
          type="button"
          className={`absolute top-4 ${isRtl ? 'left-4' : 'right-4'} p-1.5 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-white transition cursor-pointer`}
          title={t('common.close', {}, 'Minimize Card')}
        >
          <TbX className="w-4 h-4" />
        </button>

        <div className="flex flex-wrap items-center gap-1.5 mb-1">
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            <TbCheck className="w-3 h-3" /> {t('telemetry.fieldLocked', {}, 'Field Locked')}
          </span>
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
            <TbLayersLinked className="w-3 h-3" />
            {telemetry?.isRegionalSmap
              ? `${t('telemetry.regionalSmap', {}, 'Regional SMAP')} (~${telemetry.smapDistanceKm || 200} km)`
              : t('telemetry.smapGrid', {}, 'SMAP 9km Grid')}
          </span>
          {isLoading ? (
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono bg-cyan-500/20 text-cyan-300 border border-cyan-400/40">
              <TbLoader2 className="w-3 h-3 animate-spin text-cyan-400" />
              <span>{t('telemetry.acquiringNasa', {}, 'Acquiring NASA…')}</span>
            </span>
          ) : telemetry?.isSmapLoading ? (
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono bg-cyan-500/20 text-cyan-300 border border-cyan-400/40">
              <TbLoader2 className="w-3 h-3 animate-spin text-cyan-400" />
              <span>{t('telemetry.streamingSmap', {}, 'Streaming SMAP…')}</span>
            </span>
          ) : telemetry?.isLiveBackend ? (
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/40">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> {t('telemetry.liveNasaFeed', {}, 'Live NASA Feed')}
            </span>
          ) : (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/30">
              {t('telemetry.observationNotice', {}, 'Observation Notice')}
            </span>
          )}
        </div>

        <h2 className={`text-base font-bold text-zinc-100 truncate ${isRtl ? 'pl-6' : 'pr-6'}`}>{name}</h2>
        <div className="flex items-center gap-3 text-xs font-mono text-zinc-400 mt-1" dir="ltr">
          <span>{lat >= 0 ? `${lat.toFixed(4)}°N` : `${Math.abs(lat).toFixed(4)}°S`}</span>
          <span>•</span>
          <span>{lng >= 0 ? `${lng.toFixed(4)}°E` : `${Math.abs(lng).toFixed(4)}°W`}</span>
        </div>

        {/* Dynamic Year Selector (Multi-Year NASA Observations) */}
        <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-zinc-800/80">
          <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-semibold flex items-center gap-1">
            <span>{t('common.year', {}, 'NASA Year')}:</span>
          </span>
          <div className="flex items-center gap-1 bg-zinc-900/90 p-0.5 rounded-xl border border-zinc-800" dir="ltr">
            {[2021, 2022, 2023, 2024, 2025].map((yr) => (
              <button
                key={yr}
                type="button"
                onClick={() => onYearChange && onYearChange(yr)}
                disabled={isLoading}
                className={`px-2 py-0.5 rounded-lg text-[10px] font-mono transition-all cursor-pointer ${
                  selectedYear === yr
                    ? 'bg-cyan-500 text-zinc-950 font-bold shadow-[0_0_10px_rgba(6,182,212,0.4)]'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
                }`}
                title={`Fetch NASA observations for ${yr}`}
              >
                {yr}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Scrollable Body ── */}
      <div className="p-5 space-y-4 overflow-y-auto max-h-[60vh] custom-scrollbar text-xs">
        
        {/* Loading Skeleton */}
        {isLoading && (
          <div className="space-y-3 py-4">
            <div className="flex items-center justify-center gap-2 text-cyan-400 font-mono text-xs animate-pulse">
              <TbLoader2 className="w-4 h-4 animate-spin" />
              <span>{t('telemetry.acquiringNasa', {}, 'Querying NASA Earth Observation API…')}</span>
            </div>
            <div className="h-14 rounded-2xl bg-zinc-900/60 border border-zinc-800 animate-pulse" />
            <div className="h-20 rounded-2xl bg-zinc-900/60 border border-zinc-800 animate-pulse" />
            <div className="h-20 rounded-2xl bg-zinc-900/60 border border-zinc-800 animate-pulse" />
          </div>
        )}

        {/* Observation Warning / Offline Notice */}
        {!isLoading && !telemetry?.isLiveBackend && (
          <div className="p-3.5 rounded-2xl bg-amber-950/40 border border-amber-500/40 text-amber-200 text-xs flex items-start gap-2.5">
            <TbAlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold block text-amber-300">{t('telemetry.observationNotice', {}, 'Observation Notice')}</span>
              <p className="text-[11px] text-zinc-300 mt-0.5">
                {telemetry?.error || t('telemetry.noLandData', {}, 'No land-based NASA agroclimatology observations at this coordinate.')}
              </p>
              <p className="text-[10px] text-zinc-400 mt-1">
                {t('telemetry.tipTerrestrial', {}, 'Tip: Click on terrestrial agricultural land or use the location search bar to fly to a farm.')}
              </p>
            </div>
          </div>
        )}

        {/* Live Satellite Indicators */}
        {!isLoading && telemetry?.isLiveBackend && (
          <>
            {/* Environmental Summary Banner */}
            <div className="p-3 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 font-mono text-[11px] text-zinc-300 flex items-start gap-2.5">
              <TbInfoCircle className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-cyan-300">{t('telemetry.climaticClassification', {}, 'Climatic Classification:')}</span>{' '}
                <span className="text-zinc-200 font-bold">{telemetry.climateZone}</span>
                <p className="text-zinc-400 text-[10px] mt-0.5">
                  {t('telemetry.assimilatedNotice', {}, 'Assimilated from NASA POWER daily agroclimatology & SMAP L4 observations.')}
                </p>
              </div>
            </div>

            {/* NASA Satellite Evidence Tiles */}
            <div className="space-y-2.5">
              <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-semibold block">
                {t('telemetry.assimilatedTitle', {}, 'NASA Earth Observations (Assimilated)')}
              </span>

              {/* SMAP L4 Tile */}
              {telemetry.smapMoistureM3 !== null ? (
                <div
                  onClick={() => handleExplain('sm_rootzone', telemetry.smapMoistureM3, t('telemetry.smapTitle', {}, 'SMAP L4 Soil Moisture'))}
                  className="p-3 rounded-xl bg-zinc-900/50 border border-cyan-500/20 hover:border-cyan-500/50 hover:bg-zinc-900/80 transition cursor-pointer group"
                  title={t('telemetry.explainBtn', {}, 'Click to explain via AI')}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <div className="p-1 rounded-md bg-cyan-500/10 text-cyan-400 group-hover:bg-cyan-500/20 transition">
                        <TbDroplet className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="font-semibold text-zinc-200">{t('telemetry.smapTitle', {}, 'SMAP L4 Soil Moisture')}</span>
                        <span className="text-[9px] font-mono text-zinc-400 block">
                          {telemetry.isRegionalSmap
                            ? `SPL4SMGP V8 · ${t('telemetry.regionalSmap', {}, 'Regional Ref')} (~${telemetry.smapDistanceKm || 200} km)`
                            : 'SPL4SMGP V8 · 9 km EASE-Grid'}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5" dir="ltr">
                      <span className="text-cyan-300 font-mono font-bold text-sm">
                        {telemetry.smapMoistureM3} <span className="text-[10px] font-normal text-zinc-400">{t('telemetry.m3m3', {}, 'm³/m³')}</span>
                      </span>
                    </div>
                  </div>
                  <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden" dir="ltr">
                    <div
                      className="bg-gradient-to-r from-amber-500 via-cyan-400 to-emerald-400 h-1.5 rounded-full transition-all duration-700"
                      style={{ width: `${Math.min(100, Math.max(5, (telemetry.smapMoistureM3 / 0.45) * 100))}%` }}
                    ></div>
                  </div>
                  <div className="flex items-center justify-between text-[9px] font-mono text-zinc-400 mt-1">
                    <span>{t('telemetry.rootZoneDepth', {}, 'Root-zone (0–100 cm depth)')}</span>
                    {telemetry.droughtPercentile !== null && (
                      <span className="text-cyan-400 font-semibold" dir="ltr">
                        {t('telemetry.droughtPctl', {}, 'Drought Pctl:')} {telemetry.droughtPercentile}%
                      </span>
                    )}
                  </div>
                  {telemetry.surfaceMoistureM3 !== null && (
                    <div className="flex items-center justify-between text-[9px] font-mono text-zinc-500 mt-0.5 border-t border-zinc-800/60 pt-1" dir="ltr">
                      <span>{t('telemetry.surfaceDepth', {}, 'Surface (0–5 cm):')} {telemetry.surfaceMoistureM3} {t('telemetry.m3m3', {}, 'm³/m³')}</span>
                      {telemetry.soilTempLayer1 !== null && (
                        <span>{t('telemetry.seedbedTemp', {}, 'Seedbed Temp:')} {telemetry.soilTempLayer1}{t('telemetry.celsius', {}, '°C')}</span>
                      )}
                    </div>
                  )}
                  <div className="flex items-center justify-end mt-1.5 pt-1 border-t border-zinc-800/50">
                    <span className="flex items-center gap-1 text-[10px] font-mono text-cyan-400 group-hover:text-cyan-300 font-semibold">
                      <span>{t('telemetry.explainBtn', {}, 'AI Parameter Analysis')}</span>
                      <ArrowIcon className="w-3 h-3 group-hover:translate-x-0.5 transition" />
                    </span>
                  </div>
                </div>
              ) : telemetry?.isSmapLoading ? (
                <div className="p-3 rounded-xl bg-zinc-900/40 border border-cyan-500/20 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-1 rounded-md bg-cyan-500/10 text-cyan-400">
                      <TbLoader2 className="w-4 h-4 animate-spin text-cyan-400" />
                    </div>
                    <div>
                      <span className="font-semibold text-zinc-300">{t('telemetry.smapTitle', {}, 'SMAP L4 Soil Moisture')}</span>
                      <span className="text-[10px] font-mono text-cyan-400 block animate-pulse">
                        {t('telemetry.queryingGee', {}, 'Querying GEE Level-4 Radar Assimilation…')}
                      </span>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-zinc-500">{t('telemetry.smapGrid', {}, '9 km Grid')}</span>
                </div>
              ) : null}

              {/* NASA POWER Rainfall Tile */}
              {telemetry.annualRainfallMm !== null ? (
                <div
                  onClick={() => handleExplain('precipitation_total_surface_flux', telemetry.annualRainfallMm, t('telemetry.rainfallTitle', {}, 'NASA POWER Precipitation'))}
                  className="p-3 rounded-xl bg-zinc-900/50 border border-blue-500/20 hover:border-blue-500/50 hover:bg-zinc-900/80 transition cursor-pointer group"
                  title={t('telemetry.explainBtn', {}, 'Click to explain via AI')}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1 rounded-md bg-blue-500/10 text-blue-400 group-hover:bg-blue-500/20 transition">
                        <TbCloudRain className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="font-semibold text-zinc-200">{t('telemetry.rainfallTitle', {}, 'NASA POWER Precipitation')}</span>
                        <span className="text-[9px] font-mono text-zinc-400 block">
                          {telemetry.dryDays !== null
                            ? `${telemetry.dryDays} ${t('telemetry.dryDays', {}, 'Dry Days (<1mm)')}`
                            : t('telemetry.dailyAgro', {}, 'Daily Agrometeorology')}
                        </span>
                      </div>
                    </div>
                    <span className="text-blue-300 font-mono font-bold text-sm" dir="ltr">
                      {telemetry.annualRainfallMm} <span className="text-[10px] font-normal text-zinc-400">{t('telemetry.mmyr', {}, 'mm/yr')}</span>
                    </span>
                  </div>
                  <div className="flex items-center justify-end mt-1.5 pt-1 border-t border-zinc-800/50">
                    <span className="flex items-center gap-1 text-[10px] font-mono text-blue-400 group-hover:text-blue-300 font-semibold">
                      <span>{t('telemetry.explainBtn', {}, 'AI Parameter Analysis')}</span>
                      <ArrowIcon className="w-3 h-3 group-hover:translate-x-0.5 transition" />
                    </span>
                  </div>
                </div>
              ) : null}

              {/* NASA POWER Temperature Tile */}
              {telemetry.meanTempC !== null ? (
                <div
                  onClick={() => handleExplain('surface_temp', telemetry.meanTempC, t('telemetry.tempTitle', {}, 'NASA POWER Temperature'))}
                  className="p-3 rounded-xl bg-zinc-900/50 border border-amber-500/20 hover:border-amber-500/50 hover:bg-zinc-900/80 transition cursor-pointer group"
                  title={t('telemetry.explainBtn', {}, 'Click to explain via AI')}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1 rounded-md bg-amber-500/10 text-amber-400 group-hover:bg-amber-500/20 transition">
                        <TbSun className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="font-semibold text-zinc-200">{t('telemetry.tempTitle', {}, 'NASA POWER Temperature')}</span>
                        <span className="text-[9px] font-mono text-zinc-400 block">
                          {telemetry.hotDays !== null
                            ? `${telemetry.hotDays} ${t('telemetry.heatDays', {}, 'Heat Days (≥30°C)')}`
                            : t('telemetry.meanAirTemp', {}, 'Mean Air Temperature')}
                        </span>
                      </div>
                    </div>
                    <span className="text-amber-300 font-mono font-bold text-sm" dir="ltr">
                      {telemetry.meanTempC} <span className="text-[10px] font-normal text-zinc-400">{t('telemetry.celsius', {}, '°C')}</span>
                    </span>
                  </div>
                  {(telemetry.minTempC !== null || telemetry.maxTempC !== null) && (
                    <div className="flex items-center justify-between text-[9px] font-mono text-zinc-500 mt-1 border-t border-zinc-800/60 pt-1" dir="ltr">
                      <span>{t('telemetry.minMaxTemp', { min: telemetry.minTempC, max: telemetry.maxTempC }, `Min: ${telemetry.minTempC}°C • Max: ${telemetry.maxTempC}°C`)}</span>
                      {telemetry.solarRadiation !== null && (
                        <span>{t('telemetry.solarRadiation', { rad: telemetry.solarRadiation }, `Solar: ${telemetry.solarRadiation} MJ/m²`)}</span>
                      )}
                    </div>
                  )}
                  <div className="flex items-center justify-end mt-1.5 pt-1 border-t border-zinc-800/50">
                    <span className="flex items-center gap-1 text-[10px] font-mono text-amber-400 group-hover:text-amber-300 font-semibold">
                      <span>{t('telemetry.explainBtn', {}, 'AI Parameter Analysis')}</span>
                      <ArrowIcon className="w-3 h-3 group-hover:translate-x-0.5 transition" />
                    </span>
                  </div>
                </div>
              ) : null}

              {/* Satellite Vegetation / Canopy State */}
              {(telemetry.vegetationGreenness !== null || telemetry.leafAreaIndex !== null) && (
                <div
                  onClick={() => handleExplain('vegetation_greenness_fraction', telemetry.vegetationGreenness || 30.0, t('telemetry.canopyTitle', {}, 'Vegetation Canopy'))}
                  className="p-3 rounded-xl bg-zinc-900/50 border border-emerald-500/20 hover:border-emerald-500/50 hover:bg-zinc-900/80 transition cursor-pointer group"
                  title={t('telemetry.explainBtn', {}, 'Click to explain via AI')}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1 rounded-md bg-emerald-500/10 text-emerald-400 group-hover:bg-emerald-500/20 transition">
                        <TbPlant className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="font-semibold text-zinc-200">{t('telemetry.canopyTitle', {}, 'Vegetation Canopy')}</span>
                        <span className="text-[9px] font-mono text-zinc-400 block">
                          {t('telemetry.smapBiosphere', {}, 'NASA SMAP L4 Biosphere Fluxes')}
                        </span>
                      </div>
                    </div>
                    <div className="text-right" dir="ltr">
                      {telemetry.vegetationGreenness !== null && (
                        <span className="text-emerald-300 font-mono font-bold text-xs block">
                          {telemetry.vegetationGreenness}% {t('telemetry.greenness', {}, 'Greenness')}
                        </span>
                      )}
                      {telemetry.leafAreaIndex !== null && (
                        <span className="text-zinc-400 font-mono text-[10px]">
                          {t('telemetry.laiVal', { val: telemetry.leafAreaIndex }, `LAI: ${telemetry.leafAreaIndex} m²/m²`)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-end mt-1.5 pt-1 border-t border-zinc-800/50">
                    <span className="flex items-center gap-1 text-[10px] font-mono text-emerald-400 group-hover:text-emerald-300 font-semibold">
                      <span>{t('telemetry.explainBtn', {}, 'AI Parameter Analysis')}</span>
                      <ArrowIcon className="w-3 h-3 group-hover:translate-x-0.5 transition" />
                    </span>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

      </div>

      {/* ── Footer / Call to Action ── */}
      <div className="p-4 pt-3 border-t border-zinc-800/80 bg-zinc-950/60">
        <button
          onClick={() => onEvaluateRotation(locationData, telemetry)}
          disabled={isLoading}
          type="button"
          className="flex items-center justify-center gap-2.5 w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white font-mono text-xs font-bold transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)] cursor-pointer disabled:opacity-50"
        >
          <TbLeaf className="w-4 h-4 shrink-0" />
          <span>{t('telemetry.evaluateRotationBtn', {}, 'Evaluate Climate-Adaptive Rotations')}</span>
          <ArrowIcon className="w-4 h-4 shrink-0" />
        </button>
      </div>

      {/* ── Slide-Over AI Explanation Drawer ── */}
      {activeExplanation && (
        <div
          className="absolute inset-0 z-50 bg-zinc-950/95 backdrop-blur-2xl flex flex-col p-5 overflow-y-auto custom-scrollbar animate-fade-in text-white select-text"
          dir={isRtl ? 'rtl' : 'ltr'}
        >
          {/* Drawer Header */}
          <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                <TbSparkles className="w-4 h-4 text-cyan-400" />
              </div>
              <div className="truncate pr-2">
                <h3 className="text-xs font-bold text-zinc-100 truncate">
                  {activeExplanation.name_localized || activeExplanation.title || activeExplanation.name_fr || activeExplanation.name_en || t('explain.title', {}, 'Satellite Explanation')}
                </h3>
                <span className="text-[10px] font-mono text-cyan-400 font-semibold" dir="ltr">
                  {activeExplanation.display_value || `${activeExplanation.selected_value ?? ''}`}
                </span>
              </div>
            </div>
            <button
              onClick={() => setActiveExplanation(null)}
              type="button"
              className="p-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white transition cursor-pointer shrink-0"
              title={t('common.close', {}, 'Close')}
            >
              <TbX className="w-4 h-4" />
            </button>
          </div>

          {/* Drawer Body */}
          <div className="py-4 space-y-3.5 text-xs flex-1">
            {activeExplanation.isLoading ? (
              <div className="py-12 flex flex-col items-center justify-center gap-3 text-center">
                <TbLoader2 className="w-6 h-6 animate-spin text-cyan-400" />
                <span className="font-mono text-cyan-300 text-xs animate-pulse">
                  {t('explain.analyzingText', {}, 'Consulting AI and analyzing NASA satellite observations…')}
                </span>
              </div>
            ) : (
              <>
                {/* Main AI Interpretation */}
                {activeExplanation.interpretation && (
                  <div className="p-3.5 rounded-2xl bg-gradient-to-b from-cyan-950/40 to-zinc-900/60 border border-cyan-500/30 text-zinc-200 text-xs leading-relaxed">
                    <span className="text-[10px] font-mono text-cyan-300 font-bold block mb-1">
                      {t('explain.directAnalysis', {}, '★ Direct Agronomic Analysis (Gemini AI):')}
                    </span>
                    {activeExplanation.interpretation}
                  </div>
                )}

                {/* What is this variable */}
                {activeExplanation.what && (
                  <div className="p-3 rounded-xl bg-zinc-900/50 border border-zinc-800/80 text-zinc-300 text-xs leading-relaxed">
                    <span className="text-[10px] font-mono text-zinc-400 font-semibold block mb-0.5">
                      {t('explain.whatIsThis', {}, 'What does this indicator measure?')}
                    </span>
                    {activeExplanation.what}
                  </div>
                )}

                {/* Why it matters to farmers */}
                {activeExplanation.why_agri && (
                  <div className="p-3 rounded-xl bg-zinc-900/50 border border-emerald-500/20 text-zinc-300 text-xs leading-relaxed">
                    <span className="text-[10px] font-mono text-emerald-400 font-semibold block mb-0.5">
                      {t('explain.whyMatters', {}, 'Why is it critical for your soil?')}
                    </span>
                    {activeExplanation.why_agri}
                  </div>
                )}

                {/* Temporal guidance / action */}
                {activeExplanation.temporal_change && (
                  <div className="p-3 rounded-xl bg-zinc-900/50 border border-amber-500/20 text-zinc-300 text-xs leading-relaxed">
                    <span className="text-[10px] font-mono text-amber-300 font-semibold block mb-0.5">
                      {t('explain.adviceAction', {}, 'Agronomic Guidance & Action:')}
                    </span>
                    {activeExplanation.temporal_change}
                  </div>
                )}

                {/* Scientific Caveat note */}
                {(activeExplanation.caveat_note || activeExplanation.source) && (
                  <div className="p-2.5 rounded-xl bg-zinc-900/30 border border-zinc-800 text-[10px] text-zinc-400 font-mono leading-normal">
                    <span className="font-semibold text-zinc-500 block mb-0.5">
                      {t('explain.scientificNote', {}, 'Scientific Evidence Note (NASA):')}
                    </span>
                    {activeExplanation.caveat_note || activeExplanation.source}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Drawer Footer */}
          <div className="mt-auto pt-3 border-t border-zinc-800">
            <button
              onClick={() => setActiveExplanation(null)}
              type="button"
              className="w-full py-2 px-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-mono text-xs transition cursor-pointer"
            >
              {t('explain.closeDrawer', {}, 'Close Analysis')}
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
