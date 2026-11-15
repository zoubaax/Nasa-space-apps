import React, { useState } from 'react';
import {
  Droplets,
  CloudRain,
  Sun,
  Sprout,
  X,
  ArrowRight,
  ArrowLeft,
  Radio,
  Activity,
  Compass,
  Loader2,
  AlertTriangle,
  Sparkles,
  Cpu,
} from 'lucide-react';
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
  const [activeTab, setActiveTab] = useState('soil'); // 'soil' | 'climate' | 'canopy'

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

  const ArrowIcon = isRtl ? ArrowLeft : ArrowRight;

  return (
    <div
      className={`absolute top-20 ${isRtl ? 'left-4 sm:left-6' : 'right-4 sm:right-6'} z-30 w-[400px] max-w-[calc(100vw-2rem)] max-h-[calc(100vh-6rem)] flex flex-col rounded-2xl bg-white/95 border border-slate-200/90 backdrop-blur-2xl shadow-[0_20px_60px_-15px_rgba(15,23,42,0.25),0_0_0_1px_rgba(0,0,0,0.03)] text-slate-800 font-body overflow-hidden select-none transition-all duration-300`}
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      {/* ── Top Subtle Brand Accent Line ── */}
      <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 pointer-events-none" />

      {/* ── Header Section ── */}
      <div className="relative p-4 sm:p-5 pb-3.5 border-b border-slate-100 bg-slate-50/50">
        {/* Dismiss Button */}
        <button
          onClick={onClose}
          type="button"
          className={`absolute top-4 ${isRtl ? 'left-4' : 'right-4'} p-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-400 hover:text-slate-700 border border-slate-200 transition cursor-pointer shadow-xs`}
          title={t('common.close', {}, 'Minimize Card')}
        >
          <X className="w-3.5 h-3.5" />
        </button>

        {/* Status Badges */}
        <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/80">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            {t('telemetry.fieldLocked', {}, 'Target Locked')}
          </span>

          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-sky-50 text-sky-700 border border-sky-200/80">
            <Radio className="w-2.5 h-2.5 text-sky-600" />
            {telemetry?.isRegionalSmap
              ? `${t('telemetry.regionalSmap', {}, 'Regional SMAP')} (~${telemetry.smapDistanceKm || 200} km)`
              : t('telemetry.smapGrid', {}, 'SMAP 9km Grid')}
          </span>

          {isLoading ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-cyan-50 text-cyan-700 border border-cyan-200/80">
              <Loader2 className="w-2.5 h-2.5 animate-spin text-cyan-600" />
              <span>{t('telemetry.acquiringNasa', {}, 'Querying…')}</span>
            </span>
          ) : telemetry?.isLiveBackend ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-teal-50 text-teal-700 border border-teal-200/80">
              <Activity className="w-2.5 h-2.5 text-teal-600" />
              <span>{t('telemetry.liveNasaFeed', {}, 'Live Feed')}</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-800 border border-amber-200/80">
              <AlertTriangle className="w-2.5 h-2.5 text-amber-600" />
              <span>{t('telemetry.observationNotice', {}, 'Advisory')}</span>
            </span>
          )}
        </div>

        {/* Location Title (Display Heading) */}
        <h2 className={`font-display text-lg sm:text-xl font-bold text-slate-900 leading-snug truncate ${isRtl ? 'pl-8' : 'pr-8'}`}>
          {name}
        </h2>

        {/* Precision Coordinates */}
        <div className="flex items-center gap-2 text-xs text-slate-500 mt-1" dir="ltr">
          <Compass className="w-3.5 h-3.5 text-cyan-600" />
          <bdi className="font-mono tabular-nums font-medium text-slate-700">
            {lat >= 0 ? `${lat.toFixed(4)}° N` : `${Math.abs(lat).toFixed(4)}° S`}
          </bdi>
          <span className="text-slate-300">•</span>
          <bdi className="font-mono tabular-nums font-medium text-slate-700">
            {lng >= 0 ? `${lng.toFixed(4)}° E` : `${Math.abs(lng).toFixed(4)}° W`}
          </bdi>
        </div>

        {/* Year Selector */}
        <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-slate-200/70">
          <span className="text-[11px] font-semibold text-slate-500">
            {t('common.year', {}, 'NASA Orbit Year')}:
          </span>
          <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200/80" dir="ltr">
            {[2021, 2022, 2023, 2024, 2025].map((yr) => (
              <button
                key={yr}
                type="button"
                onClick={() => onYearChange && onYearChange(yr)}
                disabled={isLoading}
                className={`px-2 py-0.5 rounded text-[11px] font-mono transition-all cursor-pointer ${
                  selectedYear === yr
                    ? 'bg-white text-cyan-800 font-bold shadow-xs border border-slate-200'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                }`}
                title={`Fetch NASA observations for ${yr}`}
              >
                {yr}
              </button>
            ))}
          </div>
        </div>

        {/* ── Segmented Tabs ── */}
        <div className="grid grid-cols-3 gap-1 p-1 mt-3 rounded-xl bg-slate-100 border border-slate-200/80">
          <button
            type="button"
            onClick={() => setActiveTab('soil')}
            className={`py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'soil'
                ? 'bg-white text-cyan-900 shadow-xs border border-slate-200/90'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Droplets className="w-3.5 h-3.5 text-cyan-600" />
            <span>{t('common.soil', {}, 'Soil')}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('climate')}
            className={`py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'climate'
                ? 'bg-white text-amber-900 shadow-xs border border-slate-200/90'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <CloudRain className="w-3.5 h-3.5 text-amber-600" />
            <span>{t('common.climate', {}, 'Climate')}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('canopy')}
            className={`py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'canopy'
                ? 'bg-white text-emerald-900 shadow-xs border border-slate-200/90'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Sprout className="w-3.5 h-3.5 text-emerald-600" />
            <span>{t('common.canopy', {}, 'Canopy')}</span>
          </button>
        </div>
      </div>

      {/* ── Tab Content ── */}
      <div className="p-4 sm:p-5 space-y-3 overflow-y-auto max-h-[50vh] custom-scrollbar text-xs">
        
        {/* Loading State */}
        {isLoading && (
          <div className="space-y-3 py-6">
            <div className="flex items-center justify-center gap-2 text-cyan-700 font-medium text-xs animate-pulse">
              <Loader2 className="w-4 h-4 animate-spin text-cyan-600" />
              <span>{t('telemetry.acquiringNasa', {}, 'Interrogating NASA Earth Science Datasets…')}</span>
            </div>
            <div className="h-20 rounded-xl bg-slate-100 border border-slate-200 animate-pulse" />
            <div className="h-20 rounded-xl bg-slate-100 border border-slate-200 animate-pulse" />
          </div>
        )}

        {/* Observation Advisory Notice */}
        {!isLoading && !telemetry?.isLiveBackend && (
          <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-slate-700 text-xs flex items-start gap-3">
            <div className="p-1 rounded-md bg-amber-100 text-amber-700 shrink-0 mt-0.5">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <span className="font-semibold text-amber-900 block">
                {t('telemetry.observationNotice', {}, 'Observation Notice')}
              </span>
              <p className="text-slate-600 mt-1 leading-relaxed">
                {telemetry?.error || t('telemetry.noLandData', {}, 'No terrestrial NASA observation found at this coordinate.')}
              </p>
              <p className="text-[11px] text-slate-500 mt-2">
                Tip: Click on terrestrial agricultural land or use the location search box to fly to a farm.
              </p>
            </div>
          </div>
        )}

        {/* Live Observation Content */}
        {!isLoading && telemetry?.isLiveBackend && (
          <>
            {/* ── TAB 1: SOIL & ROOTZONE ── */}
            {activeTab === 'soil' && (
              <div className="space-y-3">
                {telemetry.smapMoistureM3 !== null && (
                  <div
                    onClick={() => handleExplain('sm_rootzone', telemetry.smapMoistureM3, t('telemetry.smapTitle', {}, 'SMAP L4 Root-Zone Moisture'))}
                    className="p-3.5 rounded-xl bg-slate-50/80 border border-slate-200/90 hover:border-cyan-400 hover:bg-white hover:shadow-sm transition cursor-pointer group"
                    title={t('telemetry.explainBtn', {}, 'Click for AI Analysis')}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-lg bg-cyan-100 text-cyan-700 group-hover:bg-cyan-200 transition">
                          <Droplets className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="font-semibold text-slate-900 text-xs block">{t('telemetry.smapTitle', {}, 'Root-Zone Moisture')}</span>
                          <span className="text-[10px] text-slate-500 font-medium">NASA SMAP L4 SPL4SMGP V8</span>
                        </div>
                      </div>
                      <div className="text-right" dir="ltr">
                        <bdi className="text-cyan-900 font-mono font-bold text-sm tabular-nums">
                          {telemetry.smapMoistureM3} <span className="text-[10px] font-normal text-slate-500">m³/m³</span>
                        </bdi>
                      </div>
                    </div>

                    {/* Progress Gauge */}
                    <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden my-2" dir="ltr">
                      <div
                        className="bg-gradient-to-r from-amber-500 via-cyan-500 to-emerald-500 h-1.5 rounded-full transition-all duration-700"
                        style={{ width: `${Math.min(100, Math.max(5, (telemetry.smapMoistureM3 / 0.45) * 100))}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-600 mt-1">
                      <span>{t('telemetry.rootZoneDepth', {}, '0–100 cm root layer')}</span>
                      {telemetry.droughtPercentile !== null && (
                        <span className="text-cyan-800 font-semibold" dir="ltr">
                          {t('telemetry.droughtPctl', {}, 'Drought:')} {telemetry.droughtPercentile}%
                        </span>
                      )}
                    </div>

                    {telemetry.surfaceMoistureM3 !== null && (
                      <div className="flex items-center justify-between text-[10px] text-slate-500 mt-2.5 pt-2 border-t border-slate-200" dir="ltr">
                        <span>Surface (0–5 cm): {telemetry.surfaceMoistureM3} m³/m³</span>
                        {telemetry.soilTempLayer1 !== null && (
                          <span>Seedbed: {telemetry.soilTempLayer1}°C</span>
                        )}
                      </div>
                    )}

                    <div className="flex items-center justify-end mt-2 pt-1.5 border-t border-slate-200">
                      <span className="flex items-center gap-1 text-[11px] font-semibold text-cyan-700 group-hover:text-cyan-800">
                        <Sparkles className="w-3 h-3 text-cyan-600" />
                        <span>{t('telemetry.explainBtn', {}, 'AI Agronomic Analysis')}</span>
                        <ArrowIcon className="w-3 h-3 group-hover:translate-x-0.5 transition" />
                      </span>
                    </div>
                  </div>
                )}

                {/* IoT Standby Sensor Card */}
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-slate-700 font-medium flex items-center gap-1.5 text-[11px]">
                      <Cpu className="w-3.5 h-3.5 text-emerald-600" /> In-Situ IoT Telemetry
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                      Standby
                    </span>
                  </div>
                  <p className="text-slate-500 text-[11px] leading-normal">
                    Supports RS485 / Modbus ESP32 ground sensor calibration.
                  </p>
                </div>
              </div>
            )}

            {/* ── TAB 2: CLIMATE FLUX (NASA POWER) ── */}
            {activeTab === 'climate' && (
              <div className="space-y-3">
                {telemetry.annualRainfallMm !== null && (
                  <div
                    onClick={() => handleExplain('precipitation_total_surface_flux', telemetry.annualRainfallMm, t('telemetry.rainfallTitle', {}, 'NASA POWER Precipitation'))}
                    className="p-3.5 rounded-xl bg-slate-50/80 border border-slate-200/90 hover:border-cyan-400 hover:bg-white hover:shadow-sm transition cursor-pointer group"
                    title={t('telemetry.explainBtn', {}, 'Click for AI Analysis')}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-lg bg-cyan-100 text-cyan-700 group-hover:bg-cyan-200 transition">
                          <CloudRain className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="font-semibold text-slate-900 text-xs block">{t('telemetry.rainfallTitle', {}, 'Annual Precipitation')}</span>
                          <span className="text-[10px] text-slate-500">
                            {telemetry.dryDays !== null ? `${telemetry.dryDays} Dry Days (<1mm)` : 'NASA POWER Climatology'}
                          </span>
                        </div>
                      </div>
                      <bdi className="text-cyan-900 font-mono font-bold text-sm tabular-nums" dir="ltr">
                        {telemetry.annualRainfallMm} <span className="text-[10px] font-normal text-slate-500">mm/yr</span>
                      </bdi>
                    </div>

                    <div className="flex items-center justify-end mt-2 pt-1.5 border-t border-slate-200">
                      <span className="flex items-center gap-1 text-[11px] font-semibold text-cyan-700 group-hover:text-cyan-800">
                        <Sparkles className="w-3 h-3 text-cyan-600" />
                        <span>{t('telemetry.explainBtn', {}, 'AI Agronomic Analysis')}</span>
                        <ArrowIcon className="w-3 h-3 group-hover:translate-x-0.5 transition" />
                      </span>
                    </div>
                  </div>
                )}

                {telemetry.meanTempC !== null && (
                  <div
                    onClick={() => handleExplain('surface_temp', telemetry.meanTempC, t('telemetry.tempTitle', {}, 'NASA POWER Temperature'))}
                    className="p-3.5 rounded-xl bg-slate-50/80 border border-slate-200/90 hover:border-amber-400 hover:bg-white hover:shadow-sm transition cursor-pointer group"
                    title={t('telemetry.explainBtn', {}, 'Click for AI Analysis')}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-lg bg-amber-100 text-amber-700 group-hover:bg-amber-200 transition">
                          <Sun className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="font-semibold text-slate-900 text-xs block">{t('telemetry.tempTitle', {}, 'Thermal Profile')}</span>
                          <span className="text-[10px] text-slate-500">
                            {telemetry.hotDays !== null ? `${telemetry.hotDays} Heat Days (≥30°C)` : 'Mean Surface Temp'}
                          </span>
                        </div>
                      </div>
                      <bdi className="text-amber-900 font-mono font-bold text-sm tabular-nums" dir="ltr">
                        {telemetry.meanTempC} <span className="text-[10px] font-normal text-slate-500">°C</span>
                      </bdi>
                    </div>

                    {(telemetry.minTempC !== null || telemetry.maxTempC !== null) && (
                      <div className="flex items-center justify-between text-[10px] text-slate-500 mt-2.5 pt-2 border-t border-slate-200" dir="ltr">
                        <span>Min: {telemetry.minTempC}°C • Max: {telemetry.maxTempC}°C</span>
                        {telemetry.solarRadiation !== null && (
                          <span>Solar: {telemetry.solarRadiation} MJ/m²</span>
                        )}
                      </div>
                    )}

                    <div className="flex items-center justify-end mt-2 pt-1.5 border-t border-slate-200">
                      <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-800 group-hover:text-amber-900">
                        <Sparkles className="w-3 h-3 text-amber-600" />
                        <span>{t('telemetry.explainBtn', {}, 'AI Agronomic Analysis')}</span>
                        <ArrowIcon className="w-3 h-3 group-hover:translate-x-0.5 transition" />
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── TAB 3: BIOSPHERE & CANOPY ── */}
            {activeTab === 'canopy' && (
              <div className="space-y-3">
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 flex items-start gap-2.5">
                  <div className="p-1 rounded-md bg-cyan-100 text-cyan-700 shrink-0 mt-0.5">
                    <Sprout className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-[11px] font-bold text-cyan-800 block">
                      {t('telemetry.climaticClassification', {}, 'Climate Zone')}
                    </span>
                    <span className="font-display text-sm text-slate-900 font-bold block mt-0.5">{telemetry.climateZone}</span>
                    <p className="text-slate-500 text-[11px] mt-1">
                      Assimilated from NASA POWER & SMAP L4 biosphere observations.
                    </p>
                  </div>
                </div>

                {(telemetry.vegetationGreenness !== null || telemetry.leafAreaIndex !== null) && (
                  <div
                    onClick={() => handleExplain('vegetation_greenness_fraction', telemetry.vegetationGreenness || 30.0, t('telemetry.canopyTitle', {}, 'Vegetation Canopy'))}
                    className="p-3.5 rounded-xl bg-slate-50/80 border border-slate-200/90 hover:border-emerald-400 hover:bg-white hover:shadow-sm transition cursor-pointer group"
                    title={t('telemetry.explainBtn', {}, 'Click for AI Analysis')}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-lg bg-emerald-100 text-emerald-700 group-hover:bg-emerald-200 transition">
                          <Sprout className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="font-semibold text-slate-900 text-xs block">{t('telemetry.canopyTitle', {}, 'Canopy State')}</span>
                          <span className="text-[10px] text-slate-500">SMAP Biosphere Carbon Fluxes</span>
                        </div>
                      </div>
                      <div className="text-right" dir="ltr">
                        {telemetry.vegetationGreenness !== null && (
                          <bdi className="text-emerald-900 font-mono font-bold text-xs block tabular-nums">
                            {telemetry.vegetationGreenness}% Greenness
                          </bdi>
                        )}
                        {telemetry.leafAreaIndex !== null && (
                          <bdi className="text-slate-500 font-mono text-[10px] tabular-nums">
                            LAI: {telemetry.leafAreaIndex} m²/m²
                          </bdi>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-end mt-2 pt-1.5 border-t border-slate-200">
                      <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 group-hover:text-emerald-800">
                        <Sparkles className="w-3 h-3 text-emerald-600" />
                        <span>{t('telemetry.explainBtn', {}, 'AI Agronomic Analysis')}</span>
                        <ArrowIcon className="w-3 h-3 group-hover:translate-x-0.5 transition" />
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

      </div>

      {/* ── Footer CTA Button (Vibrant Light Mode Gradient) ── */}
      <div className="p-3.5 sm:p-4 border-t border-slate-200 bg-white">
        <button
          onClick={() => onEvaluateRotation(locationData, telemetry)}
          disabled={isLoading}
          type="button"
          className="flex items-center justify-center gap-2 w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white font-semibold text-xs transition-all cursor-pointer disabled:opacity-50 shadow-[0_4px_16px_rgba(13,148,136,0.35)] group"
        >
          <Sprout className="w-4 h-4 shrink-0 transition-transform group-hover:rotate-12" />
          <span>{t('telemetry.evaluateRotationBtn', {}, 'Evaluate Climate-Adaptive Rotations')}</span>
          <ArrowIcon className="w-4 h-4 shrink-0 transition-transform group-hover:translate-x-1" />
        </button>
      </div>

      {/* ── Slide-Over AI Agronomic Analysis Drawer ── */}
      {activeExplanation && (
        <div
          className="absolute inset-0 z-50 bg-white/98 backdrop-blur-2xl flex flex-col p-4 sm:p-5 overflow-y-auto custom-scrollbar animate-fade-in text-slate-800 select-text"
          dir={isRtl ? 'rtl' : 'ltr'}
        >
          {/* Drawer Header */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-cyan-100 text-cyan-700">
                <Sparkles className="w-4 h-4 text-cyan-600" />
              </div>
              <div className="truncate pr-2">
                <h3 className="font-display text-sm font-bold text-slate-900 truncate">
                  {activeExplanation.name_localized || activeExplanation.title || activeExplanation.name_fr || activeExplanation.name_en || t('explain.title', {}, 'Satellite Observation')}
                </h3>
                <bdi className="text-xs font-mono text-cyan-800 font-semibold" dir="ltr">
                  {activeExplanation.display_value || `${activeExplanation.selected_value ?? ''}`}
                </bdi>
              </div>
            </div>
            <button
              onClick={() => setActiveExplanation(null)}
              type="button"
              className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 transition cursor-pointer shrink-0 border border-slate-200"
              title={t('common.close', {}, 'Close')}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Drawer Content */}
          <div className="py-3.5 space-y-3 text-xs flex-1">
            {activeExplanation.isLoading ? (
              <div className="py-12 flex flex-col items-center justify-center gap-3 text-center">
                <Loader2 className="w-6 h-6 animate-spin text-cyan-600" />
                <span className="font-medium text-cyan-800 text-xs animate-pulse">
                  {t('explain.analyzingText', {}, 'Analyzing NASA Earth observation telemetry…')}
                </span>
              </div>
            ) : (
              <>
                {/* AI Interpretation */}
                {activeExplanation.interpretation && (
                  <div className="p-3.5 rounded-xl bg-cyan-50 border border-cyan-200 text-slate-800 text-xs leading-relaxed">
                    <span className="font-bold text-cyan-900 block mb-1">
                      {t('explain.directAnalysis', {}, 'Agronomic Synthesis (AI Sentinel)')}
                    </span>
                    {activeExplanation.interpretation}
                  </div>
                )}

                {/* What is this variable */}
                {activeExplanation.what && (
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 text-xs leading-relaxed">
                    <span className="font-bold text-slate-900 block mb-1">
                      {t('explain.whatIsThis', {}, 'Biophysical Definition')}
                    </span>
                    {activeExplanation.what}
                  </div>
                )}

                {/* Why it matters */}
                {activeExplanation.why_agri && (
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-slate-800 text-xs leading-relaxed">
                    <span className="font-bold text-emerald-900 block mb-1">
                      {t('explain.whyMatters', {}, 'Soil & Crop Resilience Impact')}
                    </span>
                    {activeExplanation.why_agri}
                  </div>
                )}

                {/* Practical guidance */}
                {activeExplanation.temporal_change && (
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-slate-800 text-xs leading-relaxed">
                    <span className="font-bold text-amber-900 block mb-1">
                      {t('explain.adviceAction', {}, 'Actionable Field Strategy')}
                    </span>
                    {activeExplanation.temporal_change}
                  </div>
                )}

                {/* Scientific caveat */}
                {(activeExplanation.caveat_note || activeExplanation.source) && (
                  <div className="p-3 rounded-xl bg-slate-100 border border-slate-200 text-[11px] text-slate-600 leading-normal">
                    <span className="text-slate-800 font-bold block mb-1">
                      {t('explain.scientificNote', {}, 'NASA Scientific Verification Note')}
                    </span>
                    {activeExplanation.caveat_note || activeExplanation.source}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Drawer Footer */}
          <div className="mt-auto pt-3 border-t border-slate-200">
            <button
              onClick={() => setActiveExplanation(null)}
              type="button"
              className="w-full py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition cursor-pointer border border-slate-200"
            >
              {t('explain.closeDrawer', {}, 'Dismiss Analysis')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
