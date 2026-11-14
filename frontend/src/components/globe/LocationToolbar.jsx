import React, { useState } from 'react';
import { TbCurrentLocation, TbLoader2, TbPlant } from 'react-icons/tb';
import { PILOT_LOCATIONS } from '../../constants/satellites';

export default function LocationToolbar({ onFlyToLocation, isFlying = false }) {
  const [isLocating, setIsLocating] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  // ─── Browser Geolocation Handler ───────────────────────────────────────────
  const handleGetMyLocation = () => {
    if (!navigator.geolocation) {
      setErrorMsg('Geolocation is not supported by your browser');
      setTimeout(() => setErrorMsg(null), 4000);
      return;
    }

    setIsLocating(true);
    setErrorMsg(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setIsLocating(false);
        const { latitude, longitude } = position.coords;
        onFlyToLocation({
          name: 'My Current Location',
          coordinates: [longitude, latitude],
          zoom: 14.8,
          pitch: 50,
          bearing: 20,
          description: 'Detected via device GPS sensor',
        });
      },
      (error) => {
        setIsLocating(false);
        console.warn('Geolocation error:', error);
        let msg = 'Could not retrieve GPS location';
        if (error.code === error.PERMISSION_DENIED) {
          msg = 'Location permission denied. Please allow GPS access.';
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          msg = 'Location information is unavailable.';
        } else if (error.code === error.TIMEOUT) {
          msg = 'Location request timed out.';
        }
        setErrorMsg(msg);
        setTimeout(() => setErrorMsg(null), 4000);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      }
    );
  };

  return (
    <div className="flex flex-col items-end gap-2 select-none">
      <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-zinc-950/80 border border-zinc-800/80 backdrop-blur-xl shadow-2xl">
        {/* Get My Location Button */}
        <button
          onClick={handleGetMyLocation}
          disabled={isLocating || isFlying}
          type="button"
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-mono font-medium transition-all duration-300 cursor-pointer ${
            isLocating
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
              : 'bg-cyan-950/40 hover:bg-cyan-900/60 text-cyan-300 border border-cyan-500/30 hover:border-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.15)]'
          }`}
          title="Find and zoom to your current location"
        >
          {isLocating ? (
            <TbLoader2 className="w-4 h-4 animate-spin text-cyan-400" />
          ) : (
            <TbCurrentLocation className="w-4 h-4 text-cyan-400 animate-pulse" />
          )}
          <span>{isLocating ? 'Locating GPS...' : 'Get My Location'}</span>
        </button>

        {/* Pilot Farm: Saïss Plain Button */}
        <button
          onClick={() => onFlyToLocation(PILOT_LOCATIONS[0])}
          disabled={isFlying}
          type="button"
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-500/30 hover:border-emerald-400 text-xs font-mono font-medium transition-all cursor-pointer shadow-[0_0_15px_rgba(16,185,129,0.15)]"
          title="Jump directly to Morocco Pilot Farm"
        >
          <TbPlant className="w-4 h-4 text-emerald-400" />
          <span>Pilot Farm (Morocco)</span>
        </button>
      </div>

      {/* Geolocation Notice / Error Pill */}
      {errorMsg && (
        <div className="px-3 py-1.5 rounded-lg bg-red-950/80 border border-red-500/40 text-red-300 text-[11px] font-mono backdrop-blur-md shadow-lg animate-fade-in">
          ⚠️ {errorMsg}
        </div>
      )}
    </div>
  );
}
