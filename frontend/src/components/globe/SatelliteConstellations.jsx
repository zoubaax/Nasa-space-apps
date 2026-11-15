import React from 'react';
import { Satellite } from 'lucide-react';
import { SATELLITE_CONSTELLATIONS } from '../../constants/satellites';
import { useTranslation } from '../../context/LanguageContext';

export default function SatelliteConstellations() {
  const { t, isRtl } = useTranslation();

  return (
    <div
      className="flex flex-col gap-2 select-none pointer-events-none font-body text-zinc-100"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <div className="flex items-center gap-2.5 ml-1">
        <span className="w-2 h-2 rounded-full bg-emerald-400" />
        <span className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
          {t('satellites.activeConstellations', {}, 'Active Earth Observation Constellations')}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        {SATELLITE_CONSTELLATIONS.map(({ id, name, color, altitude, agency, variable }) => (
          <div
            key={id}
            className="flex items-center justify-between gap-4 px-3.5 py-2 rounded-xl bg-[#0b0e14]/95 border border-zinc-800 backdrop-blur-2xl text-xs sm:text-sm shadow-xl text-zinc-200"
          >
            <div className="flex items-center gap-3">
              <div
                className="flex items-center justify-center w-7 h-7 rounded-lg shrink-0"
                style={{ backgroundColor: `${color}18`, border: `1px solid ${color}35` }}
              >
                <Satellite className="w-4 h-4" style={{ color }} />
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-zinc-100 text-xs sm:text-sm" style={{ color }}>
                  {name}
                  <span className="text-zinc-400 font-normal text-xs ml-1.5">({agency})</span>
                </span>
                <span className="text-zinc-400 text-xs">
                  {t(`satellites.variables.${id}`, {}, variable)}
                </span>
              </div>
            </div>

            <bdi className="text-zinc-300 text-xs font-mono font-bold tabular-nums shrink-0">{altitude}</bdi>
          </div>
        ))}
      </div>
    </div>
  );
}
