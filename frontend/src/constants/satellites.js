// ─── High-Definition Satellite Raster Style ──────────────────────────────────
export const SATELLITE_STYLE = {
  version: 8,
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {
    satellite: {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      attribution: '© Esri, NASA, USGS, ESA',
      maxzoom: 19,
    },
  },
  layers: [
    {
      id: 'satellite-tiles',
      type: 'raster',
      source: 'satellite',
      minzoom: 0,
      maxzoom: 19,
    },
  ],
};

// ─── Remote Sensing Earth Observation Satellites ─────────────────────────────
export const SATELLITE_CONSTELLATIONS = [
  {
    id: 'smap',
    name: 'SMAP',
    fullName: 'Soil Moisture Active Passive',
    color: '#06b6d4', // Cyan
    altitude: '685 km',
    agency: 'NASA JPL',
    variable: 'Soil Moisture (9km L4)',
  },
  {
    id: 'gpm',
    name: 'GPM Core',
    fullName: 'Global Precipitation Measurement',
    color: '#3b82f6', // Blue
    altitude: '407 km',
    agency: 'NASA / JAXA',
    variable: 'IMERG Rainfall (0.1°)',
  },
  {
    id: 'landsat',
    name: 'LANDSAT-9',
    fullName: 'Landsat Data Continuity Mission',
    color: '#10b981', // Emerald
    altitude: '705 km',
    agency: 'NASA / USGS',
    variable: 'Surface Reflectance / NDVI',
  },
  {
    id: 'sentinel',
    name: 'SENTINEL-2',
    fullName: 'Copernicus Multi-Spectral',
    color: '#f59e0b', // Amber
    altitude: '786 km',
    agency: 'ESA Copernicus',
    variable: '10m High-Res Vegetation',
  },
];
