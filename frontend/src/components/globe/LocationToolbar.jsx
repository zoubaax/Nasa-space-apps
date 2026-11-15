import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Compass,
  MapPin,
  X,
  Loader2,
  LocateFixed,
  Layers,
} from 'lucide-react';
import { searchLocation } from '../../utils/geo';
import { useTranslation } from '../../context/LanguageContext';

// Moroccan Agricultural Terroirs for quick exploration
const MOROCCAN_TERROIRS = [
  { name: 'Saïss / Meknes', shortName: 'Saïss', lng: -5.55, lat: 33.89 },
  { name: 'Gharb / Sidi Slimane', shortName: 'Gharb', lng: -5.92, lat: 34.26 },
  { name: 'Tadla / Beni Mellal', shortName: 'Tadla', lng: -6.36, lat: 32.34 },
  { name: 'Souss / Taroudant', shortName: 'Souss', lng: -8.87, lat: 30.47 },
  { name: 'Chaouia / Settat', shortName: 'Chaouia', lng: -7.62, lat: 33.00 },
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
        setIsSearching(false);
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

  // Click outside to close dropdown
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
      lat: result.lat,
      lng: result.lng,
      coordinates: [result.lng, result.lat],
      zoom: result.zoom || 13,
      pitch: result.pitch || 45,
    });
  };

  // ─── IP Geolocation Fallback (Fast Cloudflare + Multi-Tier) ────────────────
  const fetchIpLocation = async () => {
    // 1. Primary: geojs.io (Cloudflare edge, no CORS or adblock issues)
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
            name: `${data.city || 'Local Terroir'}, ${data.country || 'Detected Region'}`,
          };
        }
      }
    } catch (e1) {
      console.warn('GeoJS lookup error:', e1);
    }

    // 2. Secondary: ipwho.is
    try {
      const res = await fetch('https://ipwho.is/');
      if (res.ok) {
        const data = await res.json();
        if (data && data.success !== false && data.latitude && data.longitude) {
          return {
            lat: parseFloat(data.latitude),
            lng: parseFloat(data.longitude),
            name: `${data.city || 'Local Terroir'}, ${data.country || 'Detected Region'}`,
          };
        }
      }
    } catch (e2) {
      console.warn('ipwho lookup error:', e2);
    }

    // 3. Tertiary: ipapi.co
    try {
      const res = await fetch('https://ipapi.co/json/');
      if (res.ok) {
        const data = await res.json();
        if (data.latitude && data.longitude) {
          return {
            lat: parseFloat(data.latitude),
            lng: parseFloat(data.longitude),
            name: `${data.city || 'Local Farm'}, ${data.country_name || 'Detected Region'}`,
          };
        }
      }
    } catch (e3) {
      console.warn('ipapi lookup error:', e3);
    }

    // 4. Default graceful fallback: Moroccan Pilot Terroir (Saïss Plateau)
    return {
      lat: 33.89,
      lng: -5.55,
      name: 'Saïss / Meknes, Morocco',
    };
  };

  // ─── Locate Button Handler ───────────────────────────────────────────────
  const handleLocateMe = () => {
    if (isLocating || isFlying) return;
    setIsLocating(true);
    setErrorMsg(null);

    const onLocationResolved = (loc) => {
      setIsLocating(false);
      onFlyToLocation({
        name: loc.name || t('toolbar.myFarm', {}, 'My Current Farm Location'),
        lat: loc.lat,
        lng: loc.lng,
        coordinates: [loc.lng, loc.lat],
        zoom: 14,
        pitch: 45,
      });
    };

    const fallbackToIp = async () => {
      try {
        const ipLoc = await fetchIpLocation();
        if (ipLoc) {
          onLocationResolved(ipLoc);
          return;
        }
      } catch (err) {
        console.warn('IP resolution failed:', err);
      }
      setIsLocating(false);
      setErrorMsg(t('toolbar.locationError', {}, 'Unable to determine GPS coordinates.'));
      setTimeout(() => setErrorMsg(null), 4000);
    };

    if (!navigator.geolocation) {
      fallbackToIp();
      return;
    }

    // Use fast Wi-Fi / cell location with 3.5s timeout (prevents hanging on desktop PCs without GPS)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onLocationResolved({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          name: t('toolbar.myFarm', {}, 'My Current Farm Location'),
        });
      },
      (err) => {
        console.warn('Browser GPS unavailable/denied, falling back to IP geo:', err);
        fallbackToIp();
      },
      { timeout: 3500, enableHighAccuracy: false, maximumAge: 300000 }
    );
  };

  return (
    <div
      className="flex flex-col items-end gap-2 select-none font-body text-zinc-100"
      ref={dropdownRef}
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      {/* ── Main Slate Control Strip ── */}
      <div className="flex flex-wrap items-center gap-2 p-1.5 sm:p-2 rounded-2xl bg-[#0b0e14]/95 border border-zinc-800 shadow-2xl backdrop-blur-2xl text-zinc-100">
        
        {/* Dynamic Language Switcher */}
        <div className="flex items-center p-0.5 rounded-xl bg-zinc-900 border border-zinc-800">
          <button
            type="button"
            onClick={() => toggleLanguageMode('native')}
            className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition cursor-pointer flex items-center gap-1.5 ${
              !isManualEnglish
                ? 'bg-zinc-800 text-zinc-100 font-bold shadow-xs border border-zinc-700/80'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
            title={`Local Native Language: ${langInfo?.name || 'Local'} (${langInfo?.country || 'Detected Region'})`}
          >
            <span className="text-sm">{langInfo?.flag || '🌐'}</span>
            <span className="hidden sm:inline max-w-[95px] truncate">{langInfo?.native || langInfo?.name || 'Native'}</span>
          </button>

          <button
            type="button"
            onClick={() => toggleLanguageMode('en')}
            className={`px-2 sm:px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition cursor-pointer flex items-center gap-1.5 ${
              isManualEnglish
                ? 'bg-zinc-800 text-zinc-100 font-bold shadow-xs border border-zinc-700/80'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
            title="Switch to Global English"
          >
            <span className="text-sm">🇺🇸</span>
            <span className="hidden xs:inline">EN</span>
          </button>

          {isTranslating && (
            <span className="px-1.5 py-1 text-xs text-zinc-400 animate-pulse flex items-center gap-1">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-400" />
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
          className={`p-2 sm:px-3.5 sm:py-2 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-2 border transition cursor-pointer ${
            showTerroirs
              ? 'bg-zinc-800 border-zinc-700 text-zinc-100 shadow-sm'
              : 'bg-zinc-900/80 border-zinc-800 text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800'
          }`}
          title="Quick Fly to Moroccan Agricultural Terroirs"
        >
          <Layers className="w-4 h-4 text-zinc-400" />
          <span className="hidden sm:inline">{t('toolbar.terroirs', {}, 'Terroirs')}</span>
        </button>

        {/* Live Search Input with Ctrl+K Badge */}
        <div className="relative flex items-center">
          <Search className={`absolute ${isRtl ? 'right-2.5 sm:right-3' : 'left-2.5 sm:left-3'} w-3.5 h-3.5 sm:w-4 sm:h-4 text-zinc-400 pointer-events-none`} />
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
            className={`w-28 xs:w-36 sm:w-56 md:w-72 lg:w-80 ${isRtl ? 'pr-8 sm:pr-9 pl-8 sm:pl-14' : 'pl-8 sm:pl-9 pr-8 sm:pr-14'} py-1.5 sm:py-2 rounded-xl bg-zinc-900 border border-zinc-700/80 text-xs sm:text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-500 transition`}
          />
          {searchQuery ? (
            <button
              onClick={() => {
                setSearchQuery('');
                setSearchResults([]);
              }}
              type="button"
              className={`absolute ${isRtl ? 'left-2' : 'right-2'} p-1 text-zinc-400 hover:text-zinc-200 cursor-pointer`}
            >
              <X className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
          ) : (
            <span className={`absolute ${isRtl ? 'left-2.5' : 'right-2.5'} hidden sm:inline px-1.5 py-0.5 rounded text-[10px] font-mono text-zinc-400 bg-zinc-800 border border-zinc-700 pointer-events-none`}>
              Ctrl K
            </span>
          )}
          {isSearching && (
            <Loader2 className={`absolute ${isRtl ? 'left-7 sm:left-9' : 'right-7 sm:right-9'} w-3.5 h-3.5 animate-spin text-zinc-400`} />
          )}
        </div>

        {/* Tactical Crosshair Button: Get My Location */}
        <button
          onClick={handleLocateMe}
          disabled={isLocating || isFlying}
          type="button"
          className={`flex items-center gap-1.5 p-2 sm:px-4 sm:py-2 rounded-xl text-xs sm:text-sm font-bold transition cursor-pointer whitespace-nowrap border ${
            isLocating
              ? 'bg-zinc-800 border-zinc-600 text-zinc-100 animate-pulse'
              : 'bg-zinc-900/80 hover:bg-zinc-800 border-zinc-800 text-zinc-200 hover:text-white shadow-sm'
          }`}
          title="Zoom to your farm location via GPS"
        >
          {isLocating ? (
            <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
          ) : (
            <LocateFixed className="w-4 h-4 text-zinc-300" />
          )}
          <span className="hidden sm:inline">{isLocating ? t('toolbar.locating', {}, 'Locating…') : t('toolbar.myGps', {}, 'GPS')}</span>
        </button>
      </div>

      {/* Moroccan Terroirs Drawer */}
      {showTerroirs && (
        <div className="w-[calc(100vw-2rem)] sm:w-96 max-h-[70vh] overflow-y-auto rounded-2xl bg-[#0b0e14]/98 border border-zinc-800 shadow-2xl p-3 z-50 text-zinc-100">
          <div className="px-2 py-1.5 text-xs sm:text-sm font-bold text-zinc-300 flex items-center justify-between border-b border-zinc-800 mb-2">
            <span className="flex items-center gap-2">
              <Compass className="w-4 h-4 text-zinc-400" /> {t('toolbar.moroccanTerroirs', {}, 'Moroccan Terroirs (حقول المغرب)')}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {MOROCCAN_TERROIRS.map((terroir) => (
              <button
                key={terroir.name}
                onClick={() => handleSelectResult(terroir)}
                type="button"
                className="p-2.5 rounded-xl bg-zinc-900/70 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-left transition flex flex-col cursor-pointer group"
              >
                <span className="text-xs sm:text-sm font-bold text-zinc-100 group-hover:text-white transition block">
                  {terroir.shortName}
                </span>
                <span className="text-xs text-zinc-400 truncate">
                  {terroir.name}
                </span>
                <bdi className="text-xs font-mono text-zinc-400 mt-0.5">
                  [{terroir.lat.toFixed(2)}°, {terroir.lng.toFixed(2)}°]
                </bdi>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Live Search Auto-Complete Dropdown */}
      {isOpenDropdown && searchResults.length > 0 && (
        <div className="w-80 sm:w-96 max-h-72 overflow-y-auto rounded-2xl bg-[#0b0e14]/98 border border-zinc-800 shadow-2xl p-2 space-y-1 z-50 custom-scrollbar text-zinc-100">
          <div className="px-3 py-1.5 text-xs font-bold text-zinc-400 flex items-center justify-between border-b border-zinc-800">
            <span>{t('toolbar.matchesFound', {}, 'Global Geocoding Matches')}</span>
            <span className="text-zinc-500 font-mono text-xs">{searchResults.length} {t('toolbar.itemsFound', {}, 'found')}</span>
          </div>
          {searchResults.map((item) => (
            <button
              key={item.id}
              onClick={() => handleSelectResult(item)}
              type="button"
              className="w-full text-left p-2.5 rounded-xl hover:bg-zinc-800 border border-transparent hover:border-zinc-700 transition flex items-start gap-3 cursor-pointer group"
            >
              <MapPin className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5 group-hover:text-zinc-200 transition" />
              <div className="truncate">
                <span className="text-xs sm:text-sm font-bold text-zinc-100 group-hover:text-white transition block truncate">
                  {item.shortName}
                </span>
                <span className="text-xs text-zinc-400 block truncate">
                  {item.name}
                </span>
                <bdi className="text-xs font-mono text-zinc-400 block mt-0.5">
                  [{item.lat.toFixed(4)}°, {item.lng.toFixed(4)}°]
                </bdi>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Notice Pill */}
      {errorMsg && (
        <div className="px-4 py-2 rounded-xl bg-amber-950/90 border border-amber-500/40 text-amber-300 text-xs sm:text-sm font-medium shadow-md">
          ⚠️ {errorMsg}
        </div>
      )}
    </div>
  );
}
