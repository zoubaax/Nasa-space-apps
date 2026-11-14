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
 * Falls back to formatted coordinates if network or rate limit fails.
 */
export async function reverseGeocode(lng, lat) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10`,
      { headers: { 'Accept-Language': 'en' } }
    );
    if (!res.ok) throw new Error('Geocoding request failed');
    const data = await res.json();
    const address = data.address || {};
    const city = address.city || address.town || address.county || address.state || 'Local Region';
    const country = address.country || 'Detected Region';
    return {
      displayName: `${city}, ${country}`,
      city,
      country,
    };
  } catch {
    return {
      displayName: `Plot [${lat.toFixed(3)}°N, ${lng.toFixed(3)}°E]`,
      city: 'Field Area',
      country: lat >= 0 ? 'Northern Hemisphere' : 'Southern Hemisphere',
    };
  }
}

/**
 * Generate preliminary environmental baseline estimates based on lat/lng coordinates
 * until the backend API returns full historical satellite extracts.
 */
export function getEstimatedEnvironmentalTelemetry(lng, lat) {
  const absLat = Math.abs(lat);
  // Estimate climate based on latitude bands (Mediterranean / Semi-Arid / Temperate / Tropical)
  let climateZone = 'Temperate Agricultural';
  let annualRainfallMm = 620;
  let meanTempC = 16.5;
  let smapMoistureM3 = 0.22;
  let soilType = 'Loam / Sandy-Loam';

  if (absLat < 15) {
    climateZone = 'Tropical / Sub-tropical';
    annualRainfallMm = 1150;
    meanTempC = 26.2;
    smapMoistureM3 = 0.31;
    soilType = 'Clay / Silt';
  } else if (absLat >= 15 && absLat <= 36) {
    climateZone = 'Semi-Arid / Mediterranean (Drought-Prone)';
    annualRainfallMm = 380;
    meanTempC = 19.8;
    smapMoistureM3 = 0.16;
    soilType = 'Clay-Loam / Alkaline';
  } else if (absLat > 36 && absLat <= 50) {
    climateZone = 'Moderate Continental';
    annualRainfallMm = 680;
    meanTempC = 13.4;
    smapMoistureM3 = 0.26;
    soilType = 'Loam / Humus';
  }

  return {
    climateZone,
    annualRainfallMm,
    meanTempC,
    smapMoistureM3,
    soilType,
  };
}

