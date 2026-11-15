import React, { useState } from 'react';
import { Sparkles, LocateFixed, Loader2 } from 'lucide-react';
import { useTranslation } from '../../context/LanguageContext';
import { reverseGeocode } from '../../utils/geo';
import Mascot3DViewer from './Mascot3DViewer';

export default function CinematicHeroOverlay({ onFlyToLocation, onEnterExperience }) {
  const { t, isRtl } = useTranslation();
  const [isLocating, setIsLocating] = useState(false);

  // ─── IP Geolocation Fallback (Fast Cloudflare + Multi-Tier) ────────────────
  const fetchIpLocation = async () => {
    try {
      const res = await fetch('https://get.geojs.io/v1/ip/geo.json');
      if (res.ok) {
        const data = await res.json();
        const lat = parseFloat(data.latitude);
        const lng = parseFloat(data.longitude);
        if (!isNaN(lat) && !isNaN(lng)) {
          return {
            lat,
            lng,
            name: `${data.city || 'Local Farm'}, ${data.country || 'Detected Region'}`,
          };
        }
      }
    } catch (e1) {
      console.warn('GeoJS lookup error:', e1);
    }

    try {
      const res = await fetch('https://ipwho.is/');
      if (res.ok) {
        const data = await res.json();
        if (data && data.success !== false && data.latitude && data.longitude) {
          return {
            lat: parseFloat(data.latitude),
            lng: parseFloat(data.longitude),
            name: `${data.city || 'Local Farm'}, ${data.country || 'Detected Region'}`,
          };
        }
      }
    } catch (e2) {
      console.warn('ipwho lookup error:', e2);
    }

    // Default Moroccan Pilot Terroir (Saïss Plateau)
    return {
      lat: 33.89,
      lng: -5.55,
      name: 'Saïss / Meknes, Morocco',
    };
  };

  // ─── Locate Farm Button Handler ───────────────────────────────────────────
  const handleGetMyLocation = () => {
    if (isLocating) return;
    setIsLocating(true);

    const onLocationResolved = (loc) => {
      setIsLocating(false);
      if (onFlyToLocation) {
        onFlyToLocation({
          name: loc.name || t('toolbar.myFarm', {}, 'My Current Farm Location'),
          lat: loc.lat,
          lng: loc.lng,
          coordinates: [loc.lng, loc.lat],
          zoom: 14.5,
          pitch: 45,
        });
      } else if (onEnterExperience) {
        onEnterExperience();
      }
    };

    const fallbackToIp = async () => {
      try {
        const ipLoc = await fetchIpLocation();
        if (ipLoc) {
          onLocationResolved(ipLoc);
          return;
        }
      } catch (err) {
        console.warn('IP fallback failed:', err);
      }
      onLocationResolved({
        lat: 33.89,
        lng: -5.55,
        name: 'Saïss / Meknes, Morocco',
      });
    };

    if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          try {
            const geo = await reverseGeocode(longitude, latitude);
            onLocationResolved({
              lat: latitude,
              lng: longitude,
              name: geo.displayName || t('toolbar.myFarm', {}, 'My Current Farm Location'),
            });
          } catch {
            onLocationResolved({
              lat: latitude,
              lng: longitude,
              name: t('toolbar.myFarm', {}, 'My Current Farm Location'),
            });
          }
        },
        () => {
          fallbackToIp();
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
      );
    } else {
      fallbackToIp();
    }
  };

  return (
    <div
      className="absolute inset-0 pointer-events-none z-20 flex flex-col lg:flex-row items-center justify-between p-4 sm:p-8 md:p-12 lg:p-16 select-none overflow-y-auto lg:overflow-hidden"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      {/* ── Left Editorial Text Floating Directly in Space ── */}
      <div className="max-w-xl z-10 shrink-0 pointer-events-none">
        {/* Subtle Eyebrow */}
        <div className="flex items-center gap-2 mb-3 sm:mb-4">
          <span className="w-6 h-[1.5px] bg-zinc-500" />
          <span className="text-[10px] sm:text-[11px] font-mono uppercase tracking-widest text-zinc-400 font-medium">
            {t('hero.eyebrow', {}, 'NASA EARTH OBSERVATION · AGRICULTURE · SCIENCE')}
          </span>
        </div>

        {/* Hero Headline with Official Logo */}
        <div className="flex items-center gap-3.5 sm:gap-5">
          <img
            src="/logo.png"
            alt="Farmer Eye Logo"
            className="w-14 h-14 sm:w-20 sm:h-20 md:w-24 md:h-24 object-contain filter drop-shadow-[0_8px_25px_rgba(16,185,129,0.35)] shrink-0 select-none pointer-events-none"
          />
          <h1 className="font-display text-4xl sm:text-6xl md:text-7xl lg:text-8xl font-normal tracking-tight text-white leading-none drop-shadow-[0_4px_30px_rgba(0,0,0,0.85)]">
            {t('hero.title', {}, 'Farmer Eye')}
          </h1>
        </div>

        {/* Subtitle */}
        <p className="font-display italic text-xl sm:text-2xl md:text-3xl text-zinc-300 font-light mt-2 sm:mt-3 tracking-wide drop-shadow-[0_2px_15px_rgba(0,0,0,0.85)]">
          {t('hero.subtitle', {}, "The Farmer's Second Eyes.")}
        </p>

        {/* Description */}
        <p className="text-zinc-400 text-xs sm:text-sm md:text-base font-sans mt-4 sm:mt-6 leading-relaxed max-w-lg drop-shadow-[0_2px_12px_rgba(0,0,0,0.85)]">
          {t('hero.description', {}, 'Turning NASA Earth observations, agricultural science, and Super Intelligence (SI) into clearer, climate-resilient farming decisions.')}
        </p>

        {/* ── Call To Action Actions ── */}
        <div className="mt-6 sm:mt-8 flex items-center gap-3 pointer-events-auto">
          {/* Primary CTA: Get My Farm Location */}
          <button
            type="button"
            onClick={handleGetMyLocation}
            disabled={isLocating}
            className="flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-2xl bg-gradient-to-r from-emerald-400 via-emerald-500 to-teal-500 hover:from-emerald-300 hover:to-teal-400 text-zinc-950 font-black text-xs sm:text-sm shadow-[0_0_35px_rgba(16,185,129,0.45)] hover:shadow-[0_0_50px_rgba(16,185,129,0.7)] hover:scale-105 active:scale-95 transition-all duration-300 cursor-pointer disabled:opacity-60"
          >
            {isLocating ? (
              <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin text-zinc-950" />
            ) : (
              <LocateFixed className="w-4 h-4 sm:w-5 sm:h-5 text-zinc-950" />
            )}
            <span>
              {isLocating
                ? t('hero.locating', {}, 'Detecting Field Coordinates…')
                : t('hero.getMyLocation', {}, '📍 Get My Farm Location')}
            </span>
          </button>
        </div>

        {/* Spatial Prompt: Guidance that clicking directly on the 3D globe lands on any farm */}
        <div className="mt-4 sm:mt-5 flex items-center gap-2.5 text-xs sm:text-sm font-mono text-zinc-400">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
          <span>{t('hero.clickGlobeHint', {}, 'Or click directly on any farm on the 3D globe to explore')}</span>
        </div>
      </div>

      {/* ── Center is intentionally open for the 3D rotating globe (clicks pass through to map) ── */}

      {/* ── Right: 3D Mascot Character welcoming the visitor ── */}
      <div className="flex flex-col items-center justify-center lg:items-center mt-5 sm:mt-6 lg:mt-0 z-10 shrink-0 pointer-events-none">
        {/* Fluid Thought Cloud emerging from head (pure reading/greeting, non-navigating) */}
        <div className="pointer-events-auto relative max-w-xs sm:max-w-sm rounded-[24px] sm:rounded-[32px] bg-[#0b0e14]/85 border border-zinc-700/60 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8)] backdrop-blur-2xl p-4 sm:p-6 text-zinc-100 transition-all duration-300 animate-float select-none">
          {/* Subtle cloud glow effect */}
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-emerald-400" />
              <span>{t('mascot.role', {}, 'Your 3D SI Agronomist')}</span>
            </span>
            <span className="text-[10px] font-mono text-zinc-400">NASA SI</span>
          </div>

          {/* Welcoming Greeting */}
          <h3 className="font-display text-sm sm:text-base font-bold text-white leading-snug">
            {t('mascot.greeting', {}, 'Welcome to Farmer Eye! 👋')}
          </h3>

          {/* Speech Message */}
          <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed mt-1.5 font-body">
            {t('mascot.message', {}, "I'm here to help you navigate NASA Earth observations, soil moisture, and climate-resilient crop rotations. Locate your farm or click on the 3D globe to begin!")}
          </p>

          {/* Thought cloud tail dots leading down toward the gardener's head */}
          <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 pointer-events-none">
            <div className="w-3.5 h-3.5 rounded-full bg-[#0b0e14] border border-zinc-700/70 shadow-sm" />
            <div className="w-2 h-2 rounded-full bg-[#0b0e14] border border-zinc-700/70 shadow-xs" />
          </div>
        </div>

        {/* 3D Model Display (User can drag/rotate without triggering unwanted map navigation) */}
        <div className="pointer-events-auto relative w-56 sm:w-72 md:w-80 lg:w-96 h-[260px] sm:h-[340px] md:h-[400px] lg:h-[470px] flex items-center justify-center cursor-grab active:cursor-grabbing group pt-2">
          <Mascot3DViewer modelSrc="/models/gardener.glb" />
        </div>
      </div>
    </div>
  );
}
