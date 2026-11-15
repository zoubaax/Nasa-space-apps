import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import en from '../i18n/en.json';
import { translations } from '../i18n/translations';

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

      const cCode = (locationData.country_code || '').toLowerCase();
      const cCountry = (locationData.country || '').toLowerCase();
      const isMorocco = cCode === 'ma' || cCountry.includes('morocco') || cCountry.includes('maroc');

      // Instant optimistic local resolution if Moroccan terroir or known language
      if (isMorocco && !isManualEnglish) {
        const moroccoInfo = {
          code: 'ar',
          name: 'Moroccan Darija',
          native: 'الدارجة المغربية',
          country: 'Morocco',
          flag: '🇲🇦',
          dir: 'rtl',
        };
        setLangInfo(moroccoInfo);
        setActiveDict(translations.ar);
      } else if (cCode === 'fr' && !isManualEnglish) {
        setLangInfo({
          code: 'fr',
          name: 'French',
          native: 'Français',
          country: 'France',
          flag: '🇫🇷',
          dir: 'ltr',
        });
        setActiveDict(translations.fr);
      } else if (cCode === 'es' && !isManualEnglish) {
        setLangInfo({
          code: 'es',
          name: 'Spanish',
          native: 'Español',
          country: 'Spain',
          flag: '🇪🇸',
          dir: 'ltr',
        });
        setActiveDict(translations.es);
      }

      const cacheKey = `${locationData.country_code || ''}:${locationData.country || ''}:${locationData.lat || ''},${locationData.lng || ''}`;

      // Check in-memory session cache
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
            target_language: isMorocco ? 'ar' : 'auto',
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
            const resolvedCode = (data.language_code || 'en').toLowerCase();
            const fallbackPrebaked = translations[resolvedCode] || (data.direction === 'rtl' ? translations.ar : null);
            
            // Merge translated strings with pre-baked base so no keys are ever missing
            const mergedDict = {
              ...(fallbackPrebaked || en),
              ...data.translated_strings,
            };

            const newInfo = {
              code: resolvedCode,
              name: data.language_name || 'English',
              native: data.language_native || data.language_name || 'English',
              country: data.country || locationData.country || '',
              flag: data.country_flag || '🌐',
              dir: data.direction || 'ltr',
            };

            cacheRef.current[cacheKey] = {
              info: newInfo,
              dict: mergedDict,
            };

            setLangInfo(newInfo);
            if (!isManualEnglish) {
              setActiveDict(mergedDict);
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

      // 2. Fallback to bundled pre-baked dictionary for current language if not English
      if (val === undefined && !isManualEnglish && langInfo.code) {
        const prebaked = translations[langInfo.code] || (langInfo.dir === 'rtl' ? translations.ar : null);
        if (prebaked) {
          let preVal = prebaked;
          for (const k of keys) {
            preVal = preVal?.[k];
            if (preVal === undefined) break;
          }
          val = preVal;
        }
      }

      // 3. Fallback to English dictionary
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
