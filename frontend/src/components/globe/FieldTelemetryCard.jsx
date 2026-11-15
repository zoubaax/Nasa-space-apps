import React, { useState } from 'react';
import {
  Droplets,
  CloudRain,
  Sun,
  Sprout,
  X,
  ArrowRight,
  ArrowLeft,
  Compass,
  Loader2,
  AlertTriangle,
  Cpu,
  Layers,
  Maximize2,
  Activity,
  Radio,
  Power,
  Sparkles,
  MessageSquare,
} from 'lucide-react';
import { fetchVariableExplanation } from '../../utils/geo';
import { useTranslation } from '../../context/LanguageContext';

export default function FieldTelemetryCard({
  locationData,
  telemetry,
  selectedYear = 2025,
  onYearChange,
  onEvaluateRotation,
  onOpenChat,
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

  // In-Situ IoT Sensor Telemetry State (ESP32 Capacitive v1.2 on GPIO34)
  const [sensorData, setSensorData] = useState(null);
  const [isSimulatingSensor, setIsSimulatingSensor] = useState(false);

  React.useEffect(() => {
    let isMounted = true;
    const fetchSensor = async () => {
      try {
        const smapParam = telemetry?.smapSoilMoisture ? `?smap_rootzone=${telemetry.smapSoilMoisture}` : '';
        const res = await fetch(`http://127.0.0.1:8000/api/sensors/soil-moisture/latest${smapParam}`);
        if (res.ok && isMounted) {
          const data = await res.json();
          setSensorData(data);
        }
      } catch (err) {
        console.warn('Sensor fetch failed:', err);
      }
    };
    fetchSensor();
    // Continuous auto-detection polling every 3.5 seconds
    const interval = setInterval(fetchSensor, 3500);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [telemetry?.smapSoilMoisture]);

  const handleToggleBroadcast = async () => {
    setIsSimulatingSensor(true);
    try {
      const endpoint = sensorData?.is_broadcasting
        ? 'http://127.0.0.1:8000/api/sensors/edge-broadcast/stop'
        : 'http://127.0.0.1:8000/api/sensors/edge-broadcast/start';
      const res = await fetch(endpoint, { method: 'POST' });
      if (res.ok) {
        const smapParam = telemetry?.smapSoilMoisture ? `?smap_rootzone=${telemetry.smapSoilMoisture}` : '';
        const pollRes = await fetch(`http://127.0.0.1:8000/api/sensors/soil-moisture/latest${smapParam}`);
        if (pollRes.ok) {
          const data = await pollRes.json();
          setSensorData(data);
        }
      }
    } catch (err) {
      console.warn('Edge broadcast toggle failed:', err);
    } finally {
      setIsSimulatingSensor(false);
    }
  };

  const handleSimulateSensor = async (action) => {
    setIsSimulatingSensor(true);
    try {
      const res = await fetch('http://127.0.0.1:8000/api/sensors/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        const data = await res.json();
        setSensorData(data);
      }
    } catch (err) {
      console.warn('Sensor simulation failed:', err);
    } finally {
      setIsSimulatingSensor(false);
    }
  };

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

  const resolveClimateZone = (zone) => {
    if (!zone) return '—';
    const l = String(zone).toLowerCase();
    if (l.includes('sub-humid') || l.includes('subhumid')) return t('telemetry.climateZones.sub_humid', {}, zone);
    if (l.includes('mediterranean') || l.includes('méditerranéen')) return t('telemetry.climateZones.mediterranean', {}, zone);
    if (l.includes('semi-arid') || l.includes('semi-aride')) return t('telemetry.climateZones.semi_arid', {}, zone);
    if (l.includes('arid') || l.includes('aride')) return t('telemetry.climateZones.arid', {}, zone);
    if (l.includes('continental')) return t('telemetry.climateZones.continental', {}, zone);
    if (l.includes('humid') || l.includes('humide')) return t('telemetry.climateZones.humid', {}, zone);
    return zone;
  };

  return (
    <div
      className="absolute top-20 z-30 w-[calc(100vw-2rem)] sm:w-[440px] md:w-[460px] xl:w-[490px] max-w-[calc(100vw-2rem)] max-h-[calc(100vh-14.5rem)] flex flex-col rounded-2xl bg-[#0b0e14]/98 border border-zinc-800 backdrop-blur-2xl shadow-2xl text-zinc-100 font-body overflow-hidden select-none transition-all duration-300"
      style={{ right: '1.25rem', left: 'auto' }}
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      {/* ── Header Section ── */}
      <div className="relative p-5 pb-4 border-b border-zinc-800/90 bg-[#0f131c]/90 shrink-0">
        {/* Dismiss Button */}
        <button
          onClick={onClose}
          type="button"
          className={`absolute top-4 ${isRtl ? 'left-4' : 'right-4'} p-2 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 border border-zinc-800 transition cursor-pointer`}
          title={t('common.close', {}, 'Minimize Card')}
        >
          <X className="w-4 h-4" />
        </button>

        {/* Clean Status Metadata */}
        <div className="flex items-center gap-2 mb-2.5 text-xs text-zinc-400">
          <span className="inline-flex items-center gap-1.5 font-semibold text-zinc-200">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            {t('telemetry.fieldLocked', {}, 'Field Target Locked')}
          </span>
          <span className="text-zinc-700">•</span>
          <span className="font-mono text-zinc-400 text-xs">
            {telemetry?.isRegionalSmap
              ? `${t('telemetry.regionalSmap', {}, 'Regional SMAP')} (~${telemetry.smapDistanceKm || 200} km)`
              : t('telemetry.smapGrid', {}, 'SMAP 9km Grid')}
          </span>
          {telemetry?.isLiveBackend && (
            <>
              <span className="text-zinc-700">•</span>
              <span className="text-emerald-400 font-medium text-xs flex items-center gap-1">
                <Activity className="w-3.5 h-3.5 text-emerald-400" />
                {t('telemetry.liveNasaFeed', {}, 'Live Feed')}
              </span>
            </>
          )}
        </div>

        {/* Location Title */}
        <h2 className={`font-display text-xl sm:text-2xl font-bold text-white leading-snug truncate ${isRtl ? 'pl-10' : 'pr-10'}`}>
          {name}
        </h2>

        {/* Precision Coordinates */}
        <div className="flex items-center gap-2 text-xs sm:text-sm text-zinc-400 font-mono mt-1.5" dir="ltr">
          <Compass className="w-4 h-4 text-zinc-400 shrink-0" />
          <bdi className="tabular-nums font-semibold text-zinc-200">
            {lat >= 0 ? `${lat.toFixed(4)}° N` : `${Math.abs(lat).toFixed(4)}° S`}
          </bdi>
          <span className="text-zinc-600">•</span>
          <bdi className="tabular-nums font-semibold text-zinc-200">
            {lng >= 0 ? `${lng.toFixed(4)}° E` : `${Math.abs(lng).toFixed(4)}° W`}
          </bdi>
        </div>

        {/* Year Selector */}
        <div className="flex items-center justify-between mt-3.5 pt-3 border-t border-zinc-800">
          <span className="text-xs font-semibold text-zinc-400">
            {t('common.year', {}, 'Observation Year')}:
          </span>
          <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-xl border border-zinc-800" dir="ltr">
            {[2021, 2022, 2023, 2024, 2025].map((yr) => (
              <button
                key={yr}
                type="button"
                onClick={() => onYearChange && onYearChange(yr)}
                disabled={isLoading}
                className={`px-3 py-1 rounded-lg text-xs font-mono transition cursor-pointer ${
                  selectedYear === yr
                    ? 'bg-zinc-800 text-zinc-100 font-bold shadow-xs border border-zinc-700'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
                title={`Fetch NASA observations for ${yr}`}
              >
                {yr}
              </button>
            ))}
          </div>
        </div>

        {/* ── Segmented Tabs ── */}
        <div className="grid grid-cols-3 gap-1.5 p-1 mt-3.5 rounded-xl bg-zinc-950 border border-zinc-800">
          <button
            type="button"
            onClick={() => setActiveTab('soil')}
            className={`py-2 rounded-lg text-xs sm:text-sm font-semibold transition flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'soil'
                ? 'bg-zinc-800 text-zinc-100 shadow-xs border border-zinc-700'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Droplets className="w-4 h-4 text-zinc-300" />
            <span>{t('common.soil', {}, 'Soil Stratum')}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('climate')}
            className={`py-2 rounded-lg text-xs sm:text-sm font-semibold transition flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'climate'
                ? 'bg-zinc-800 text-zinc-100 shadow-xs border border-zinc-700'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <CloudRain className="w-4 h-4 text-zinc-300" />
            <span>{t('common.climate', {}, 'Climate')}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('canopy')}
            className={`py-2 rounded-lg text-xs sm:text-sm font-semibold transition flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'canopy'
                ? 'bg-zinc-800 text-zinc-100 shadow-xs border border-zinc-700'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Sprout className="w-4 h-4 text-zinc-300" />
            <span>{t('common.canopy', {}, 'Canopy')}</span>
          </button>
        </div>
      </div>

      {/* ── Tab Content ── */}
      <div className="p-5 space-y-4 flex-1 overflow-y-auto custom-scrollbar text-xs sm:text-sm">
        
        {/* Loading State */}
        {isLoading && (
          <div className="space-y-4 py-8">
            <div className="flex items-center justify-center gap-2.5 text-zinc-200 font-semibold text-sm">
              <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
              <span>{t('telemetry.acquiringNasa', {}, 'Querying NASA Earth Science Datasets…')}</span>
            </div>
            <div className="h-24 rounded-xl bg-zinc-900/40 border border-zinc-800 animate-pulse" />
            <div className="h-24 rounded-xl bg-zinc-900/40 border border-zinc-800 animate-pulse" />
          </div>
        )}

        {/* Observation Advisory Notice */}
        {!isLoading && !telemetry?.isLiveBackend && (
          <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-500/20 text-zinc-300 text-xs sm:text-sm flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-amber-300 block text-sm">
                {t('telemetry.observationNotice', {}, 'Observation Notice')}
              </span>
              <p className="text-zinc-300 mt-1 leading-relaxed">
                {telemetry?.error || t('telemetry.noLandData', {}, 'No terrestrial NASA observation found at this coordinate.')}
              </p>
              <p className="text-xs text-zinc-400 mt-2">
                {t('telemetry.landTip', {}, 'Tip: Click on terrestrial agricultural land or use the location search box to select a field.')}
              </p>
            </div>
          </div>
        )}

        {/* Live Observation Content */}
        {!isLoading && telemetry?.isLiveBackend && (
          <>
            {/* ── TAB 1: SOIL & ROOTZONE DEPTH STRATA ── */}
            {activeTab === 'soil' && (
              <div className="space-y-3.5">
                {/* Visual Soil Strata Cross-Section */}
                <div
                  onClick={() => handleExplain('sm_rootzone', telemetry.smapMoistureM3, t('telemetry.smapTitle', {}, 'SMAP L4 Root-Zone Moisture'))}
                  className="rounded-xl bg-zinc-900/40 border border-zinc-800 hover:border-zinc-700 transition cursor-pointer group overflow-hidden"
                >
                  {/* Top Strata Layer: Surface Seedbed 0-5 cm */}
                  <div className="p-4 bg-zinc-900/70 border-b border-zinc-800 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">
                        {t('telemetry.surfaceStratum', {}, 'Surface Seedbed Stratum (0–5 cm)')}
                      </span>
                      <span className="text-sm sm:text-base font-mono font-bold text-zinc-100 mt-1 block">
                        {telemetry.surfaceMoistureM3 !== null ? `${telemetry.surfaceMoistureM3} m³/m³` : '—'}
                      </span>
                    </div>
                    {telemetry.soilTempLayer1 !== null && (
                      <div className="text-right">
                        <span className="text-[10px] uppercase font-mono text-zinc-400 block">{t('telemetry.seedbedTemp', {}, 'Seedbed Temp')}</span>
                        <span className="px-2.5 py-1 rounded-lg bg-zinc-800 text-zinc-200 font-mono font-bold text-sm border border-zinc-700 inline-block mt-0.5">
                          {telemetry.soilTempLayer1}°C
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Deep Strata Layer: Root Zone 0-100 cm */}
                  <div className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-sm font-bold text-zinc-100 block">
                          {t('telemetry.smapTitle', {}, 'Root-Zone Moisture Profile')}
                        </span>
                        <span className="text-xs text-zinc-400 font-mono">
                          {t('telemetry.rootZoneDepth', {}, 'Root-zone (0–100 cm depth)')}
                        </span>
                      </div>
                      <div className="text-right font-mono" dir="ltr">
                        <bdi className="text-2xl sm:text-3xl font-bold text-zinc-100 tabular-nums">
                          {telemetry.smapMoistureM3}
                        </bdi>{' '}
                        <span className="text-xs font-normal text-zinc-400">{t('telemetry.m3m3', {}, 'm³/m³')}</span>
                      </div>
                    </div>

                    {/* Scientific Moisture Gauge */}
                    <div className="space-y-1.5 pt-1">
                      <div className="w-full bg-zinc-950 h-3 rounded-full overflow-hidden border border-zinc-800" dir="ltr">
                        <div
                          className="bg-emerald-500/80 h-full rounded-full transition-all duration-500"
                          style={{ width: `${Math.min(100, Math.max(5, (telemetry.smapMoistureM3 / 0.45) * 100))}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400">
                        <span>{t('telemetry.wiltingPoint', {}, 'Wilting (0.17)')}</span>
                        <span>{t('telemetry.fieldCapacity', {}, 'Field Capacity (0.32)')}</span>
                        <span>{t('telemetry.saturation', {}, 'Saturation (0.45)')}</span>
                      </div>
                    </div>

                    {/* Drought Percentile */}
                    <div className="flex items-center justify-between pt-2.5 border-t border-zinc-800 text-xs sm:text-sm">
                      <span className="text-zinc-400 font-medium">{t('telemetry.rootzoneStatus', {}, 'Rootzone Percentile Status:')}</span>
                      {telemetry.droughtPercentile !== null && (
                        <span className="font-mono font-bold text-zinc-100">
                          {telemetry.droughtPercentile}%{' '}
                          <span className="text-xs font-medium text-emerald-400">
                            ({telemetry.droughtPercentile > 50 ? t('telemetry.adequateHydration', {}, 'Adequate Hydration') : t('telemetry.deficitRisk', {}, 'Water-Deficit Risk')})
                          </span>
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-end pt-1.5">
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-300 group-hover:text-white transition">
                        <span>{t('telemetry.inspectParameters', {}, 'Inspect Biophysical Parameters')}</span>
                        <ArrowIcon className="w-3.5 h-3.5 group-hover:translate-x-1 transition" />
                      </span>
                    </div>
                  </div>
                </div>

                {/* In-Situ IoT Ground Sensor (ESP32 Capacitive v1.2 on GPIO34) */}
                <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800 text-xs sm:text-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`p-1.5 rounded-lg border ${
                        sensorData?.is_connected
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                      }`}>
                        <Cpu className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-zinc-100 font-bold text-xs block">
                            {t('telemetry.iotBridge', {}, 'In-Situ IoT Telemetry Bridge')}
                          </span>
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-zinc-800 text-zinc-400 border border-zinc-700/60">
                            {t('common.optional', {}, 'Optional')}
                          </span>
                        </div>
                        <span className="text-[10px] text-zinc-400 font-mono">
                          ESP32 • Capacitive v1.2 (GPIO34)
                        </span>
                      </div>
                    </div>

                    {sensorData?.is_connected ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        {t('telemetry.autoDetectedBadge', {}, 'Auto-Detected: ESP32 Live')}
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-medium bg-zinc-800 text-cyan-300 border border-cyan-500/30 flex items-center gap-1.5">
                        <Radio className="w-3 h-3 text-cyan-400 animate-pulse" />
                        {t('telemetry.autoScanning', {}, 'Auto-Scanning (Standby)')}
                      </span>
                    )}
                  </div>

                  {/* ── State 1: Auto-Scanning / Standby (Default, sensor is completely optional) ── */}
                  {!sensorData?.is_connected && (
                    <div className="space-y-2.5 pt-1">
                      <div className="flex items-center gap-2.5 p-2 rounded-xl bg-zinc-950/60 border border-zinc-800/80">
                        <div className="relative flex items-center justify-center w-6 h-6 shrink-0">
                          <span className="absolute w-full h-full rounded-full bg-cyan-400/20 animate-ping" />
                          <Radio className="w-3.5 h-3.5 text-cyan-400 relative z-10" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-mono text-zinc-300 truncate">
                            {t('telemetry.autoScanningBus', {}, 'Scanning network for ESP32 packet broadcast (GPIO34)...')}
                          </p>
                          <span className="text-[10px] text-zinc-500 block">
                            {t('telemetry.iotAutoNotice', {}, 'In-situ sensor is completely optional. Any hardware probe or edge transmitter will be auto-detected in real time.')}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-zinc-800/60">
                        <span className="text-[11px] font-mono text-zinc-500">
                          {t('telemetry.radarFallback', {}, 'Ground Truth: NASA SMAP L4 Radar')}
                        </span>
                        <button
                          type="button"
                          disabled={isSimulatingSensor}
                          onClick={handleToggleBroadcast}
                          className="px-3 py-1.5 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 text-emerald-300 hover:text-emerald-200 text-xs font-semibold flex items-center gap-1.5 border border-zinc-700 hover:border-emerald-500/40 transition cursor-pointer disabled:opacity-50"
                          title="Simulate edge node transmission in code"
                        >
                          <Radio className="w-3.5 h-3.5 text-emerald-400" />
                          <span>{t('telemetry.startVirtualBroadcast', {}, '📡 Start Virtual Edge Broadcast')}</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ── State 2: Connected / Live Simulation ── */}
                  {sensorData?.is_connected && (
                    <>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                        <div className="p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800/80">
                          <span className="text-[10px] text-zinc-400 uppercase tracking-wider block font-semibold">
                            {t('telemetry.sensorVwc', {}, 'Soil VWC')}
                          </span>
                          <bdi className="text-base font-mono font-bold text-emerald-300 tabular-nums" dir="ltr">
                            {(sensorData.vwc_m3_m3 * 100).toFixed(1)}%
                          </bdi>
                          <span className="text-[10px] text-zinc-400 block font-mono">
                            {sensorData.vwc_m3_m3} m³/m³
                          </span>
                        </div>

                        <div className="p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800/80">
                          <span className="text-[10px] text-zinc-400 uppercase tracking-wider block font-semibold">
                            {t('telemetry.sensorAdc', {}, 'Raw ADC (34)')}
                          </span>
                          <bdi className="text-base font-mono font-bold text-zinc-100 tabular-nums" dir="ltr">
                            {sensorData.adc_raw}
                          </bdi>
                          <span className="text-[10px] text-zinc-400 block font-mono">
                            / 4095 (12-bit)
                          </span>
                        </div>

                        <div className="p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800/80">
                          <span className="text-[10px] text-zinc-400 uppercase tracking-wider block font-semibold">
                            {t('telemetry.sensorTemp', {}, 'Soil Temp')}
                          </span>
                          <bdi className="text-base font-mono font-bold text-zinc-100 tabular-nums" dir="ltr">
                            {sensorData.soil_temp_c}°C
                          </bdi>
                          <span className="text-[10px] text-zinc-400 block font-mono">
                            Batt: {sensorData.battery_pct}%
                          </span>
                        </div>

                        <div className="p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800/80">
                          <span className="text-[10px] text-zinc-400 uppercase tracking-wider block font-semibold">
                            {t('telemetry.sensorDelta', {}, 'vs SMAP L4')}
                          </span>
                          <bdi className={`text-base font-mono font-bold tabular-nums ${
                            (sensorData.discrepancy_delta_m3_m3 || 0) >= 0 ? 'text-cyan-300' : 'text-amber-300'
                          }`} dir="ltr">
                            {sensorData.discrepancy_delta_m3_m3 !== null ? `${sensorData.discrepancy_delta_m3_m3 >= 0 ? '+' : ''}${(sensorData.discrepancy_delta_m3_m3 * 100).toFixed(1)}%` : '0.0%'}
                          </bdi>
                          <span className="text-[10px] text-zinc-400 block font-mono truncate">
                            {sensorData.fusion_status === 'irrigation_detected'
                              ? t('telemetry.irrigationDetected', {}, 'Irrigation Event')
                              : sensorData.fusion_status === 'localized_drought'
                              ? t('telemetry.localDrought', {}, 'Local Stress')
                              : t('telemetry.coherent', {}, 'Coherent')}
                          </span>
                        </div>
                      </div>

                      {/* Hydraulic Verdict */}
                      <div className="p-2.5 rounded-lg bg-zinc-950/40 border border-zinc-800/60 text-xs">
                        <p className="font-semibold text-zinc-200">
                          {language === 'ar' ? sensorData.hydration_verdict_ar : language === 'fr' ? sensorData.hydration_verdict_fr : sensorData.hydration_verdict_en}
                        </p>
                        <p className="text-zinc-400 text-[11px] mt-0.5">
                          {language === 'ar' ? sensorData.action_advice_ar : language === 'fr' ? sensorData.action_advice_fr : sensorData.action_advice_en}
                        </p>
                      </div>

                      {/* Interactive Testing Toolbar (Code-Driven Testing) */}
                      <div className="pt-1 flex flex-wrap items-center justify-between gap-1.5 border-t border-zinc-800/50">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={isSimulatingSensor}
                            onClick={() => handleSimulateSensor('irrigate')}
                            className="px-2 py-1 rounded bg-zinc-800 hover:bg-emerald-950/60 text-emerald-300 hover:text-emerald-200 border border-zinc-700 hover:border-emerald-500/40 text-[10px] font-semibold transition cursor-pointer disabled:opacity-50"
                            title="Simulate drip irrigation wetting front (drops ADC, raises VWC)"
                          >
                            💧 {t('telemetry.simIrrigate', {}, 'Irrigate')}
                          </button>
                          <button
                            type="button"
                            disabled={isSimulatingSensor}
                            onClick={() => handleSimulateSensor('dry_spell')}
                            className="px-2 py-1 rounded bg-zinc-800 hover:bg-amber-950/60 text-amber-300 hover:text-amber-200 border border-zinc-700 hover:border-amber-500/40 text-[10px] font-semibold transition cursor-pointer disabled:opacity-50"
                            title="Simulate rapid root-zone depletion (raises ADC, drops VWC)"
                          >
                            ☀️ {t('telemetry.simDry', {}, 'Drought')}
                          </button>
                          <button
                            type="button"
                            disabled={isSimulatingSensor}
                            onClick={() => handleSimulateSensor('reset_optimal')}
                            className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700 text-[10px] font-semibold transition cursor-pointer disabled:opacity-50"
                            title="Reset to baseline optimal root-zone moisture"
                          >
                            🔄 {t('telemetry.simReset', {}, 'Reset')}
                          </button>
                        </div>

                        {sensorData.is_broadcasting ? (
                          <button
                            type="button"
                            disabled={isSimulatingSensor}
                            onClick={handleToggleBroadcast}
                            className="px-2 py-1 rounded bg-zinc-800/80 hover:bg-rose-950/40 text-rose-300 hover:text-rose-200 border border-zinc-700/60 hover:border-rose-500/30 text-[10px] transition cursor-pointer flex items-center gap-1 disabled:opacity-50"
                            title="Stop edge broadcast transmission"
                          >
                            <Power className="w-3 h-3 text-rose-400" />
                            <span>{t('telemetry.stopBroadcast', {}, 'Stop Broadcast')}</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={isSimulatingSensor}
                            onClick={() => handleSimulateSensor('disconnect')}
                            className="px-2 py-1 rounded bg-zinc-800/80 hover:bg-rose-950/40 text-zinc-400 hover:text-rose-300 border border-zinc-700/60 hover:border-rose-500/30 text-[10px] transition cursor-pointer flex items-center gap-1 disabled:opacity-50"
                            title="Disconnect probe and return to scanning standby"
                          >
                            <Power className="w-3 h-3 text-zinc-400" />
                            <span>{t('telemetry.disconnectProbe', {}, 'Set Standby')}</span>
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* ── TAB 2: CLIMATE FLUX (NASA POWER) ── */}
            {activeTab === 'climate' && (
              <div className="space-y-3.5">
                {telemetry.annualRainfallMm !== null && (
                  <div
                    onClick={() => handleExplain('precipitation_total_surface_flux', telemetry.annualRainfallMm, t('telemetry.rainfallTitle', {}, 'NASA POWER Precipitation'))}
                    className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800 hover:border-zinc-700 transition cursor-pointer group space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-zinc-800 text-zinc-200 border border-zinc-700">
                          <CloudRain className="w-5 h-5 text-zinc-200" />
                        </div>
                        <div>
                          <span className="font-bold text-zinc-100 text-sm block">{t('telemetry.rainfallTitle', {}, 'Annual Precipitation')}</span>
                          <span className="text-xs text-zinc-400 font-mono">
                            {telemetry.dryDays !== null ? t('telemetry.dryDaysVal', { days: telemetry.dryDays }, `${telemetry.dryDays} Dry Days (<1mm)`) : t('telemetry.powerClimatology', {}, 'NASA POWER AG Climatology')}
                          </span>
                        </div>
                      </div>
                      <bdi className="text-2xl sm:text-3xl font-mono font-bold text-zinc-100 tabular-nums" dir="ltr">
                        {telemetry.annualRainfallMm} <span className="text-xs font-normal text-zinc-400">{t('telemetry.mmyr', {}, 'mm/yr')}</span>
                      </bdi>
                    </div>

                    <div className="flex items-center justify-end pt-2 border-t border-zinc-800">
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-300 group-hover:text-white transition">
                        <span>{t('telemetry.inspectParameters', {}, 'Inspect Biophysical Parameters')}</span>
                        <ArrowIcon className="w-3.5 h-3.5 group-hover:translate-x-1 transition" />
                      </span>
                    </div>
                  </div>
                )}

                {telemetry.meanTempC !== null && (
                  <div
                    onClick={() => handleExplain('surface_temp', telemetry.meanTempC, t('telemetry.tempTitle', {}, 'NASA POWER Temperature'))}
                    className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800 hover:border-zinc-700 transition cursor-pointer group space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-zinc-800 text-zinc-200 border border-zinc-700">
                          <Sun className="w-5 h-5 text-zinc-200" />
                        </div>
                        <div>
                          <span className="font-bold text-zinc-100 text-sm block">{t('telemetry.tempTitle', {}, 'Thermal Profile')}</span>
                          <span className="text-xs text-zinc-400 font-mono">
                            {telemetry.hotDays !== null ? t('telemetry.hotDaysVal', { days: telemetry.hotDays }, `${telemetry.hotDays} Heat Days (≥30°C)`) : t('telemetry.meanAirTemp', {}, 'Mean Surface Temperature')}
                          </span>
                        </div>
                      </div>
                      <bdi className="text-2xl sm:text-3xl font-mono font-bold text-zinc-100 tabular-nums" dir="ltr">
                        {telemetry.meanTempC} <span className="text-xs font-normal text-zinc-400">{t('telemetry.celsius', {}, '°C')}</span>
                      </bdi>
                    </div>

                    {(telemetry.minTempC !== null || telemetry.maxTempC !== null) && (
                      <div className="flex items-center justify-between text-xs sm:text-sm text-zinc-300 font-mono pt-2.5 border-t border-zinc-800" dir="ltr">
                        <span>{t('telemetry.minMaxTemp', { min: telemetry.minTempC, max: telemetry.maxTempC }, `Min: ${telemetry.minTempC}°C • Max: ${telemetry.maxTempC}°C`)}</span>
                        {telemetry.solarRadiation !== null && (
                          <span>{t('telemetry.solarRadiation', { rad: telemetry.solarRadiation }, `Solar: ${telemetry.solarRadiation} MJ/m²`)}</span>
                        )}
                      </div>
                    )}

                    <div className="flex items-center justify-end pt-2 border-t border-zinc-800">
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-300 group-hover:text-white transition">
                        <span>{t('telemetry.inspectParameters', {}, 'Inspect Biophysical Parameters')}</span>
                        <ArrowIcon className="w-3.5 h-3.5 group-hover:translate-x-1 transition" />
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── TAB 3: BIOSPHERE & CANOPY ── */}
            {activeTab === 'canopy' && (
              <div className="space-y-3.5">
                <div className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800 text-zinc-200 flex items-start gap-3">
                  <div className="p-2.5 rounded-xl bg-zinc-800 text-zinc-200 border border-zinc-700 shrink-0 mt-0.5">
                    <Layers className="w-5 h-5 text-zinc-300" />
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">
                      {t('telemetry.climaticClassification', {}, 'Climatic Terroir Classification')}
                    </span>
                    <span className="font-display text-base font-bold text-white block mt-0.5">{resolveClimateZone(telemetry.climateZone)}</span>
                    <p className="text-zinc-400 text-xs mt-1">
                      {t('telemetry.assimilatedBiosphere', {}, 'Assimilated from NASA POWER & SMAP L4 biosphere observations.')}
                    </p>
                  </div>
                </div>

                {(telemetry.vegetationGreenness !== null || telemetry.leafAreaIndex !== null) && (
                  <div
                    onClick={() => handleExplain('vegetation_greenness_fraction', telemetry.vegetationGreenness || 30.0, t('telemetry.canopyTitle', {}, 'Vegetation Canopy'))}
                    className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800 hover:border-zinc-700 transition cursor-pointer group space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-zinc-800 text-zinc-200 border border-zinc-700">
                          <Sprout className="w-5 h-5 text-zinc-300" />
                        </div>
                        <div>
                          <span className="font-bold text-zinc-100 text-sm block">{t('telemetry.canopyTitle', {}, 'Canopy State')}</span>
                          <span className="text-xs text-zinc-400 font-mono">{t('telemetry.smapBiosphere', {}, 'SMAP Biosphere Carbon Fluxes')}</span>
                        </div>
                      </div>
                      <div className="text-right font-mono" dir="ltr">
                        {telemetry.vegetationGreenness !== null && (
                          <bdi className="text-xl sm:text-2xl font-bold text-zinc-100 block tabular-nums">
                            {telemetry.vegetationGreenness}% {t('telemetry.greenness', {}, 'Green')}
                          </bdi>
                        )}
                        {telemetry.leafAreaIndex !== null && (
                          <bdi className="text-zinc-400 text-xs tabular-nums">
                            {t('telemetry.laiVal', { val: telemetry.leafAreaIndex }, `LAI: ${telemetry.leafAreaIndex} m²/m²`)}
                          </bdi>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-end pt-2 border-t border-zinc-800">
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-300 group-hover:text-white transition">
                        <span>{t('telemetry.inspectParameters', {}, 'Inspect Biophysical Parameters')}</span>
                        <ArrowIcon className="w-3.5 h-3.5 group-hover:translate-x-1 transition" />
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

      </div>

      {/* ── High-Craft Full-Screen Launch CTA Button ── */}
      <div className="p-3.5 sm:p-4 border-t border-zinc-800 bg-[#0f131c]/90 shrink-0">
        <button
          onClick={() => onEvaluateRotation(locationData, telemetry)}
          disabled={isLoading}
          type="button"
          className="w-full py-3 sm:py-3.5 px-4 sm:px-5 rounded-2xl bg-zinc-100 hover:bg-white active:bg-zinc-200 text-zinc-950 font-black text-xs sm:text-base transition cursor-pointer disabled:opacity-50 shadow-lg flex items-center justify-between group"
        >
          <div className="flex items-center gap-2 sm:gap-2.5">
            <Maximize2 className="w-4 h-4 text-zinc-900" />
            <span>{t('telemetry.evaluateRotationBtn', {}, 'Evaluate Crop Rotation Scenarios')}</span>
          </div>
          <span className="px-2 sm:px-2.5 py-1 rounded-lg bg-zinc-900 text-zinc-100 text-xs font-mono font-bold group-hover:bg-zinc-800 transition">
            {t('telemetry.fullScreenBtn', {}, 'Full Screen ➔')}
          </span>
        </button>
      </div>

      {/* ── Slide-Over Biophysical Analysis Drawer ── */}
      {activeExplanation && (
        <div
          className="absolute inset-0 z-50 bg-[#0b0e14] flex flex-col p-5 sm:p-6 overflow-y-auto custom-scrollbar animate-fade-in text-zinc-100 select-text"
          dir={isRtl ? 'rtl' : 'ltr'}
        >
          {/* Drawer Header */}
          <div className="flex items-center justify-between pb-3.5 border-b border-zinc-800">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-zinc-800 text-zinc-200 border border-zinc-700">
                <Layers className="w-5 h-5 text-zinc-200" />
              </div>
              <div className="truncate pr-2">
                <h3 className="font-display text-base font-bold text-white truncate">
                  {activeExplanation.name_localized || activeExplanation.title || activeExplanation.name_fr || activeExplanation.name_en || t('explain.title', {}, 'Satellite Observation')}
                </h3>
                <bdi className="text-sm font-mono text-zinc-200 font-semibold" dir="ltr">
                  {activeExplanation.display_value || `${activeExplanation.selected_value ?? ''}`}
                </bdi>
              </div>
            </div>
            <button
              onClick={() => setActiveExplanation(null)}
              type="button"
              className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition cursor-pointer shrink-0 border border-zinc-800"
              title={t('common.close', {}, 'Close')}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Drawer Content */}
          <div className="py-4 space-y-3.5 text-xs sm:text-sm flex-1">
            {activeExplanation.isLoading ? (
              <div className="py-16 flex flex-col items-center justify-center gap-3.5 text-center">
                <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
                <span className="font-semibold text-zinc-200 text-sm">
                  {t('explain.analyzingText', {}, 'Retrieving NASA observation telemetry…')}
                </span>
              </div>
            ) : (
              <>
                {/* Agronomic Interpretation */}
                {activeExplanation.interpretation && (
                  <div className="p-4 rounded-xl bg-zinc-900/70 border border-zinc-800 text-zinc-200 text-sm leading-relaxed">
                    <span className="font-bold text-white block mb-1 text-sm">
                      {t('explain.directAnalysis', {}, 'Agronomic Synthesis')}
                    </span>
                    {activeExplanation.interpretation}
                  </div>
                )}

                {/* What is this variable */}
                {activeExplanation.what && (
                  <div className="p-3.5 rounded-xl bg-zinc-900/40 border border-zinc-800 text-zinc-300 text-xs sm:text-sm leading-relaxed">
                    <span className="font-semibold text-zinc-400 block mb-1 uppercase text-xs tracking-wider">
                      {t('explain.whatIsThis', {}, 'Biophysical Definition')}
                    </span>
                    {activeExplanation.what}
                  </div>
                )}

                {/* Why it matters */}
                {activeExplanation.why_agri && (
                  <div className="p-3.5 rounded-xl bg-zinc-900/40 border border-zinc-800 text-zinc-300 text-xs sm:text-sm leading-relaxed">
                    <span className="font-semibold text-zinc-400 block mb-1 uppercase text-xs tracking-wider">
                      {t('explain.whyMatters', {}, 'Soil & Crop Resilience Impact')}
                    </span>
                    {activeExplanation.why_agri}
                  </div>
                )}

                {/* Practical guidance */}
                {activeExplanation.temporal_change && (
                  <div className="p-3.5 rounded-xl bg-zinc-900/40 border border-zinc-800 text-zinc-300 text-xs sm:text-sm leading-relaxed">
                    <span className="font-semibold text-zinc-400 block mb-1 uppercase text-xs tracking-wider">
                      {t('explain.adviceAction', {}, 'Actionable Field Strategy')}
                    </span>
                    {activeExplanation.temporal_change}
                  </div>
                )}

                {/* Scientific caveat */}
                {(activeExplanation.caveat_note || activeExplanation.source) && (
                  <div className="p-3.5 rounded-xl bg-zinc-900/20 border border-zinc-800/40 text-xs text-zinc-400 leading-normal">
                    <span className="text-zinc-300 font-semibold block mb-1">
                      {t('explain.scientificNote', {}, 'NASA Scientific Verification Note')}
                    </span>
                    {activeExplanation.caveat_note || activeExplanation.source}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Drawer Footer */}
          <div className="mt-auto pt-3.5 border-t border-zinc-800">
            <button
              onClick={() => setActiveExplanation(null)}
              type="button"
              className="w-full py-2.5 px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-200 font-semibold text-sm transition cursor-pointer border border-zinc-800"
            >
              {t('explain.closeDrawer', {}, 'Dismiss Analysis')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
