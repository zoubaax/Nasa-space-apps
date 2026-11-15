import React from 'react';
import { Satellite } from 'lucide-react';
import { SATELLITE_CONSTELLATIONS } from '../../constants/satellites';
import { useTranslation } from '../../context/LanguageContext';

export default function SatelliteConstellations() {
  const { t, isRtl } = useTranslation();

  return (
    <div
      className="flex flex-col gap-1.5 select-none pointer-events-none font-body"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <div className="flex items-center gap-2 ml-1">
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        <span className="text-[11px] font-bold text-slate-700">
          {t('satellites.activeConstellations', {}, 'Active Earth Observation Constellations')}
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        {SATELLITE_CONSTELLATIONS.map(({ id, name, color, altitude, agency, variable }) => (
          <div
            key={id}
            className="flex items-center justify-between gap-3 px-3 py-1.5 rounded-xl bg-white/95 border border-slate-200/90 backdrop-blur-2xl text-xs shadow-[0_10px_25px_-5px_rgba(15,23,42,0.1)] text-slate-800"
          >
            <div className="flex items-center gap-2.5">
              <div
                className="flex items-center justify-center w-5 h-5 rounded-md"
                style={{ backgroundColor: `${color}18`, border: `1px solid ${color}40` }}
              >
                <Satellite className="w-3.5 h-3.5" style={{ color }} />
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-slate-900" style={{ color }}>
                  {name}
                  <span className="text-slate-400 font-normal text-[10px] ml-1.5">({agency})</span>
                </span>
                <span className="text-slate-500 text-[10px]">
                  {t(`satellites.variables.${id}`, {}, variable)}
                </span>
              </div>
            </div>

            <bdi className="text-slate-400 text-[10px] font-mono tabular-nums">{altitude}</bdi>
          </div>
        ))}
      </div>
    </div>
  );
}
