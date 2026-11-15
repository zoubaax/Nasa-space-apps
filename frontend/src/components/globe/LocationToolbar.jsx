import React, { useState, useEffect, useRef } from 'react';
import { TbCurrentLocation, TbLoader2, TbSearch, TbMapPin, TbX } from 'react-icons/tb';
import { searchLocation } from '../../utils/geo';
import { useTranslation } from '../../context/LanguageContext';

export default function LocationToolbar({ onFlyToLocation, isFlying = false }) {
  const { t, langInfo, isManualEnglish, toggleLanguageMode, isRtl, isTranslating } = useTranslation();
  const [isLocating, setIsLocating] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  // Live Location Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isOpenDropdown, setIsOpenDropdown] = useState(false);
  const dropdownRef = useRef(null);

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
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectResult = (result) => {
    setIsOpenDropdown(false);
    setSearchQuery('');
    onFlyToLocation({
      name: result.shortName || result.name,
      coordinates: [result.lng, result.lat],
      zoom: 14.5,
      pitch: 45,
      bearing: 0,
    });
  };

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
      className="flex flex-col items-end gap-2 select-none"
      ref={dropdownRef}
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <div className="flex flex-wrap items-center gap-2 p-1.5 rounded-2xl bg-zinc-950/85 border border-zinc-800/80 backdrop-blur-xl shadow-2xl">
        
        {/* Universal Dynamic Language Switcher */}
        <div className="flex items-center p-0.5 rounded-xl bg-zinc-900/90 border border-zinc-700/60 shadow-inner">
          {/* Dynamic Native Terroir Button */}
          <button
            type="button"
            onClick={() => toggleLanguageMode('native')}
            className={`px-2 py-1.5 rounded-lg text-[10px] font-mono font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              !isManualEnglish
                ? 'bg-cyan-500 text-black shadow-[0_0_12px_rgba(6,182,212,0.6)] font-extrabold'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/80'
            }`}
            title={`Local Native Language: ${langInfo?.name || 'Local'} (${langInfo?.country || 'Detected Region'})`}
          >
            <span className="text-xs">{langInfo?.flag || '🌐'}</span>
            <span className="tracking-wide max-w-[85px] truncate">{langInfo?.native || langInfo?.name || 'Native'}</span>
          </button>

          {/* Global English Toggle Button */}
          <button
            type="button"
            onClick={() => toggleLanguageMode('en')}
            className={`px-2 py-1.5 rounded-lg text-[10px] font-mono font-bold transition-all cursor-pointer flex items-center gap-1 ${
              isManualEnglish
                ? 'bg-cyan-500 text-black shadow-[0_0_12px_rgba(6,182,212,0.6)] font-extrabold'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/80'
            }`}
            title="Switch to Global English"
          >
            <span className="text-xs">🇺🇸</span>
            <span className="tracking-wider">EN</span>
          </button>

          {isTranslating && (
            <span className="px-1.5 py-0.5 text-[9px] font-mono text-cyan-400 animate-pulse flex items-center gap-1" title="Translating UI dynamically with Gemini AI...">
              <TbLoader2 className="w-3 h-3 animate-spin" />
            </span>
          )}
        </div>

        {/* Live Search Input */}
        <div className="relative flex items-center">
          <TbSearch className={`absolute ${isRtl ? 'right-3' : 'left-3'} w-4 h-4 text-cyan-400 pointer-events-none`} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => searchResults.length > 0 && setIsOpenDropdown(true)}
            placeholder={t('toolbar.searchPlaceholder', {}, 'Search farm, city or lat,lng…')}
            className={`w-52 sm:w-64 ${isRtl ? 'pr-9 pl-7' : 'pl-9 pr-7'} py-2 rounded-xl bg-zinc-900/90 border border-zinc-700/60 text-xs font-mono text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-cyan-400 transition`}
          />
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery('');
                setSearchResults([]);
              }}
              type="button"
              className={`absolute ${isRtl ? 'left-2' : 'right-2'} p-1 text-zinc-400 hover:text-white cursor-pointer`}
            >
              <TbX className="w-3.5 h-3.5" />
            </button>
          )}
          {isSearching && (
            <TbLoader2 className={`absolute ${isRtl ? 'left-7' : 'right-7'} w-3.5 h-3.5 animate-spin text-cyan-400`} />
          )}
        </div>

        {/* Hero Button: Get My Location */}
        <button
          onClick={handleGetMyLocation}
          disabled={isLocating || isFlying}
          type="button"
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-mono font-bold transition-all duration-300 cursor-pointer whitespace-nowrap ${
            isLocating
              ? 'bg-cyan-500 text-black shadow-[0_0_20px_rgba(6,182,212,0.6)] animate-pulse'
              : 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black shadow-[0_0_20px_rgba(6,182,212,0.35)] hover:shadow-[0_0_25px_rgba(6,182,212,0.6)]'
          }`}
          title="Zoom to your farm location via GPS"
        >
          {isLocating ? (
            <TbLoader2 className="w-4 h-4 animate-spin text-black" />
          ) : (
            <TbCurrentLocation className="w-4 h-4 text-black animate-pulse" />
          )}
          <span className="hidden sm:inline">{isLocating ? t('toolbar.locating', {}, 'Locating…') : t('toolbar.myGps', {}, 'My GPS')}</span>
        </button>
      </div>

      {/* Live Search Auto-Complete Dropdown */}
      {isOpenDropdown && searchResults.length > 0 && (
        <div className="w-72 sm:w-80 max-h-60 overflow-y-auto rounded-2xl bg-zinc-950/95 border border-cyan-500/30 backdrop-blur-2xl shadow-2xl p-1.5 space-y-1 z-50">
          <div className="px-2.5 py-1 text-[10px] font-mono text-cyan-400 uppercase tracking-wider flex items-center justify-between border-b border-zinc-800/80">
            <span>{t('toolbar.matchesFound', {}, 'Global Geocoding Matches')}</span>
            <span className="text-zinc-500">{searchResults.length} {t('toolbar.itemsFound', {}, 'found')}</span>
          </div>
          {searchResults.map((item) => (
            <button
              key={item.id}
              onClick={() => handleSelectResult(item)}
              type="button"
              className="w-full text-left p-2 rounded-xl hover:bg-zinc-900 border border-transparent hover:border-cyan-500/30 transition flex items-start gap-2.5 cursor-pointer"
            >
              <TbMapPin className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
              <div className="truncate">
                <span className="text-xs font-semibold text-zinc-100 block truncate">
                  {item.shortName}
                </span>
                <span className="text-[10px] font-mono text-zinc-400 block truncate">
                  {item.name}
                </span>
                <span className="text-[9px] font-mono text-cyan-400/80 block mt-0.5">
                  [{item.lat.toFixed(4)}°, {item.lng.toFixed(4)}°]
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Notice Pill */}
      {errorMsg && (
        <div className="px-3 py-1.5 rounded-lg bg-amber-950/90 border border-amber-500/40 text-amber-300 text-[11px] font-mono backdrop-blur-md shadow-lg">
          ⚠️ {errorMsg}
        </div>
      )}
    </div>
  );
}
