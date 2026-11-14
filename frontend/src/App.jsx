import React, { useState } from 'react';
import EarthOrbitGlobe from './components/globe/EarthOrbitGlobe';
import { TbLeaf, TbArrowRight, TbSatellite, TbCheck } from 'react-icons/tb';

export default function App() {
  const [selectedFarm, setSelectedFarm] = useState(null);

  const handleLocationSelect = (locationData) => {
    console.log('Selected Farm Location:', locationData);
    setSelectedFarm(locationData);
  };

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-black text-white">
      {/* 3D Earth Orbit Globe */}
      <EarthOrbitGlobe onLocationSelect={handleLocationSelect} />

      {/* Target Farm Bottom Action Banner (when a location is selected) */}
      {selectedFarm && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 max-w-xl w-[90%] sm:w-auto animate-fade-in-up">
          <div className="flex flex-col sm:flex-row items-center gap-4 px-5 py-3.5 rounded-2xl bg-zinc-950/90 border border-emerald-500/40 backdrop-blur-2xl shadow-[0_0_30px_rgba(16,185,129,0.25)]">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                <TbLeaf className="w-5 h-5" />
              </div>
              <div className="text-left">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold uppercase tracking-wider text-emerald-300">
                    Field Target Acquired
                  </span>
                  <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    <TbCheck className="w-3 h-3" /> Ready
                  </span>
                </div>
                <p className="text-xs font-mono text-zinc-300 truncate max-w-xs mt-0.5">
                  {selectedFarm.name || 'Custom Farm Plot'} · {selectedFarm.lat.toFixed(4)}°N, {selectedFarm.lng.toFixed(4)}°E
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => alert(`Starting NASA satellite extraction for [${selectedFarm.lat.toFixed(4)}, ${selectedFarm.lng.toFixed(4)}]...`)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-mono text-xs font-bold transition-all shadow-lg shadow-emerald-950/50 cursor-pointer w-full sm:w-auto justify-center"
            >
              <TbSatellite className="w-4 h-4" />
              <span>Evaluate Rotation</span>
              <TbArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
