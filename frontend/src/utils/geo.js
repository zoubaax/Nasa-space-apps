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
    const displayName = locality && country ? `${locality}, ${country}` : data.display_name || `Plot [${lat.toFixed(3)}°, ${lng.toFixed(3)}°]`;

    return {
      displayName,
      locality,
      country,
    };
  } catch {
    return {
      displayName: `Plot [${lat >= 0 ? lat.toFixed(3) + '°N' : Math.abs(lat).toFixed(3) + '°S'}, ${lng >= 0 ? lng.toFixed(3) + '°E' : Math.abs(lng).toFixed(3) + '°W'}]`,
      locality: 'Field Area',
      country: lat >= 0 ? 'Northern Hemisphere' : 'Southern Hemisphere',
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
export async function fetchEnvironmentalTelemetry(lng, lat) {
  try {
    const latFixed = Number(lat.toFixed(4));
    const lngFixed = Number(lng.toFixed(4));

    // Parallel fetch from FastAPI backend
    const [climateResult, smapResult] = await Promise.allSettled([
      fetch(`/api/climate/summary?latitude=${latFixed}&longitude=${lngFixed}&start_date=2025-01-01&end_date=2025-12-31`),
      fetch(`/api/smap-gee/timeseries?latitude=${latFixed}&longitude=${lngFixed}&year=2025`),
    ]);

    let rainfall = null;
    let meanTemp = null;
    let minTemp = null;
    let maxTemp = null;
    let dryDays = null;
    let hotDays = null;
    let coldDays = null;
    let humidity = null;
    let solarRadiation = null;
    let windSpeed = null;

    let smapMoisture = null;
    let surfaceMoisture = null;
    let profileMoisture = null;
    let droughtPctl = null;
    let soilTempLayer1 = null;
    let vegetationGreenness = null;
    let leafAreaIndex = null;
    let infiltrationFlux = null;

    let rawClimate = null;
    let rawSmap = null;
    let hasLiveObservations = false;

    // Process NASA POWER Climate Summary
    if (climateResult.status === 'fulfilled' && climateResult.value.ok) {
      const climateJson = await climateResult.value.json();
      rawClimate = climateJson;

      const rainVal =
        climateJson.indicators?.total_precipitation ??
        climateJson.indicators?.total_precipitation_mm?.value;
      if (typeof rainVal === 'number' && !isNaN(rainVal)) {
        rainfall = Math.round(rainVal * 10) / 10;
        hasLiveObservations = true;
      }

      const tempVal =
        climateJson.indicators?.average_temperature ??
        climateJson.indicators?.mean_temperature_c?.value;
      if (typeof tempVal === 'number' && !isNaN(tempVal)) {
        meanTemp = Number(tempVal.toFixed(1));
        hasLiveObservations = true;
      }

      if (typeof climateJson.indicators?.minimum_temperature === 'number') {
        minTemp = Number(climateJson.indicators.minimum_temperature.toFixed(1));
      }
      if (typeof climateJson.indicators?.maximum_temperature === 'number') {
        maxTemp = Number(climateJson.indicators.maximum_temperature.toFixed(1));
      }

      dryDays =
        climateJson.indicators?.dry_days ??
        climateJson.indicators?.dry_days_count?.value ??
        null;
      hotDays =
        climateJson.indicators?.hot_days ??
        climateJson.indicators?.hot_days_count?.value ??
        null;
      coldDays =
        climateJson.indicators?.cold_days ??
        null;
      humidity =
        climateJson.indicators?.average_relative_humidity ??
        climateJson.indicators?.relative_humidity_pct?.value ??
        null;
      solarRadiation =
        climateJson.indicators?.average_solar_radiation ??
        climateJson.indicators?.solar_radiation_mj?.value ??
        null;
      windSpeed =
        climateJson.indicators?.average_wind_speed ??
        null;
    }

    // Process NASA SMAP Level-4 GEE Timeseries
    if (smapResult.status === 'fulfilled' && smapResult.value.ok) {
      const smapJson = await smapResult.value.json();
      rawSmap = smapJson;

      // Extract from summary_cards array or direct annual_metrics
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

        if (typeof rz === 'number') smapMoisture = Number(rz.toFixed(3));
        if (typeof sf === 'number') surfaceMoisture = Number(sf.toFixed(3));
        if (typeof pf === 'number') profileMoisture = Number(pf.toFixed(3));
        if (typeof pc === 'number') droughtPctl = Number(pc.toFixed(1));
        if (typeof tp === 'number') soilTempLayer1 = Number(tp.toFixed(1));
        if (typeof vg === 'number') vegetationGreenness = Number(vg.toFixed(1));
        if (typeof lai === 'number') leafAreaIndex = Number(lai.toFixed(2));
        if (typeof inf === 'number') infiltrationFlux = Number(inf.toFixed(2));

        if (smapMoisture !== null) hasLiveObservations = true;
      } else if (smapJson.annual_metrics) {
        if (typeof smapJson.annual_metrics.sm_rootzone?.mean === 'number') {
          smapMoisture = Number(smapJson.annual_metrics.sm_rootzone.mean.toFixed(3));
          hasLiveObservations = true;
        }
        if (typeof smapJson.annual_metrics.sm_surface?.mean === 'number') {
          surfaceMoisture = Number(smapJson.annual_metrics.sm_surface.mean.toFixed(3));
        }
        if (typeof smapJson.annual_metrics.sm_rootzone_pctl?.mean === 'number') {
          droughtPctl = Number(smapJson.annual_metrics.sm_rootzone_pctl.mean.toFixed(1));
        }
        if (typeof smapJson.annual_metrics.soil_temp_layer1?.mean === 'number') {
          soilTempLayer1 = Number(smapJson.annual_metrics.soil_temp_layer1.mean.toFixed(1));
        }
      }
    }

    const climateZone = classifyClimate(rainfall, meanTemp);

    return {
      isLoading: false,
      isLiveBackend: hasLiveObservations,
      climateZone,
      annualRainfallMm: rainfall,
      meanTempC: meanTemp,
      minTempC: minTemp,
      maxTempC: maxTemp,
      smapMoistureM3: smapMoisture,
      surfaceMoistureM3: surfaceMoisture,
      profileMoistureM3: profileMoisture,
      droughtPercentile: droughtPctl,
      soilTempLayer1,
      vegetationGreenness,
      leafAreaIndex,
      infiltrationFlux,
      dryDays,
      hotDays,
      coldDays,
      humidity: humidity !== null ? Number(humidity.toFixed(1)) : null,
      solarRadiation: solarRadiation !== null ? Number(solarRadiation.toFixed(1)) : null,
      windSpeed: windSpeed !== null ? Number(windSpeed.toFixed(1)) : null,
      rawClimate,
      rawSmap,
      error: hasLiveObservations ? null : 'No terrestrial NASA observation found at this coordinate.',
    };
  } catch (err) {
    console.warn('Backend telemetry request failed:', err);
    return {
      isLoading: false,
      isLiveBackend: false,
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
    historical_compare_year: options.historicalCompareYear !== undefined ? options.historicalCompareYear : 2023,
  };

  const res = await fetch('/api/ai/simulate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Simulation API error (${res.status}): ${errorText}`);
  }

  return await res.json();
}
