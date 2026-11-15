/**
 * NASA Earth Observation & Geolocation Utilities
 * FieldShift AI Monorepo Engine
 */

/**
 * Calculate a ~9km x 9km bounding box polygon representing the
 * native NASA SMAP L4 9km EASE-Grid footprint around a given coordinate.
 */
export function getSmapFootprintGeoJson(lng, lat, sizeKm = 9) {
  const earthRadiusKm = 6371;
  const latDelta = (sizeKm / 2 / earthRadiusKm) * (180 / Math.PI);
  const lngDelta = (sizeKm / 2 / (earthRadiusKm * Math.cos((lat * Math.PI) / 180))) * (180 / Math.PI);

  const minLng = lng - lngDelta;
  const maxLng = lng + lngDelta;
  const minLat = lat - latDelta;
  const maxLat = lat + latDelta;

  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          name: 'NASA SMAP L4 9km Grid Footprint',
          spatialResolution: '9 km EASE-Grid 2.0',
          source: 'NASA JPL / NSIDC SPL4SMGP V8',
        },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [minLng, minLat],
              [maxLng, minLat],
              [maxLng, maxLat],
              [minLng, maxLat],
              [minLng, minLat],
            ],
          ],
        },
      },
    ],
  };
}

/**
 * Reverse geocode a coordinate to get human-readable city/country.
 */
export async function reverseGeocode(lng, lat) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=12`,
      { headers: { 'Accept-Language': 'en' } }
    );
    if (!res.ok) throw new Error('Geocoding request failed');
    const data = await res.json();
    const address = data.address || {};
    const locality =
      address.village ||
      address.town ||
      address.city ||
      address.county ||
      address.state ||
      address.region ||
      'Field Sector';
    const country = address.country || '';
    const countryCode = (address.country_code || '').toLowerCase();
    const displayName = locality && country ? `${locality}, ${country}` : data.display_name || `Plot [${lat.toFixed(3)}°, ${lng.toFixed(3)}°]`;

    return {
      displayName,
      locality,
      country,
      country_code: countryCode,
    };
  } catch {
    return {
      displayName: `Plot [${lat >= 0 ? lat.toFixed(3) + '°N' : Math.abs(lat).toFixed(3) + '°S'}, ${lng >= 0 ? lng.toFixed(3) + '°E' : Math.abs(lng).toFixed(3) + '°W'}]`,
      locality: 'Field Area',
      country: lat >= 0 ? 'Northern Hemisphere' : 'Southern Hemisphere',
      country_code: '',
    };
  }
}

/**
 * Search locations worldwide via OpenStreetMap Nominatim.
 */
export async function searchLocation(query) {
  if (!query || query.trim().length < 2) return [];
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`,
      { headers: { 'Accept-Language': 'en' } }
    );
    if (!res.ok) return [];
    const list = await res.json();
    return list.map((item) => ({
      id: item.place_id,
      name: item.display_name,
      shortName: item.name || item.display_name.split(',')[0],
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon),
    }));
  } catch {
    return [];
  }
}

/**
 * Scientific Climate Classification based on real precipitation and temperature
 * (De Martonne Aridity Index: I = P / (T + 10))
 */
export function classifyClimate(precipMm, tempC) {
  if (precipMm === null || tempC === null || isNaN(precipMm) || isNaN(tempC)) {
    return 'Regional Agricultural Zone';
  }
  const aridityIndex = precipMm / (tempC + 10);
  if (aridityIndex < 5) return 'Hyper-Arid (Extremely Dry)';
  if (aridityIndex < 10) return 'Arid (Desert / High Water Deficit)';
  if (aridityIndex < 20) return 'Semi-Arid (Drought-Vulnerable)';
  if (aridityIndex < 30) return 'Mediterranean / Sub-Humid';
  if (aridityIndex < 40) return 'Humid Continental';
  return 'Per-Humid / High Precipitation';
}

/**
 * Fetch real NASA climate indicators and NASA SMAP Level-4 soil moisture
 * from the FastAPI backend (with reverse proxy via /api).
 * Returns strict live data or explicit null/unobserved states without synthetic dummy values.
 */
export async function fetchEnvironmentalTelemetry(lng, lat, onProgressiveUpdate, year = 2025) {
  try {
    const latFixed = Number(lat.toFixed(4));
    const lngFixed = Number(lng.toFixed(4));
    const selectedYear = Number(year) || 2025;

    let state = {
      isLoading: false,
      isLiveBackend: false,
      isSmapLoading: true,
      selectedYear,
      climateZone: 'Continental / Temperate',
      annualRainfallMm: null,
      meanTempC: null,
      minTempC: null,
      maxTempC: null,
      smapMoistureM3: null,
      surfaceMoistureM3: null,
      profileMoistureM3: null,
      droughtPercentile: null,
      soilTempLayer1: null,
      isRegionalSmap: false,
      smapDistanceKm: null,
      vegetationGreenness: null,
      leafAreaIndex: null,
      infiltrationFlux: null,
      dryDays: null,
      hotDays: null,
      coldDays: null,
      humidity: null,
      solarRadiation: null,
      windSpeed: null,
      rawClimate: null,
      rawSmap: null,
      error: null,
    };

    // 1. Fetch NASA POWER Climate Summary (fast: ~0.5s)
    const climatePromise = fetch(
      `/api/climate/summary?latitude=${latFixed}&longitude=${lngFixed}&start_date=${selectedYear}-01-01&end_date=${selectedYear}-12-31`
    ).then(async (resp) => {
      if (resp.ok) {
        const climateJson = await resp.json();
        state.rawClimate = climateJson;

        const rainVal =
          climateJson.indicators?.total_precipitation ??
          climateJson.indicators?.total_precipitation_mm?.value;
        if (typeof rainVal === 'number' && !isNaN(rainVal)) {
          state.annualRainfallMm = Math.round(rainVal * 10) / 10;
          state.isLiveBackend = true;
        }

        const tempVal =
          climateJson.indicators?.average_temperature ??
          climateJson.indicators?.mean_temperature_c?.value;
        if (typeof tempVal === 'number' && !isNaN(tempVal)) {
          state.meanTempC = Number(tempVal.toFixed(1));
          state.isLiveBackend = true;
        }

        if (typeof climateJson.indicators?.minimum_temperature === 'number') {
          state.minTempC = Number(climateJson.indicators.minimum_temperature.toFixed(1));
        }
        if (typeof climateJson.indicators?.maximum_temperature === 'number') {
          state.maxTempC = Number(climateJson.indicators.maximum_temperature.toFixed(1));
        }

        state.dryDays =
          climateJson.indicators?.dry_days ??
          climateJson.indicators?.dry_days_count?.value ??
          null;
        state.hotDays =
          climateJson.indicators?.hot_days ??
          climateJson.indicators?.hot_days_count?.value ??
          null;
        state.coldDays = climateJson.indicators?.cold_days ?? null;
        state.humidity =
          typeof climateJson.indicators?.average_relative_humidity === 'number'
            ? Number(climateJson.indicators.average_relative_humidity.toFixed(1))
            : null;
        state.solarRadiation =
          typeof climateJson.indicators?.average_solar_radiation === 'number'
            ? Number(climateJson.indicators.average_solar_radiation.toFixed(1))
            : null;
        state.windSpeed =
          typeof climateJson.indicators?.average_wind_speed === 'number'
            ? Number(climateJson.indicators.average_wind_speed.toFixed(1))
            : null;

        state.climateZone = classifyClimate(state.annualRainfallMm, state.meanTempC);

        // Deliver immediate partial update with climate metrics
        if (typeof onProgressiveUpdate === 'function') {
          onProgressiveUpdate({ ...state });
        }
      }
    }).catch((err) => {
      console.warn('NASA POWER climate fetch warning:', err);
    });

    // 2. Fetch NASA SMAP Level-4 GEE Timeseries
    const smapPromise = fetch(
      `/api/smap-gee/timeseries?latitude=${latFixed}&longitude=${lngFixed}&year=${selectedYear}`
    ).then(async (resp) => {
      if (resp.ok) {
        const smapJson = await resp.json();
        state.rawSmap = smapJson;

        if (Array.isArray(smapJson.notes)) {
          const regNote = smapJson.notes.find(
            (n) => typeof n === 'string' && n.includes('Assimilated from nearest regional NASA SMAP L4')
          );
          if (regNote) {
            state.isRegionalSmap = true;
            const matchDist = regNote.match(/(\d+)\s*km/);
            if (matchDist) state.smapDistanceKm = parseInt(matchDist[1], 10);
          }
        }

        if (Array.isArray(smapJson.summary_cards)) {
          const findVal = (id) => smapJson.summary_cards.find((c) => c.id === id)?.value;
          const rz = findVal('sm_rootzone');
          const sf = findVal('sm_surface');
          const pf = findVal('sm_profile');
          const pc = findVal('sm_rootzone_pctl');
          const tp = findVal('soil_temp_layer1');
          const vg = findVal('vegetation_greenness_fraction');
          const lai = findVal('leaf_area_index');
          const inf = findVal('soil_water_infiltration_flux');

          if (typeof rz === 'number') {
            state.smapMoistureM3 = Number(rz.toFixed(3));
            state.isLiveBackend = true;
          }
          if (typeof sf === 'number') state.surfaceMoistureM3 = Number(sf.toFixed(3));
          if (typeof pf === 'number') state.profileMoistureM3 = Number(pf.toFixed(3));
          if (typeof pc === 'number') state.droughtPercentile = Number(pc.toFixed(1));
          if (typeof tp === 'number') state.soilTempLayer1 = Number(tp.toFixed(1));
          if (typeof vg === 'number') state.vegetationGreenness = Number(vg.toFixed(1));
          if (typeof lai === 'number') state.leafAreaIndex = Number(lai.toFixed(2));
          if (typeof inf === 'number') state.infiltrationFlux = Number(inf.toFixed(2));
        } else if (smapJson.annual_metrics) {
          if (typeof smapJson.annual_metrics.sm_rootzone?.mean === 'number') {
            state.smapMoistureM3 = Number(smapJson.annual_metrics.sm_rootzone.mean.toFixed(3));
            state.isLiveBackend = true;
          }
          if (typeof smapJson.annual_metrics.sm_surface?.mean === 'number') {
            state.surfaceMoistureM3 = Number(smapJson.annual_metrics.sm_surface.mean.toFixed(3));
          }
          if (typeof smapJson.annual_metrics.sm_rootzone_pctl?.mean === 'number') {
            state.droughtPercentile = Number(smapJson.annual_metrics.sm_rootzone_pctl.mean.toFixed(1));
          }
          if (typeof smapJson.annual_metrics.soil_temp_layer1?.mean === 'number') {
            state.soilTempLayer1 = Number(smapJson.annual_metrics.soil_temp_layer1.mean.toFixed(1));
          }
        }
      }
    }).catch((err) => {
      console.warn('NASA SMAP GEE fetch warning:', err);
    }).finally(() => {
      state.isSmapLoading = false;
      if (typeof onProgressiveUpdate === 'function') {
        onProgressiveUpdate({ ...state });
      }
    });

    await Promise.allSettled([climatePromise, smapPromise]);
    state.isSmapLoading = false;
    state.error = state.isLiveBackend ? null : 'No terrestrial NASA observation found at this coordinate.';

    return { ...state };
  } catch (err) {
    console.warn('Backend telemetry request failed:', err);
    return {
      isLoading: false,
      isLiveBackend: false,
      isSmapLoading: false,
      error: 'Backend communication error: ' + (err.message || 'Service unreachable'),
    };
  }
}

/**
 * Execute a multi-plan digital twin simulation via POST /api/ai/simulate
 */
export async function simulateCropRotation(location, options = {}) {
  const payload = {
    location: {
      name: location.name || 'Selected Farm Plot',
      latitude: Number(location.lat.toFixed(4)),
      longitude: Number(location.lng.toFixed(4)),
    },
    year: options.year || 2025,
    soil_type: options.soilType || 'limoneux_profond',
    water_access: options.waterAccess || 'appoint',
    budget: options.budget || 'moyen',
    climate_shock: options.climateShock || 'none',
    primary_cereal: options.primaryCereal || 'ble_dur',
    historical_compare_year: options.historicalCompareYear !== undefined ? options.historicalCompareYear : 2023,
    language_override: options.language_override || options.language || 'auto',
  };

  const res = await fetch('/api/ai/simulate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    let msg = `Observation notice (${res.status})`;
    try {
      const errJson = await res.json();
      msg = errJson.message || errJson.error || JSON.stringify(errJson);
    } catch {
      const errorText = await res.text();
      msg = errorText || msg;
    }
    throw new Error(msg);
  }

  return await res.json();
}

/**
 * Fetch dynamic AI Darija explanation for an individual NASA satellite variable
 * via GET /api/smap-gee/explain
 */
export async function fetchVariableExplanation(variable, value, lat, lng, year = 2025, language = 'auto') {
  try {
    const params = new URLSearchParams({
      variable: String(variable),
      value: String(Number(value)),
    });
    if (lat !== undefined && lat !== null) params.set('latitude', Number(lat).toFixed(4));
    if (lng !== undefined && lng !== null) params.set('longitude', Number(lng).toFixed(4));
    if (year) params.set('year', String(Number(year)));
    if (language) params.set('language', language);

    const res = await fetch(`/api/smap-gee/explain?${params.toString()}`);
    if (!res.ok) {
      throw new Error(`Explain endpoint failed with HTTP ${res.status}`);
    }
    return await res.json();
  } catch (err) {
    console.warn('Failed to fetch variable explanation:', err);
    return null;
  }
}
