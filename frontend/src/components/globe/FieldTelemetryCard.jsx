import React from 'react';
import {
  TbLeaf,
  TbDroplet,
  TbCloudRain,
  TbSun,
  TbCpu,
  TbX,
  TbArrowRight,
  TbCheck,
  TbInfoCircle,
  TbLayersLinked,
} from 'react-icons/tb';

export default function FieldTelemetryCard({
  locationData,
  telemetry,
  onEvaluateRotation,
  onClose,
}) {
  if (!locationData) return null;

  const lat = locationData.lat;
  const lng = locationData.lng;
  const name = locationData.name || 'Selected Farm Plot';

  return (
    <div className="absolute top-20 right-5 z-30 w-96 max-w-[calc(100vw-2.5rem)] max-h-[calc(100vh-6.5rem)] flex flex-col rounded-3xl bg-zinc-950/90 border border-cyan-500/30 backdrop-blur-2xl shadow-[0_0_40px_rgba(6,182,212,0.2)] text-white font-sans animate-fade-in-right overflow-hidden select-none">
      
      {/* ── Header ── */}
      <div className="relative p-5 pb-4 border-b border-zinc-800/80 bg-gradient-to-b from-cyan-950/30 to-transparent">
        <button
          onClick={onClose}
          type="button"
          className="absolute top-4 right-4 p-1.5 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-white transition cursor-pointer"
          title="Minimize Card"
        >
          <TbX className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2 mb-1">
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            <TbCheck className="w-3 h-3" /> Field Locked
          </span>
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
            <TbLayersLinked className="w-3 h-3" /> SMAP 9km Grid Active
          </span>
        </div>

        <h2 className="text-base font-bold text-zinc-100 truncate pr-6">{name}</h2>
        <div className="flex items-center gap-3 text-xs font-mono text-zinc-400 mt-1">
          <span>{lat >= 0 ? `${lat.toFixed(4)}°N` : `${Math.abs(lat).toFixed(4)}°S`}</span>
          <span>•</span>
          <span>{lng >= 0 ? `${lng.toFixed(4)}°E` : `${Math.abs(lng).toFixed(4)}°W`}</span>
        </div>
      </div>

      {/* ── Scrollable Body ── */}
      <div className="p-5 space-y-4 overflow-y-auto max-h-[60vh] custom-scrollbar text-xs">
        
        {/* Environmental Summary Banner */}
        <div className="p-3 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 font-mono text-[11px] text-zinc-300 flex items-start gap-2.5">
          <TbInfoCircle className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-cyan-300">Target Climate Zone:</span>{' '}
            {telemetry?.climateZone || 'Semi-Arid Agricultural Plain'}
            <p className="text-zinc-400 text-[10px] mt-0.5">
              Assimilated regional satellite observations fused for crop feasibility.
            </p>
          </div>
        </div>

        {/* 3 NASA Satellite Evidence Tiles */}
        <div className="space-y-2">
          <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-semibold block">
            NASA Earth Observations (Regional Baseline)
          </span>

          {/* SMAP L4 Tile */}
          <div className="p-3 rounded-xl bg-zinc-900/50 border border-cyan-500/20 hover:border-cyan-500/40 transition">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <div className="p-1 rounded-md bg-cyan-500/10 text-cyan-400">
                  <TbDroplet className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-semibold text-zinc-200">SMAP L4 Soil Moisture</span>
                  <span className="text-[9px] font-mono text-zinc-400 block">SPL4SMGP V8 · 9 km EASE-Grid</span>
                </div>
              </div>
              <span className="text-cyan-300 font-mono font-bold text-sm">
                {telemetry?.smapMoistureM3 || 0.18} <span className="text-[10px] font-normal text-zinc-400">m³/m³</span>
              </span>
            </div>
            <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-gradient-to-r from-amber-500 via-cyan-400 to-emerald-400 h-1.5 rounded-full"
                style={{ width: `${Math.min(100, ((telemetry?.smapMoistureM3 || 0.18) / 0.45) * 100)}%` }}
              ></div>
            </div>
            <span className="text-[9px] font-mono text-zinc-400 mt-1 block">
              Root-zone estimate (0–100 cm depth)
            </span>
          </div>

          {/* GPM IMERG Rainfall Tile */}
          <div className="p-3 rounded-xl bg-zinc-900/50 border border-blue-500/20 hover:border-blue-500/40 transition">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1 rounded-md bg-blue-500/10 text-blue-400">
                  <TbCloudRain className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-semibold text-zinc-200">GPM IMERG Precipitation</span>
                  <span className="text-[9px] font-mono text-zinc-400 block">V07 Calibrated Rainfall</span>
                </div>
              </div>
              <span className="text-blue-300 font-mono font-bold text-sm">
                {telemetry?.annualRainfallMm || 380} <span className="text-[10px] font-normal text-zinc-400">mm/yr</span>
              </span>
            </div>
          </div>

          {/* NASA POWER Climate Tile */}
          <div className="p-3 rounded-xl bg-zinc-900/50 border border-amber-500/20 hover:border-amber-500/40 transition">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1 rounded-md bg-amber-500/10 text-amber-400">
                  <TbSun className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-semibold text-zinc-200">NASA POWER Temperature</span>
                  <span className="text-[9px] font-mono text-zinc-400 block">Daily 10-Yr Agrometeorology</span>
                </div>
              </div>
              <span className="text-amber-300 font-mono font-bold text-sm">
                {telemetry?.meanTempC || 19.4} <span className="text-[10px] font-normal text-zinc-400">°C</span>
              </span>
            </div>
          </div>
        </div>

        {/* Local IoT Telemetry Status */}
        <div className="p-3 rounded-xl bg-zinc-900/40 border border-emerald-500/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1 rounded-md bg-emerald-500/10 text-emerald-400">
                <TbCpu className="w-4 h-4" />
              </div>
              <div>
                <span className="font-semibold text-zinc-200">Local ESP32 Soil Sensor</span>
                <span className="text-[9px] font-mono text-emerald-400 block">
                  ● Endpoint Ready: /api/v1/sensors/readings
                </span>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded text-[9px] font-mono bg-zinc-800 text-zinc-300 border border-zinc-700">
              Uncalibrated ADC
            </span>
          </div>
        </div>

      </div>

      {/* ── Footer / Call to Action ── */}
      <div className="p-4 pt-3 border-t border-zinc-800/80 bg-zinc-950/60">
        <button
          onClick={() => onEvaluateRotation(locationData, telemetry)}
          type="button"
          className="flex items-center justify-center gap-2.5 w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white font-mono text-xs font-bold transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)] cursor-pointer"
        >
          <TbLeaf className="w-4 h-4" />
          <span>Evaluate Climate-Adaptive Rotations</span>
          <TbArrowRight className="w-4 h-4" />
        </button>
      </div>

    </div>
  );
}
