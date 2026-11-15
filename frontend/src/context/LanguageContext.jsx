import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import en from '../i18n/en.json';

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  // Current active language info (dynamically resolved from map location or choice)
  const [langInfo, setLangInfo] = useState({
    code: 'en',
    name: 'English',
    native: 'English',
    country: 'Global',
    flag: '🌐',
    dir: 'ltr',
  });

  // Dynamic translated dictionary (defaults to en.json)
  const [activeDict, setActiveDict] = useState(en);
  const [isTranslating, setIsTranslating] = useState(false);
  const [isManualEnglish, setIsManualEnglish] = useState(false);

  // In-memory cache for translated dictionaries during the session
  const cacheRef = useRef({ en });
  const lastLocationRef = useRef(null);

  // Sync HTML document direction and lang attributes
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('dir', isManualEnglish ? 'ltr' : langInfo.dir || 'ltr');
      document.documentElement.setAttribute('lang', isManualEnglish ? 'en' : langInfo.code || 'en');
    }
  }, [langInfo, isManualEnglish]);

  // Translate for any given location dynamically
  const translateForLocation = useCallback(
    async (locationData) => {
      if (!locationData) return;
      lastLocationRef.current = locationData;

      const cacheKey = `${locationData.country_code || ''}:${locationData.country || ''}:${locationData.lat || ''},${locationData.lng || ''}`;

      // Check in-memory session cache first
      if (cacheRef.current[cacheKey]) {
        const cached = cacheRef.current[cacheKey];
        setLangInfo(cached.info);
        if (!isManualEnglish) {
          setActiveDict(cached.dict);
        }
        return;
      }

      try {
        setIsTranslating(true);
        const resp = await fetch('/api/i18n/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            target_language: 'auto',
            location: {
              name: locationData.displayName || locationData.name || '',
              country: locationData.country || '',
              country_code: locationData.country_code || '',
              lat: locationData.lat,
              lng: locationData.lng,
            },
            strings: en,
          }),
        });

        if (resp.ok) {
          const data = await resp.json();
          if (data && data.translated_strings) {
            const newInfo = {
              code: data.language_code || 'en',
              name: data.language_name || 'English',
              native: data.language_native || data.language_name || 'English',
              country: data.country || locationData.country || '',
              flag: data.country_flag || '🌐',
              dir: data.direction || 'ltr',
            };

            cacheRef.current[cacheKey] = {
              info: newInfo,
              dict: data.translated_strings,
            };

            setLangInfo(newInfo);
            if (!isManualEnglish) {
              setActiveDict(data.translated_strings);
            }
          }
        }
      } catch (err) {
        console.warn('Universal dynamic translation error:', err);
      } finally {
        setIsTranslating(false);
      }
    },
    [isManualEnglish]
  );

  // Sync with selected map location
  const syncWithLocation = useCallback(
    (locationData) => {
      translateForLocation(locationData);
    },
    [translateForLocation]
  );

  // Toggle between English and native local language
  const toggleLanguageMode = useCallback(
    (mode) => {
      if (mode === 'en') {
        setIsManualEnglish(true);
        setActiveDict(en);
      } else {
        setIsManualEnglish(false);
        if (lastLocationRef.current) {
          const loc = lastLocationRef.current;
          const cacheKey = `${loc.country_code || ''}:${loc.country || ''}:${loc.lat || ''},${loc.lng || ''}`;
          if (cacheRef.current[cacheKey]) {
            setActiveDict(cacheRef.current[cacheKey].dict);
            setLangInfo(cacheRef.current[cacheKey].info);
          } else {
            translateForLocation(loc);
          }
        }
      }
    },
    [translateForLocation]
  );

  // Translation resolver with fallback and interpolation
  const t = useCallback(
    (keyPath, params = {}, fallback = '') => {
      if (!keyPath) return '';
      const keys = keyPath.split('.');

      // 1. Try currently active dynamic translated dictionary
      let val = activeDict;
      for (const k of keys) {
        val = val?.[k];
        if (val === undefined) break;
      }

      // 2. Fallback to English dictionary
      if (val === undefined) {
        let fallbackVal = en;
        for (const k of keys) {
          fallbackVal = fallbackVal?.[k];
          if (fallbackVal === undefined) break;
        }
        val = fallbackVal;
      }

      // 3. Fallback to provided fallback string or keyPath
      if (val === undefined || typeof val !== 'string') {
        val = fallback || keyPath;
      }

      // 4. Interpolate {param} placeholders dynamically
      if (typeof val === 'string' && params && typeof params === 'object') {
        Object.entries(params).forEach(([pk, pv]) => {
          val = val.replace(new RegExp(`\\{${pk}\\}`, 'g'), String(pv));
        });
      }

      return val;
    },
    [activeDict]
  );

  const value = useMemo(
    () => ({
      language: isManualEnglish ? 'en' : langInfo.code,
      langInfo,
      isManualEnglish,
      toggleLanguageMode,
      syncWithLocation,
      isRtl: isManualEnglish ? false : langInfo.dir === 'rtl',
      dir: isManualEnglish ? 'ltr' : langInfo.dir,
      t,
      isTranslating,
    }),
    [langInfo, isManualEnglish, toggleLanguageMode, syncWithLocation, t, isTranslating]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useTranslation() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useTranslation must be used within a LanguageProvider');
  }
  return context;
}
