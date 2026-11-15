import React, { useEffect, useState } from 'react';
import { Globe, Compass, MapPin, Wifi } from 'lucide-react';
import { useTranslation } from '../../context/LanguageContext';

export default function MissionHUD({
  selectedLocation = null,
  isFlying = false,
  coordsRef,
  altitudeRef,
}) {
  const { t, isRtl } = useTranslation();
  const [backendOnline, setBackendOnline] = useState(true);

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
      className="flex flex-col gap-2 max-w-sm pointer-events-none select-none font-body"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      {/* ── Mission Title Card ── */}
      <div className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl bg-white/95 border border-slate-200/90 backdrop-blur-2xl shadow-[0_10px_35px_-5px_rgba(15,23,42,0.15)] text-slate-800">
        <div className="relative flex items-center justify-center w-8 h-8 rounded-lg bg-cyan-100 border border-cyan-200 text-cyan-700 shrink-0">
          <Globe className={`w-4 h-4 ${isFlying ? 'animate-spin' : ''}`} />
          <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-500 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-600" />
          </span>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-xs font-bold text-slate-900 leading-snug">
              {t('hud.missionTitle', {}, 'Farmer Eye · Earth Orbit')}
            </h1>
            <span className="px-1.5 py-0.5 text-[9px] font-semibold rounded bg-cyan-100 text-cyan-800 border border-cyan-200">
              {t('hud.nasaBadge', {}, 'NASA EO')}
            </span>
          </div>
          <p className="text-[10px] text-slate-500 mt-0.5">
            {t('hud.missionSubtitle', {}, 'NASA SMAP L4 · POWER AG · FAO-56 Digital Twin')}
          </p>
        </div>
      </div>

      {/* ── Real-Time Telemetry & Data Bridge Readout ── */}
      <div className="p-3 rounded-xl bg-white/95 border border-slate-200/90 backdrop-blur-2xl text-xs text-slate-700 space-y-2 shadow-[0_10px_35px_-5px_rgba(15,23,42,0.15)]">
        <div className="flex justify-between items-center text-xs">
          <span className="text-slate-500 flex items-center gap-1.5 font-medium">
            <Compass className="w-3.5 h-3.5 text-cyan-600" /> {t('hud.altitudeLabel', {}, 'Orbit Altitude')}
          </span>
          <bdi ref={altitudeRef} className="font-mono text-cyan-800 font-bold tabular-nums" dir="ltr">
            20,000 km
          </bdi>
        </div>

        <div className="flex justify-between items-center text-xs">
          <span className="text-slate-500 font-medium">{t('hud.coordsLabel', {}, 'Coordinates')}</span>
          <bdi ref={coordsRef} className="font-mono text-slate-800 font-medium tabular-nums" dir="ltr">
            20.000°N, 0.000°E
          </bdi>
        </div>

        {/* Selected Field Status */}
        <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
          <span className="text-slate-500 flex items-center gap-1 font-medium">
            <MapPin className="w-3.5 h-3.5 text-emerald-600" /> {t('hud.targetField', {}, 'Target Field:')}
          </span>
          {selectedLocation ? (
            <span className="text-emerald-800 font-bold truncate max-w-[170px]">
              {selectedLocation.name || `${selectedLocation.lat.toFixed(2)}, ${selectedLocation.lng.toFixed(2)}`}
            </span>
          ) : (
            <span className="text-slate-400 italic">
              {isFlying ? t('hud.cinematicFly', {}, 'Cinematic Fly-in...') : t('hud.globalObservation', {}, 'Global Observation')}
            </span>
          )}
        </div>

        {/* Live Service Bridge */}
        <div className="pt-1.5 border-t border-slate-100 flex items-center justify-between text-[11px]">
          <span className="text-slate-500 flex items-center gap-1 font-medium">
            <Wifi className="w-3 h-3 text-cyan-600" /> {t('hud.dataBridge', {}, 'NASA Data Bridge:')}
          </span>
          <span className={`flex items-center gap-1.5 font-semibold ${backendOnline ? 'text-emerald-700' : 'text-amber-700'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${backendOnline ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
            {backendOnline ? t('hud.fastApiOnline', {}, 'FastAPI Online') : t('hud.connecting', {}, 'Connecting…')}
          </span>
        </div>
      </div>
    </div>
  );
}
