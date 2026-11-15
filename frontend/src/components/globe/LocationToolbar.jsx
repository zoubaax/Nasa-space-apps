import React, { useState, useEffect, useRef } from 'react';
import { Search, LocateFixed, Loader2, MapPin, X, Compass, Sparkles } from 'lucide-react';
import { searchLocation } from '../../utils/geo';
import { useTranslation } from '../../context/LanguageContext';

// Moroccan Agricultural Terroirs for 1-click exploration
const MOROCCAN_TERROIRS = [
  { name: 'Saïss / Meknes', shortName: '🌾 Saïss', lng: -5.55, lat: 33.89 },
  { name: 'Gharb / Sidi Slimane', shortName: '💧 Gharb', lng: -5.92, lat: 34.26 },
  { name: 'Tadla / Beni Mellal', shortName: '🌽 Tadla', lng: -6.36, lat: 32.34 },
  { name: 'Souss / Taroudant', shortName: '🍊 Souss', lng: -8.87, lat: 30.47 },
  { name: 'Chaouia / Settat', shortName: '🌻 Chaouia', lng: -7.62, lat: 33.00 },
];

export default function LocationToolbar({ onFlyToLocation, isFlying = false }) {
  const { t, langInfo, isManualEnglish, toggleLanguageMode, isRtl, isTranslating } = useTranslation();
  const [isLocating, setIsLocating] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  // Live Location Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isOpenDropdown, setIsOpenDropdown] = useState(false);
  const [showTerroirs, setShowTerroirs] = useState(false);
  const searchInputRef = useRef(null);
  const dropdownRef = useRef(null);

  // Global Ctrl+K shortcut to focus search
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Debounced search
  useEffect(() => {
    if (!searchQuery || searchQuery.trim().length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    // Check if query is direct lat,lng format e.g. "33.89, -5.55"
    const coordMatch = searchQuery.match(/^(-?\d+(\.\d+)?)[,\s]+(-?\d+(\.\d+)?)$/);
    if (coordMatch) {
      const lat = parseFloat(coordMatch[1]);
      const lng = parseFloat(coordMatch[3]);
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        setSearchResults([
          {
            id: 'coords',
            name: `${t('common.coordinates', {}, 'Coordinates')}: [${lat.toFixed(4)}°, ${lng.toFixed(4)}°]`,
            shortName: t('toolbar.customCoords', {}, 'Custom Coordinates'),
            lat,
            lng,
          },
        ]);
        setIsOpenDropdown(true);
        return;
      }
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      const results = await searchLocation(searchQuery);
      setSearchResults(results);
      setIsSearching(false);
      setIsOpenDropdown(results.length > 0);
    }, 350);

    return () => clearTimeout(timer);
  }, [searchQuery, t]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpenDropdown(false);
        setShowTerroirs(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectResult = (result) => {
    setIsOpenDropdown(false);
    setShowTerroirs(false);
    setSearchQuery('');
    onFlyToLocation({
      name: result.shortName || result.name,
      coordinates: [result.lng, result.lat],
      zoom: 14.5,
      pitch: 45,
      bearing: 0,
    });
  };

  // ─── IP Geolocation Fallback ─────────────────────────────────────────────
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
      console.warn('Primary IP lookup notice:', e1);
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
      console.warn('Secondary IP lookup notice:', e2);
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
          triggerFlight(longitude, latitude, t('toolbar.detectedFarm', {}, 'My Farm (Detected GPS)'));
        },
        async (error) => {
          console.warn('Browser GPS unavailable, using network location fallback:', error);
          const ipData = await fetchIpLocation();
          if (ipData) {
            triggerFlight(ipData.longitude, ipData.latitude, ipData.name);
          } else {
            setIsLocating(false);
            setErrorMsg(t('toolbar.locationBlocked', {}, 'Location blocked. Please allow location access or search above.'));
            setTimeout(() => setErrorMsg(null), 4000);
          }
        },
        {
          enableHighAccuracy: false,
          timeout: 4000,
          maximumAge: 300000,
        }
      );
    } else {
      fetchIpLocation().then((ipData) => {
        if (ipData) {
          triggerFlight(ipData.longitude, ipData.latitude, ipData.name);
        } else {
          setIsLocating(false);
          setErrorMsg(t('toolbar.locationUnavailable', {}, 'Location unavailable'));
          setTimeout(() => setErrorMsg(null), 4000);
        }
      });
    }
  };

  return (
    <div
      className="flex flex-col items-end gap-1.5 select-none font-body"
      ref={dropdownRef}
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      {/* ── Main Light Mode Control Strip ── */}
      <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-white/95 border border-slate-200/90 backdrop-blur-2xl shadow-[0_10px_35px_-5px_rgba(15,23,42,0.15),0_0_0_1px_rgba(0,0,0,0.03)] text-slate-800">
        
        {/* Dynamic Language Switcher */}
        <div className="flex items-center p-0.5 rounded-lg bg-slate-100 border border-slate-200/80">
          {/* Dynamic Native Terroir Button */}
          <button
            type="button"
            onClick={() => toggleLanguageMode('native')}
            className={`px-2 py-1 rounded-md text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
              !isManualEnglish
                ? 'bg-white text-cyan-900 font-bold shadow-xs border border-slate-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
            title={`Local Native Language: ${langInfo?.name || 'Local'} (${langInfo?.country || 'Detected Region'})`}
          >
            <span className="text-xs">{langInfo?.flag || '🌐'}</span>
            <span className="max-w-[85px] truncate">{langInfo?.native || langInfo?.name || 'Native'}</span>
          </button>

          {/* Global English Toggle Button */}
          <button
            type="button"
            onClick={() => toggleLanguageMode('en')}
            className={`px-2 py-1 rounded-md text-xs font-medium transition-all cursor-pointer flex items-center gap-1 ${
              isManualEnglish
                ? 'bg-white text-cyan-900 font-bold shadow-xs border border-slate-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
            title="Switch to Global English"
          >
            <span className="text-xs">🇺🇸</span>
            <span>EN</span>
          </button>

          {isTranslating && (
            <span className="px-1.5 py-0.5 text-xs text-cyan-700 animate-pulse flex items-center gap-1" title="Translating UI dynamically with Gemini AI...">
              <Loader2 className="w-3 h-3 animate-spin text-cyan-600" />
            </span>
          )}
        </div>

        {/* Moroccan Terroirs Quick Selector Button */}
        <button
          type="button"
          onClick={() => {
            setShowTerroirs(!showTerroirs);
            setIsOpenDropdown(false);
          }}
          className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition-all cursor-pointer ${
            showTerroirs
              ? 'bg-emerald-100 border-emerald-300 text-emerald-900 shadow-xs'
              : 'bg-slate-50 border-slate-200 text-slate-700 hover:text-slate-900 hover:bg-white'
          }`}
          title="Quick Fly to Moroccan Agricultural Terroirs"
        >
          <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
          <span className="hidden sm:inline">Terroirs</span>
        </button>

        {/* Live Search Input with Ctrl+K Badge */}
        <div className="relative flex items-center">
          <Search className={`absolute ${isRtl ? 'right-2.5' : 'left-2.5'} w-3.5 h-3.5 text-slate-400 pointer-events-none`} />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => {
              if (searchResults.length > 0) setIsOpenDropdown(true);
              setShowTerroirs(false);
            }}
            placeholder={t('toolbar.searchPlaceholder', {}, 'Search farm, city or lat,lng…')}
            className={`w-44 sm:w-56 ${isRtl ? 'pr-8 pl-12' : 'pl-8 pr-12'} py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/20 transition`}
          />
          {searchQuery ? (
            <button
              onClick={() => {
                setSearchQuery('');
                setSearchResults([]);
              }}
              type="button"
              className={`absolute ${isRtl ? 'left-2' : 'right-2'} p-0.5 text-slate-400 hover:text-slate-700 cursor-pointer`}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : (
            <span className={`absolute ${isRtl ? 'left-2' : 'right-2'} hidden sm:inline px-1 py-0.5 rounded text-[8px] font-mono text-slate-400 bg-white border border-slate-200 pointer-events-none`}>
              Ctrl K
            </span>
          )}
          {isSearching && (
            <Loader2 className={`absolute ${isRtl ? 'left-8' : 'right-8'} w-3 h-3 animate-spin text-cyan-600`} />
          )}
        </div>

        {/* Tactical Crosshair Button: Get My Location */}
        <button
          onClick={handleGetMyLocation}
          disabled={isLocating || isFlying}
          type="button"
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-300 cursor-pointer whitespace-nowrap border ${
            isLocating
              ? 'bg-cyan-50 border-cyan-300 text-cyan-800 animate-pulse'
              : 'bg-slate-50 hover:bg-white border-slate-200 text-slate-700 hover:text-slate-900 shadow-xs'
          }`}
          title="Zoom to your farm location via GPS"
        >
          {isLocating ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-600" />
          ) : (
            <LocateFixed className="w-3.5 h-3.5 text-cyan-600" />
          )}
          <span className="hidden sm:inline">{isLocating ? t('toolbar.locating', {}, 'Locating…') : t('toolbar.myGps', {}, 'GPS')}</span>
        </button>
      </div>

      {/* Moroccan Terroirs Drawer */}
      {showTerroirs && (
        <div className="w-72 sm:w-80 rounded-xl bg-white/98 border border-slate-200 backdrop-blur-2xl shadow-[0_20px_50px_rgba(15,23,42,0.18)] p-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150 text-slate-800">
          <div className="px-2 py-1 text-xs font-bold text-emerald-800 flex items-center justify-between border-b border-slate-100 mb-1.5">
            <span className="flex items-center gap-1">
              <Compass className="w-3.5 h-3.5 text-emerald-600" /> Moroccan Terroirs (حقول المغرب)
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {MOROCCAN_TERROIRS.map((terroir) => (
              <button
                key={terroir.name}
                onClick={() => handleSelectResult(terroir)}
                type="button"
                className="p-2 rounded-lg bg-slate-50 hover:bg-emerald-50 border border-slate-200/80 hover:border-emerald-300 text-left transition flex flex-col cursor-pointer group"
              >
                <span className="text-xs font-bold text-slate-900 group-hover:text-emerald-800 transition block">
                  {terroir.shortName}
                </span>
                <span className="text-[10px] text-slate-500 truncate">
                  {terroir.name}
                </span>
                <bdi className="text-[10px] font-mono text-emerald-700 mt-0.5">
                  [{terroir.lat.toFixed(2)}°, {terroir.lng.toFixed(2)}°]
                </bdi>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Live Search Auto-Complete Dropdown */}
      {isOpenDropdown && searchResults.length > 0 && (
        <div className="w-72 sm:w-80 max-h-60 overflow-y-auto rounded-xl bg-white/98 border border-slate-200 backdrop-blur-2xl shadow-[0_20px_50px_rgba(15,23,42,0.18)] p-1.5 space-y-1 z-50 custom-scrollbar text-slate-800">
          <div className="px-2.5 py-1 text-[11px] font-bold text-cyan-900 flex items-center justify-between border-b border-slate-100">
            <span>{t('toolbar.matchesFound', {}, 'Global Geocoding Matches')}</span>
            <span className="text-slate-400 font-normal">{searchResults.length} {t('toolbar.itemsFound', {}, 'found')}</span>
          </div>
          {searchResults.map((item) => (
            <button
              key={item.id}
              onClick={() => handleSelectResult(item)}
              type="button"
              className="w-full text-left p-2 rounded-lg hover:bg-slate-50 border border-transparent hover:border-slate-200 transition flex items-start gap-2.5 cursor-pointer group"
            >
              <MapPin className="w-3.5 h-3.5 text-cyan-600 shrink-0 mt-0.5 group-hover:scale-110 transition" />
              <div className="truncate">
                <span className="text-xs font-bold text-slate-900 group-hover:text-cyan-800 transition block truncate">
                  {item.shortName}
                </span>
                <span className="text-[10px] text-slate-500 block truncate">
                  {item.name}
                </span>
                <bdi className="text-[10px] font-mono text-cyan-700 block mt-0.5">
                  [{item.lat.toFixed(4)}°, {item.lng.toFixed(4)}°]
                </bdi>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Notice Pill */}
      {errorMsg && (
        <div className="px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 text-xs font-medium shadow-md">
          ⚠️ {errorMsg}
        </div>
      )}
    </div>
  );
}
