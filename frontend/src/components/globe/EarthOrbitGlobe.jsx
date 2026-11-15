import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

import { SATELLITE_STYLE } from '../../constants/satellites';
import {
  reverseGeocode,
  fetchEnvironmentalTelemetry,
  simulateCropRotation,
} from '../../utils/geo';
import MissionHUD from './MissionHUD';
import SatelliteConstellations from './SatelliteConstellations';
import GlobeControls from './GlobeControls';
import LocationToolbar from './LocationToolbar';
import FieldTelemetryCard from './FieldTelemetryCard';
import RotationSimulationModal from './RotationSimulationModal';
import { useTranslation } from '../../context/LanguageContext';

// ─── Direct Static Worker from public/ directory ─────────────────────────────
if (typeof maplibregl.setWorkerUrl === 'function') {
  maplibregl.setWorkerUrl('/maplibre-gl-worker.js');
}

export default function EarthOrbitGlobe({
  initialCenter = [0, 20],
  initialZoom = 1.6,
  onLocationSelect = null,
}) {
  const { t, language, syncWithLocation } = useTranslation();
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const animFrameRef = useRef(null);
  const mouseRafRef = useRef(null);

  // Synchronous spin guard
  const isSpinningRef = useRef(true);
  const isInteractingRef = useRef(false);
  const hasDraggedRef = useRef(false);
  const mouseDownPosRef = useRef({ x: 0, y: 0 });

  // Keep onLocationSelect in a ref so changes NEVER trigger map re-renders/unmounts
  const onLocationSelectRef = useRef(onLocationSelect);
  useEffect(() => {
    onLocationSelectRef.current = onLocationSelect;
  }, [onLocationSelect]);

  // Direct DOM refs for zero-rerender telemetry HUD
  const coordsRef = useRef(null);
  const altitudeRef = useRef(null);

  const [isRotating, setIsRotating] = useState(true);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [environmentalData, setEnvironmentalData] = useState(null);
  const [showTelemetryCard, setShowTelemetryCard] = useState(false);
  const [currentPitch, setCurrentPitch] = useState(0);
  const [selectedYear, setSelectedYear] = useState(2025);

  // Digital twin simulation state
  const [isSimulationOpen, setIsSimulationOpen] = useState(false);
  const [simulationData, setSimulationData] = useState(null);
  const [isSimulationLoading, setIsSimulationLoading] = useState(false);
  const [simulationError, setSimulationError] = useState(null);

  // ─── Modern Location Pin Marker ───────────────────────────────────────────
  const createLocationPinMarker = (label) => {
    const displayLabel = label || t('toolbar.detectedFarm', {}, 'My Farm');
    const el = document.createElement('div');
    el.className = 'relative flex flex-col items-center cursor-pointer select-none';
    el.innerHTML = `
      <!-- Location Label Badge -->
      <div class="mb-1 px-3 py-1 rounded-full bg-zinc-950/95 border border-cyan-400/60 text-cyan-300 font-mono text-[11px] font-semibold whitespace-nowrap shadow-[0_0_20px_rgba(6,182,212,0.5)] backdrop-blur-md flex items-center gap-1.5 animate-fade-in">
        <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
        <span>${displayLabel}</span>
      </div>

      <!-- High-Definition Map Pin Icon -->
      <div class="relative flex items-center justify-center filter drop-shadow-[0_4px_12px_rgba(6,182,212,0.7)]">
        <svg class="w-8 h-8 text-cyan-400" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
        </svg>
      </div>

      <!-- Radar Ground Ripple under Pin Tip -->
      <div class="absolute -bottom-1 left-1/2 -translate-x-1/2 w-8 h-4 flex items-center justify-center pointer-events-none">
        <span class="absolute w-8 h-4 rounded-full bg-cyan-400/50 animate-ping"></span>
        <span class="w-3 h-1.5 rounded-full bg-cyan-300 shadow-[0_0_10px_#06b6d4]"></span>
      </div>
    `;
    return el;
  };

  const setMarkerAt = useCallback((coords, label) => {
    if (!mapRef.current) return;
    if (markerRef.current) markerRef.current.remove();
    markerRef.current = new maplibregl.Marker({
      element: createLocationPinMarker(label),
      anchor: 'bottom', // Pointy tip of pin touches exact coordinates!
    })
      .setLngLat(coords)
      .addTo(mapRef.current);
  }, []);

  // ─── Cinematic 3D Space-to-Ground Fly-To ───────────────────────────────────
  const flyToLocation = useCallback(
    (loc) => {
      const map = mapRef.current;
      if (!map) return;

      // 1. Immediately halt auto-rotation so background frames NEVER interrupt the flight
      isSpinningRef.current = false;
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      setIsRotating(false);
      setShowTelemetryCard(false);

      const targetCoords = loc.coordinates; // [lng, lat]
      const targetZoom = loc.zoom || 14.5;
      const targetPitch = loc.pitch !== undefined ? loc.pitch : 45;
      const targetBearing = loc.bearing || 0;

      // 2. Drop pin immediately
      const defaultFarmName = t('toolbar.detectedFarm', {}, 'My Farm');
      setMarkerAt(targetCoords, loc.name || defaultFarmName);

      // 3. Cinematic 3D Fly-To Animation (Parabolic Space-to-Ground Descent)
      map.flyTo({
        center: targetCoords,
        zoom: targetZoom,
        pitch: targetPitch,
        bearing: targetBearing,
        duration: 3800,      // 3.8s smooth descent
        curve: 1.42,         // Parabolic NASA dive
        speed: 0.8,
        essential: true,
      });

      // 4. In background, set real loading state and request authentic observations
      setEnvironmentalData({ isLoading: true, isLiveBackend: false, isSmapLoading: true, selectedYear });

      // Request authentic observations with progressive rendering (Climate in <1s, SMAP in ~2-7s)
      fetchEnvironmentalTelemetry(
        targetCoords[0],
        targetCoords[1],
        (partialTelemetry) => {
          setEnvironmentalData(partialTelemetry);
        },
        selectedYear
      ).then((liveTelemetry) => {
        setEnvironmentalData(liveTelemetry);
      });

      reverseGeocode(targetCoords[0], targetCoords[1]).then((geo) => {
        const resolved = {
          name: loc.name || geo.displayName,
          lat: targetCoords[1],
          lng: targetCoords[0],
          coordinates: targetCoords,
          country: geo.country,
          country_code: geo.country_code,
        };
        setSelectedLocation(resolved);
        syncWithLocation(resolved);
        // Update pin badge with detected geographic title
        if (!loc.name || loc.name === 'My Farm' || loc.name === defaultFarmName) {
          setMarkerAt(targetCoords, resolved.name);
        }
        if (onLocationSelectRef.current) {
          onLocationSelectRef.current(resolved);
        }
      });

      // 5. Reveal telemetry card upon touchdown
      map.once('moveend', () => {
        setShowTelemetryCard(true);
      });
    },
    [setMarkerAt]
  );

  const flyToLocationRef = useRef(flyToLocation);
  useEffect(() => {
    flyToLocationRef.current = flyToLocation;
  }, [flyToLocation]);

  // ─── Map Initialization (MOUNT ONLY - NEVER DESTROY ON RE-RENDER) ──────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: SATELLITE_STYLE,
      center: initialCenter,
      zoom: initialZoom,
      pitch: 0,
      bearing: 0,
      antialias: true,
      attributionControl: false,
    });

    mapRef.current = map;

    // Default arrow cursor on black space
    if (map.getCanvas()) {
      map.getCanvas().style.cursor = 'default';
    }

    map.on('load', () => {
      try {
        if (typeof map.setProjection === 'function') {
          map.setProjection({ type: 'globe' });
        }
      } catch (err) {
        console.warn('Globe projection notice:', err);
      }

      try {
        if (typeof map.setSky === 'function') {
          map.setSky({
            'sky-color': '#000004',
            'horizon-color': '#06b6d4',
            'fog-color': '#030712',
            'atmosphere-blend': 0.85,
          });
        }
      } catch {
        // Fallback
      }

      map.resize();
    });

    // Altitude HUD tracker (direct DOM)
    map.on('zoom', () => {
      if (!altitudeRef.current) return;
      const z = map.getZoom();
      const km = Math.round(20000 * Math.pow(0.35, Math.max(0, z - 1)));
      altitudeRef.current.textContent =
        km > 1000 ? `${km.toLocaleString()} km` : `${Math.max(0.8, km).toFixed(1)} km`;
    });

    map.on('pitch', () => setCurrentPitch(map.getPitch()));

    // Cursor handling: Arrow on black space, Hand on planet
    map.on('mousemove', (e) => {
      if (mouseRafRef.current) return;
      mouseRafRef.current = requestAnimationFrame(() => {
        mouseRafRef.current = null;
        const canvas = map.getCanvas();
        const onEarth = e.lngLat && !isNaN(e.lngLat.lat) && !isNaN(e.lngLat.lng);

        if (canvas && !isInteractingRef.current) {
          canvas.style.cursor = onEarth ? 'grab' : 'default';
        }

        if (coordsRef.current) {
          if (onEarth) {
            const lat = e.lngLat.lat;
            const lng = e.lngLat.lng;
            coordsRef.current.textContent =
              `${lat >= 0 ? lat.toFixed(3) + '°N' : Math.abs(lat).toFixed(3) + '°S'}, ` +
              `${lng >= 0 ? lng.toFixed(3) + '°E' : Math.abs(lng).toFixed(3) + '°W'}`;
          } else {
            coordsRef.current.textContent = t('hud.orbitingDeepSpace', {}, 'Orbiting Deep Space');
          }
        }
      });
    });

    map.on('mousedown', (e) => {
      mouseDownPosRef.current = { x: e.point.x, y: e.point.y };
      hasDraggedRef.current = false;
    });

    map.on('dragstart', () => {
      isInteractingRef.current = true;
      isSpinningRef.current = false;
      hasDraggedRef.current = true;
      setIsRotating(false);
      if (map.getCanvas()) map.getCanvas().style.cursor = 'grabbing';
    });

    map.on('dragend', () => {
      isInteractingRef.current = false;
      if (map.getCanvas()) map.getCanvas().style.cursor = 'default';
      // Keep hasDraggedRef true for 200ms to block the trailing click event after release
      setTimeout(() => {
        hasDraggedRef.current = false;
      }, 200);
    });

    // Click anywhere on Earth to zoom into a farm location (ONLY on true stationary clicks)
    map.on('click', (e) => {
      if (hasDraggedRef.current) return;

      const dx = e.point.x - mouseDownPosRef.current.x;
      const dy = e.point.y - mouseDownPosRef.current.y;
      if (Math.hypot(dx, dy) > 6) return; // Ignored if user was dragging/turning the Earth!

      if (e.lngLat && !isNaN(e.lngLat.lat) && !isNaN(e.lngLat.lng)) {
        flyToLocationRef.current?.({
          coordinates: [Number(e.lngLat.lng.toFixed(5)), Number(e.lngLat.lat.toFixed(5))],
          zoom: Math.max(map.getZoom(), 14.5),
          pitch: 45,
        });
      }
    });

    const onResize = () => map.resize();
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (mouseRafRef.current) cancelAnimationFrame(mouseRafRef.current);
      if (markerRef.current) markerRef.current.remove();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // <── EMPTY ARRAY: Map initializes once and is NEVER unmounted by state updates!

  // ─── Smooth Orbit Spin (requestAnimationFrame) ─────────────────────────────
  useEffect(() => {
    isSpinningRef.current = isRotating;
    if (!isRotating) {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      return;
    }

    let lastTime = performance.now();
    const loop = (now) => {
      if (!isSpinningRef.current) return;
      const dt = (now - lastTime) / 1000;
      lastTime = now;

      if (mapRef.current && !isInteractingRef.current) {
        const z = mapRef.current.getZoom();
        if (z < 5) {
          const c = mapRef.current.getCenter();
          c.lng -= 3 * dt;
          mapRef.current.jumpTo({ center: c });
        }
      }
      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };
  }, [isRotating]);

  // ─── Orbit Controls ────────────────────────────────────────────────────────
  const handleResetOrbit = () => {
    if (markerRef.current) markerRef.current.remove();
    setSelectedLocation(null);
    setShowTelemetryCard(false);

    mapRef.current?.flyTo({
      center: initialCenter,
      zoom: initialZoom,
      pitch: 0,
      bearing: 0,
      duration: 2500,
      essential: true,
    });

    setTimeout(() => {
      isSpinningRef.current = true;
      setIsRotating(true);
    }, 2600);
  };

  const handleTogglePitch = () => {
    if (!mapRef.current) return;
    mapRef.current.easeTo({ pitch: currentPitch > 20 ? 0 : 50, duration: 800 });
  };

  const handleYearChange = (newYear) => {
    setSelectedYear(newYear);
    if (selectedLocation?.coordinates) {
      setEnvironmentalData((prev) => ({
        ...(prev || {}),
        isLoading: true,
        isSmapLoading: true,
        selectedYear: newYear,
      }));
      fetchEnvironmentalTelemetry(
        selectedLocation.coordinates[0],
        selectedLocation.coordinates[1],
        (partialTelemetry) => {
          setEnvironmentalData(partialTelemetry);
        },
        newYear
      ).then((liveTelemetry) => {
        setEnvironmentalData(liveTelemetry);
      });
    }
  };

  const handleEvaluateRotation = async (loc, customOptions = {}, telemetryData = null) => {
    const targetLoc = loc || selectedLocation;
    if (!targetLoc) return;

    setIsSimulationOpen(true);
    setIsSimulationLoading(true);
    setSimulationError(null);

    // Dynamic terroir inference from live NASA telemetry (zero hardcoded defaults)
    const activeTelemetry = telemetryData || environmentalData;
    const rain = activeTelemetry?.annualRainfallMm;
    const smap = activeTelemetry?.smapMoistureM3;
    const countryCode = (targetLoc.country_code || '').toLowerCase();

    let inferredSoil = 'limoneux_profond';
    let inferredWater = 'appoint';
    let inferredCereal = 'ble_dur';

    if (rain !== undefined && rain !== null) {
      if (rain < 150 || (smap !== undefined && smap !== null && smap < 0.14)) {
        inferredSoil = 'sableux'; // Desert sandy soil (e.g. Sahara, Imlili, Dakhla)
        inferredWater = 'irrigue'; // Hyper-arid requires full irrigation / oasis
        inferredCereal = 'orge'; // Drought-hardy desert barley
      } else if (rain > 650) {
        inferredSoil = 'argilo_limoneux';
        inferredWater = 'bour';
      } else if (rain > 450) {
        inferredSoil = 'limoneux_profond';
        inferredWater = 'bour';
      } else {
        inferredSoil = 'argilo_limoneux';
        inferredWater = 'appoint';
      }

      if (rain >= 160) {
        if (['us', 'ca', 'br', 'ar'].includes(countryCode)) {
          inferredCereal = 'mais';
        } else if (['fr', 'de', 'gb', 'pl', 'ua'].includes(countryCode)) {
          inferredCereal = 'ble_tendre';
        } else {
          inferredCereal = 'ble_dur';
        }
      }
    }

    const mergedOptions = {
      year: selectedYear,
      language: language,
      soilType: inferredSoil,
      waterAccess: inferredWater,
      primaryCereal: inferredCereal,
      ...customOptions,
    };

    try {
      const result = await simulateCropRotation(targetLoc, mergedOptions);
      setSimulationData(result);
    } catch (err) {
      console.warn('Simulation request failed:', err);
      setSimulationError(
        t('simulation.serviceNotice', {}, 'Backend simulation service notice: ') +
          (err.message || 'Unable to connect to simulation engine.')
      );
    } finally {
      setIsSimulationLoading(false);
    }
  };

  return (
    <div className="relative w-full h-full min-h-screen bg-black overflow-hidden select-none font-sans">
      {/* 3D Globe Canvas */}
      <div ref={containerRef} className="absolute inset-0 w-full h-full bg-[#000005]" />

      {/* Atmospheric glow vignette */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,transparent_40%,rgba(0,0,5,0.4)_100%)]" />

      {/* Top-Left: Mission HUD */}
      <div className="absolute top-5 left-5 z-20">
        <MissionHUD
          selectedLocation={selectedLocation}
          isFlying={!isRotating && !showTelemetryCard}
          coordsRef={coordsRef}
          altitudeRef={altitudeRef}
        />
      </div>

      {/* Top-Right: Single Hero Action "Get My Location" */}
      <div className="absolute top-5 right-5 z-20">
        <LocationToolbar onFlyToLocation={flyToLocation} isFlying={false} />
      </div>

      {/* Field Telemetry Card (after camera arrives) */}
      {showTelemetryCard && (
        <FieldTelemetryCard
          locationData={selectedLocation}
          telemetry={environmentalData}
          selectedYear={selectedYear}
          onYearChange={handleYearChange}
          onEvaluateRotation={(loc, tele) => {
            handleEvaluateRotation(loc, {}, tele || environmentalData);
          }}
          onClose={() => setShowTelemetryCard(false)}
        />
      )}

      {/* Virtual Agricultural Laboratory Simulation Modal */}
      <RotationSimulationModal
        isOpen={isSimulationOpen}
        onClose={() => setIsSimulationOpen(false)}
        locationData={selectedLocation}
        simulationData={simulationData}
        selectedYear={selectedYear}
        isLoading={isSimulationLoading}
        error={simulationError}
        onReSimulate={(options) => handleEvaluateRotation(selectedLocation, options)}
      />

      {/* Bottom-Left: Satellite Constellations */}
      <div className="absolute bottom-6 left-5 z-20 hidden md:flex">
        <SatelliteConstellations />
      </div>

      {/* Bottom-Right: Orbit Controls */}
      <div className="absolute bottom-6 right-5 z-20">
        <GlobeControls
          isRotating={isRotating}
          onToggleRotate={() => {
            const next = !isRotating;
            isSpinningRef.current = next;
            setIsRotating(next);
          }}
          onZoomIn={() => mapRef.current?.zoomIn()}
          onZoomOut={() => mapRef.current?.zoomOut()}
          onResetOrbit={handleResetOrbit}
          onTogglePitch={handleTogglePitch}
          currentPitch={currentPitch}
        />
      </div>
    </div>
  );
}
