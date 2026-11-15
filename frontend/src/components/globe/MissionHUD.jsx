import React, { useEffect, useState } from 'react';
import { Globe, Compass, MapPin, Wifi, ChevronDown, ChevronUp } from 'lucide-react';
import { useTranslation } from '../../context/LanguageContext';

export default function MissionHUD({
  selectedLocation = null,
  isFlying = false,
  coordsRef,
  altitudeRef,
  onOpenTelemetry,
  hasTelemetry = false,
}) {
  const { t, isRtl } = useTranslation();
  const [backendOnline, setBackendOnline] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);

  // Ping backend health
  useEffect(() => {
    let isMounted = true;
    const checkHealth = async () => {
      try {
        const res = await fetch('/health');
        if (isMounted) setBackendOnline(res.ok);
      } catch {
        if (isMounted) setBackendOnline(false);
      }
    };
    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <div
      className="flex flex-col gap-2.5 max-w-sm sm:max-w-md pointer-events-none select-none font-body text-zinc-100"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      {/* ── Mission Title Card ── */}
      <div
        onClick={() => setIsExpanded((prev) => !prev)}
        className="pointer-events-auto flex items-center justify-between gap-3 px-3.5 sm:px-4 py-2 sm:py-3 rounded-2xl bg-[#0b0e14]/95 border border-zinc-800 shadow-2xl backdrop-blur-2xl text-zinc-100 cursor-pointer sm:cursor-default"
      >
        <div className="flex items-center gap-2.5 sm:gap-3.5">
          <div className="flex items-center justify-center w-7 h-7 sm:w-9 sm:h-9 rounded-xl bg-zinc-900 border border-zinc-700/60 text-zinc-200 shrink-0 shadow-inner">
            <Globe className={`w-4 h-4 sm:w-5 sm:h-5 ${isFlying ? 'animate-spin' : ''}`} />
          </div>
          <div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <h1 className="font-display text-xs sm:text-base font-bold text-white leading-snug truncate max-w-[140px] xs:max-w-[180px] sm:max-w-none">
                {t('hud.missionTitle', {}, 'Farmer Eye · Earth Orbit')}
              </h1>
              <span className="px-1.5 py-0.5 text-[9px] sm:text-[10px] font-mono font-bold rounded-md bg-zinc-800 text-zinc-200 border border-zinc-700 shrink-0">
                {t('hud.nasaBadge', {}, 'NASA EO')}
              </span>
            </div>
            <p className="hidden xs:block text-[11px] sm:text-xs text-zinc-400 mt-0.5 font-medium truncate max-w-[170px] sm:max-w-none">
              {t('hud.missionSubtitle', {}, 'NASA SMAP L4 · POWER AG · FAO-56 Digital Twin')}
            </p>
          </div>
        </div>

        {/* Mobile Expand / Collapse Chevron */}
        <button
          type="button"
          className="sm:hidden p-1 rounded-lg text-zinc-400 hover:text-white"
          aria-label={isExpanded ? 'Collapse HUD' : 'Expand HUD'}
        >
          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* ── Real-Time Telemetry & Data Bridge Readout ── */}
      <div className={`p-3.5 sm:p-4 rounded-2xl bg-[#0b0e14]/95 border border-zinc-800 shadow-2xl backdrop-blur-2xl text-xs sm:text-sm text-zinc-300 space-y-2 sm:space-y-2.5 transition-all duration-300 ${
        isExpanded ? 'block' : 'hidden sm:block'
      }`}>
        <div className="flex justify-between items-center text-xs sm:text-sm">
          <span className="text-zinc-400 flex items-center gap-2 font-medium">
            <Compass className="w-4 h-4 text-zinc-400" /> {t('hud.altitudeLabel', {}, 'Orbit Altitude')}
          </span>
          <bdi ref={altitudeRef} className="font-mono text-white font-bold tabular-nums text-sm sm:text-base" dir="ltr">
            20,000 km
          </bdi>
        </div>

        <div className="flex justify-between items-center text-xs sm:text-sm">
          <span className="text-zinc-400 font-medium">{t('hud.coordsLabel', {}, 'Coordinates')}</span>
          <bdi ref={coordsRef} className="font-mono text-zinc-200 font-semibold tabular-nums text-xs sm:text-sm" dir="ltr">
            20.000°N, 0.000°E
          </bdi>
        </div>

        {/* Selected Field Status */}
        <div className="pt-2.5 border-t border-zinc-800/90 flex items-center justify-between text-xs sm:text-sm">
          <span className="text-zinc-400 flex items-center gap-1.5 font-medium">
            <MapPin className="w-4 h-4 text-emerald-400 shrink-0" /> {t('hud.targetField', {}, 'Target Field:')}
          </span>
          {selectedLocation ? (
            <span className="text-white font-semibold truncate max-w-[210px]">
              {selectedLocation.name || `${selectedLocation.lat.toFixed(2)}, ${selectedLocation.lng.toFixed(2)}`}
            </span>
          ) : (
            <span className="text-zinc-500 italic">
              {isFlying ? t('hud.cinematicFly', {}, 'Cinematic Fly-in...') : t('hud.globalObservation', {}, 'Global Observation')}
            </span>
          )}
        </div>

        {/* Live Service Bridge */}
        <div className="pt-2 border-t border-zinc-800/90 flex items-center justify-between text-xs">
          <span className="text-zinc-400 flex items-center gap-1.5 font-medium">
            <Wifi className="w-3.5 h-3.5 text-zinc-400" /> {t('hud.dataBridge', {}, 'NASA Data Bridge:')}
          </span>
          <span className={`flex items-center gap-1.5 font-semibold ${backendOnline ? 'text-emerald-400' : 'text-amber-400'}`}>
            <span className={`w-2 h-2 rounded-full ${backendOnline ? 'bg-emerald-400' : 'bg-amber-400'}`} />
            {backendOnline ? t('hud.fastApiOnline', {}, 'FastAPI Online') : t('hud.connecting', {}, 'Connecting…')}
          </span>
        </div>

        {/* Reopen Field Telemetry Card (when dismissed) */}
        {hasTelemetry && onOpenTelemetry && (
          <div className="pt-2.5 border-t border-zinc-800/90 flex items-center justify-between text-xs">
            <span className="text-zinc-400 font-medium">
              {t('hud.fieldTelemetryReady', {}, 'Field Telemetry Ready')}
            </span>
            <button
              type="button"
              onClick={onOpenTelemetry}
              className="pointer-events-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 text-xs font-semibold transition cursor-pointer"
            >
              <span>{t('telemetry.showCardBtn', {}, '📊 Show Field Telemetry')}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
