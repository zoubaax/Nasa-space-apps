import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import en from '../i18n/en.json';
import { translations } from '../i18n/translations';

const LanguageContext = createContext(null);

const ARABIC_COUNTRIES = {
  ma: { name: 'Morocco', native: 'المغرب · الدارجة', flag: '🇲🇦' },
  dz: { name: 'Algeria', native: 'الجزائر · العربية', flag: '🇩🇿' },
  tn: { name: 'Tunisia', native: 'تونس · العربية', flag: '🇹🇳' },
  eg: { name: 'Egypt', native: 'مصر · العربية', flag: '🇪🇬' },
  sa: { name: 'Saudi Arabia', native: 'السعودية · العربية', flag: '🇸🇦' },
  ae: { name: 'United Arab Emirates', native: 'الإمارات · العربية', flag: '🇦🇪' },
  qa: { name: 'Qatar', native: 'قطر · العربية', flag: '🇶🇦' },
  kw: { name: 'Kuwait', native: 'الكويت · العربية', flag: '🇰🇼' },
  bh: { name: 'Bahrain', native: 'البحرين · العربية', flag: '🇧🇭' },
  om: { name: 'Oman', native: 'عمان · العربية', flag: '🇴🇲' },
  jo: { name: 'Jordan', native: 'الأردن · العربية', flag: '🇯🇴' },
  lb: { name: 'Lebanon', native: 'لبنان · العربية', flag: '🇱🇧' },
  iq: { name: 'Iraq', native: 'العراق · العربية', flag: '🇮🇶' },
  sy: { name: 'Syria', native: 'سوريا · العربية', flag: '🇸🇾' },
  ye: { name: 'Yemen', native: 'اليمن · العربية', flag: '🇾🇪' },
  ly: { name: 'Libya', native: 'ليبيا · العربية', flag: '🇱🇾' },
  sd: { name: 'Sudan', native: 'السودان · العربية', flag: '🇸🇩' },
  mr: { name: 'Mauritania', native: 'موريتانيا · العربية', flag: '🇲🇷' },
  ps: { name: 'Palestine', native: 'فلسطين · العربية', flag: '🇵🇸' },
  so: { name: 'Somalia', native: 'الصومال · العربية', flag: '🇸🇴' },
  dj: { name: 'Djibouti', native: 'جيبوتي · العربية', flag: '🇩🇯' },
  km: { name: 'Comoros', native: 'جزر القمر · العربية', flag: '🇰🇲' },
};

const ARABIC_NAMES = [
  'morocco', 'maroc', 'egypt', 'algeria', 'algerie', 'tunisia', 'tunisie',
  'libya', 'sudan', 'saudi', 'emirates', 'qatar', 'kuwait', 'bahrain',
  'oman', 'yemen', 'jordan', 'lebanon', 'syria', 'iraq', 'palestine', 'mauritania'
];

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
      const isArabicCountry = Boolean(ARABIC_COUNTRIES[cCode]) || ARABIC_NAMES.some((n) => cCountry.includes(n));

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

      // ── Arabic countries: 100% local resolution, never call backend ──────────
      // The backend fast-path returns the ENGLISH strings unchanged (no translation),
      // which then overwrite the pre-baked translations.ar when merged → reverting UI to English.
      // We already have the complete translations.ar bundle locally, so skip the network call.
      if (isArabicCountry && !isManualEnglish) {
        const arabData = ARABIC_COUNTRIES[cCode] || {
          name: locationData.country || 'Arab World',
          native: 'العربية',
          flag: '🌐',
        };
        const arabicInfo = {
          code: 'ar',
          name: cCode === 'ma' ? 'Moroccan Darija' : 'Arabic',
          native: arabData.native,
          country: arabData.name,
          flag: arabData.flag,
          dir: 'rtl',
        };
        cacheRef.current[cacheKey] = { info: arabicInfo, dict: translations.ar };
        setLangInfo(arabicInfo);
        setActiveDict(translations.ar);
        return; // ← Done! No backend call needed.
      }

      // ── French / Spanish: also serve locally without network call ─────────
      if ((cCode === 'fr' || cCode === 'es') && !isManualEnglish) {
        const localCode = cCode;
        const localDict = translations[localCode] || en;
        cacheRef.current[cacheKey] = {
          info: { code: localCode, name: localCode === 'fr' ? 'French' : 'Spanish', native: localCode === 'fr' ? 'Français' : 'Español', country: locationData.country || '', flag: localCode === 'fr' ? '🇫🇷' : '🇪🇸', dir: 'ltr' },
          dict: localDict,
        };
        setLangInfo(cacheRef.current[cacheKey].info);
        setActiveDict(localDict);
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
            const resolvedCode = (data.language_code || 'en').toLowerCase();
            const fallbackPrebaked = translations[resolvedCode] || null;
            
            // For non-Arabic/non-bundled languages: merge pre-baked base + backend translations
            // But NEVER let backend overwrite Arabic keys — guard by checking direction
            const mergedDict = fallbackPrebaked
              ? { ...fallbackPrebaked, ...data.translated_strings }
              : { ...en, ...data.translated_strings };

            const newInfo = {
              code: resolvedCode,
              name: data.language_name || 'English',
              native: data.language_native || data.language_name || 'English',
              country: data.country || locationData.country || '',
              flag: data.country_flag || '🌐',
              dir: data.direction || 'ltr',
            };

            cacheRef.current[cacheKey] = { info: newInfo, dict: mergedDict };

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
