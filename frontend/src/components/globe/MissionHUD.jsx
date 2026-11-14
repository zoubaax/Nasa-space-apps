import React from 'react';
import { GiEarthAmerica } from 'react-icons/gi';
import { TbCompass, TbMapPin } from 'react-icons/tb';

export default function MissionHUD({
  selectedLocation = null,
  isFlying = false,
  coordsRef,
  altitudeRef,
}) {
  return (
    <div className="flex flex-col gap-2.5 max-w-sm pointer-events-none select-none">
      {/* Title & Mission Card */}
      <div className="flex items-center gap-3.5 px-4 py-3 rounded-2xl bg-zinc-950/80 border border-cyan-500/20 backdrop-blur-xl shadow-2xl shadow-cyan-950/30">
        <div className="relative flex items-center justify-center w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
          <GiEarthAmerica className={`w-5 h-5 ${isFlying ? 'animate-spin' : 'animate-spin-slow'}`} />
          <span className="absolute -top-1 -right-1 flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
          </span>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xs font-mono font-bold tracking-widest uppercase text-cyan-300">
              FieldShift AI · Earth Orbit
            </h1>
            <span className="px-1.5 py-0.5 text-[9px] font-mono font-semibold rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
              NASA EO
            </span>
          </div>
          <p className="text-[10px] font-mono text-zinc-400 mt-0.5">
            SMAP 9km · GPM Rainfall · Local IoT
          </p>
        </div>
      </div>

      {/* Telemetry & Target Status (Direct DOM references for zero re-render lag) */}
      <div className="p-3.5 rounded-xl bg-zinc-950/75 border border-zinc-800/80 backdrop-blur-md font-mono text-xs text-zinc-300 space-y-2">
        <div className="flex justify-between items-center text-[11px]">
          <span className="text-zinc-500 uppercase flex items-center gap-1.5 text-[10px]">
            <TbCompass className="w-3.5 h-3.5 text-cyan-400" /> Orbit Altitude
          </span>
          <span ref={altitudeRef} className="text-cyan-300 font-bold tabular-nums">
            20,000 km
          </span>
        </div>

        <div className="flex justify-between items-center text-[11px]">
          <span className="text-zinc-500 uppercase text-[10px]">Coordinates</span>
          <span ref={coordsRef} className="text-zinc-200 font-medium tabular-nums">
            20.000°N, 0.000°E
          </span>
        </div>

        {/* Selected Field Status */}
        <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between text-[10px]">
          <span className="text-zinc-500 flex items-center gap-1">
            <TbMapPin className="w-3 h-3 text-emerald-400" /> Target Field:
          </span>
          {selectedLocation ? (
            <span className="text-emerald-400 font-semibold truncate max-w-[170px]">
              {selectedLocation.name || `${selectedLocation.lat.toFixed(2)}, ${selectedLocation.lng.toFixed(2)}`}
            </span>
          ) : (
            <span className="text-zinc-500 italic">
              {isFlying ? 'Cinematic Fly-in...' : 'Global Observation'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
