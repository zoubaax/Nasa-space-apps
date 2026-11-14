import React, { useState } from 'react';
import { TbCurrentLocation, TbLoader2 } from 'react-icons/tb';

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
          name: `${data.city || 'Detected Farm'}, ${data.country || 'Detected Region'}`,
        };
      }
    } catch (e1) {
      console.warn('Primary IP lookup error:', e1);
    }

    try {
      const res = await fetch('https://ipapi.co/json/');
      if (!res.ok) throw new Error('ipapi.co failed');
      const data = await res.json();
      if (data && data.latitude && data.longitude) {
        return {
          latitude: data.latitude,
          longitude: data.longitude,
          name: `${data.city || 'Detected Farm'}, ${data.country_name || ''}`,
        };
      }
    } catch (e2) {
      console.warn('Secondary IP lookup error:', e2);
    }

    return null;
  };

  // ─── Get My Farm Location ─────────────────────────────────────────────────
  const handleGetMyLocation = () => {
    setIsLocating(true);
    setErrorMsg(null);

    const triggerFlight = (lng, lat, name) => {
      setIsLocating(false);
      onFlyToLocation({
        name,
        coordinates: [lng, lat],
        zoom: 14.5,
        pitch: 45,
        bearing: 0,
      });
    };

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          triggerFlight(longitude, latitude, 'My Farm (Detected GPS)');
        },
        async (error) => {
          console.warn('Browser GPS unavailable/blocked, using IP fallback:', error);
          const ipData = await fetchIpLocation();
          if (ipData) {
            triggerFlight(ipData.longitude, ipData.latitude, ipData.name);
          } else {
            setIsLocating(false);
            setErrorMsg('Location blocked. Please allow location access.');
            setTimeout(() => setErrorMsg(null), 4000);
          }
        },
        {
          enableHighAccuracy: false, // Fast Wi-Fi lookup on laptops
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
      <div className="p-1 rounded-2xl bg-zinc-950/80 border border-zinc-800/80 backdrop-blur-xl shadow-2xl">
        {/* Single Primary Action: Get My Location */}
        <button
          onClick={handleGetMyLocation}
          disabled={isLocating || isFlying}
          type="button"
          className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs font-mono font-bold transition-all duration-300 cursor-pointer ${
            isLocating
              ? 'bg-cyan-500 text-black shadow-[0_0_20px_rgba(6,182,212,0.6)] animate-pulse'
              : 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black shadow-[0_0_20px_rgba(6,182,212,0.35)] hover:shadow-[0_0_25px_rgba(6,182,212,0.6)]'
          }`}
          title="Zoom to your farm location"
        >
          {isLocating ? (
            <TbLoader2 className="w-4 h-4 animate-spin text-black" />
          ) : (
            <TbCurrentLocation className="w-4 h-4 text-black animate-pulse" />
          )}
          <span>{isLocating ? 'Locating Field...' : 'Get My Location'}</span>
        </button>
      </div>

      {/* Notice Pill */}
      {errorMsg && (
        <div className="px-3 py-1.5 rounded-lg bg-amber-950/90 border border-amber-500/40 text-amber-300 text-[11px] font-mono backdrop-blur-md shadow-lg">
          ⚠️ {errorMsg}
        </div>
      )}
    </div>
  );
}
