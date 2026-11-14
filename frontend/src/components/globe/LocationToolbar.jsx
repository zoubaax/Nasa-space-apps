import React, { useState } from 'react';
import { TbCurrentLocation, TbLoader2, TbPlant } from 'react-icons/tb';
import { PILOT_LOCATIONS } from '../../constants/satellites';

export default function LocationToolbar({ onFlyToLocation, isFlying = false }) {
  const [isLocating, setIsLocating] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  // ─── IP Geolocation Fallback (for Brave / blocked browser GPS) ─────────────
  const fetchIpLocation = async () => {
    try {
      const res = await fetch('https://ipwho.is/');
      if (!res.ok) throw new Error('ipwho.is failed');
      const data = await res.json();
      if (data && data.success !== false && data.latitude && data.longitude) {
        return {
          latitude: data.latitude,
          longitude: data.longitude,
          name: `${data.city || 'Detected City'}, ${data.country || 'Detected Region'}`,
        };
      }
    } catch (e1) {
      console.warn('Primary IP lookup error:', e1);
    }

    try {
      const res = await fetch('https://ipapi.co/json/');
      if (!res.ok) throw new Error('ipapi.co failed');
      const data = await res.json();
      if (data.latitude && data.longitude) {
        return {
          latitude: data.latitude,
          longitude: data.longitude,
          name: `${data.city || 'Detected City'}, ${data.country_name || ''}`,
        };
      }
    } catch (e2) {
      console.warn('Secondary IP lookup error:', e2);
    }

    return null;
  };

  // ─── Google Maps Style "Get My Location" ──────────────────────────────────
  const handleGetMyLocation = () => {
    setIsLocating(true);
    setErrorMsg(null);

    const triggerFlight = (lng, lat, name) => {
      setIsLocating(false);
      onFlyToLocation({
        name,
        coordinates: [lng, lat],
        zoom: 14.5,
        pitch: 35,
        bearing: 0,
      });
    };

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          triggerFlight(longitude, latitude, 'My Location (Laptop)');
        },
        async (error) => {
          console.warn('Browser GPS unavailable/blocked, using IP location:', error);
          const ipData = await fetchIpLocation();
          if (ipData) {
            triggerFlight(ipData.longitude, ipData.latitude, ipData.name);
          } else {
            setIsLocating(false);
            setErrorMsg('Location blocked. Please allow location access or pick a farm.');
            setTimeout(() => setErrorMsg(null), 4000);
          }
        },
        {
          enableHighAccuracy: false, // Fast Wi-Fi lookup on laptops (no GPS hang)
          timeout: 3500,
          maximumAge: 300000,
        }
      );
    } else {
      fetchIpLocation().then((ipData) => {
        if (ipData) {
          triggerFlight(ipData.longitude, ipData.latitude, ipData.name);
        } else {
          setIsLocating(false);
          setErrorMsg('Location unavailable');
          setTimeout(() => setErrorMsg(null), 4000);
        }
      });
    }
  };

  return (
    <div className="flex flex-col items-end gap-2 select-none">
      <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-zinc-950/80 border border-zinc-800/80 backdrop-blur-xl shadow-2xl">
        {/* Get My Location Button (Google Maps Style) */}
        <button
          onClick={handleGetMyLocation}
          disabled={isLocating || isFlying}
          type="button"
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-mono font-medium transition-all duration-200 cursor-pointer ${
            isLocating
              ? 'bg-blue-600 text-white animate-pulse'
              : 'bg-blue-600/80 hover:bg-blue-600 text-white shadow-[0_0_15px_rgba(59,130,246,0.3)]'
          }`}
          title="Zoom to your current location"
        >
          {isLocating ? (
            <TbLoader2 className="w-4 h-4 animate-spin text-white" />
          ) : (
            <TbCurrentLocation className="w-4 h-4 text-white" />
          )}
          <span>{isLocating ? 'Locating...' : 'Get My Location'}</span>
        </button>

        {/* Pilot Farm Button */}
        <button
          onClick={() => onFlyToLocation(PILOT_LOCATIONS[0])}
          disabled={isFlying}
          type="button"
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-900/90 hover:bg-zinc-850 text-emerald-400 border border-emerald-500/30 text-xs font-mono font-medium transition-all cursor-pointer shadow-lg"
          title="Jump directly to Morocco Pilot Farm"
        >
          <TbPlant className="w-4 h-4 text-emerald-400" />
          <span>Pilot Farm (Morocco)</span>
        </button>
      </div>

      {/* Notice Pill */}
      {errorMsg && (
        <div className="px-3 py-1.5 rounded-lg bg-amber-950/80 border border-amber-500/40 text-amber-300 text-[11px] font-mono backdrop-blur-md shadow-lg">
          ⚠️ {errorMsg}
        </div>
      )}
    </div>
  );
}
