import React from 'react';
import { TbSatellite } from 'react-icons/tb';
import { SATELLITE_CONSTELLATIONS } from '../../constants/satellites';

export default function SatelliteConstellations() {
  return (
    <div className="flex flex-col gap-1.5 select-none pointer-events-none">
      <div className="flex items-center gap-2 ml-1">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
        <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-semibold">
          Active Earth Observation Constellations
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        {SATELLITE_CONSTELLATIONS.map(({ id, name, color, altitude, agency, variable }) => (
          <div
            key={id}
            className="flex items-center justify-between gap-3 px-3 py-1.5 rounded-xl bg-zinc-950/75 border border-zinc-800/80 backdrop-blur-md text-[10px] font-mono shadow-lg"
          >
            <div className="flex items-center gap-2.5">
              <div
                className="flex items-center justify-center w-5 h-5 rounded-md"
                style={{ backgroundColor: `${color}15`, border: `1px solid ${color}30` }}
              >
                <TbSatellite className="w-3.5 h-3.5" style={{ color }} />
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-zinc-200" style={{ color }}>
                  {name}
                  <span className="text-zinc-500 font-normal text-[9px] ml-1.5">({agency})</span>
                </span>
                <span className="text-zinc-400 text-[9px]">{variable}</span>
              </div>
            </div>

            <span className="text-zinc-500 text-[9px] font-mono">{altitude}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
