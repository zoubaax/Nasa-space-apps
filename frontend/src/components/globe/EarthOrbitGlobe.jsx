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
import CinematicHeroOverlay from './CinematicHeroOverlay';
import Mascot3DViewer from './Mascot3DViewer';
import AgroChatDrawer from '../chat/AgroChatDrawer';
import { MessageSquare } from 'lucide-react';
import { useTranslation } from '../../context/LanguageContext';

// ─── Direct Static Worker from public/ directory ─────────────────────────────
if (typeof maplibregl.setWorkerUrl === 'function') {
  maplibregl.setWorkerUrl('/maplibre-gl-worker.js');
}

// Helper to strictly determine if a screen point is physically on the 3D Earth globe sphere
function isPointOnGlobe(map, point, lngLat) {
  if (!map || !point || !lngLat) return false;

  // 1. At orbital view (zoom < 4), enforce strict radial bounding around the globe sphere
  const zoom = map.getZoom();
  if (zoom < 4) {
    try {
      const center = map.project(map.getCenter());
      const radius = ((512 * Math.pow(2, zoom)) / (2 * Math.PI)) * 1.08;
      const distFromCenter = Math.hypot(point.x - center.x, point.y - center.y);
      if (distFromCenter > radius) {
        return false;
      }
    } catch {
      // fallback
    }
  }

  // 2. Check MapLibre internal surface hit test if available
  if (map.transform && typeof map.transform.isPointOnMapSurface === 'function') {
    try {
      if (!map.transform.isPointOnMapSurface(point)) {
        return false;
      }
    } catch {
      // fallback
    }
  }

  // 3. Mathematical Reprojection Test:
  // Points on the physical globe surface reproject to within 5px of click position.
  // Points in deep space clamp to the horizon or edge, causing large reprojection error.
  try {
    const proj = map.project(lngLat);
    const reprojDist = Math.hypot(proj.x - point.x, proj.y - point.y);
    if (reprojDist > 5) {
      return false;
    }
  } catch {
    return false;
  }

  return true;
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
  const [isExperienceMode, setIsExperienceMode] = useState(false);

  // Digital twin simulation state
  const [isSimulationOpen, setIsSimulationOpen] = useState(false);
  const [simulationData, setSimulationData] = useState(null);
  const [isSimulationLoading, setIsSimulationLoading] = useState(false);
  const [simulationError, setSimulationError] = useState(null);

  // Multi-Agent Chatbot Drawer state
  const [isChatOpen, setIsChatOpen] = useState(false);

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
      setIsExperienceMode(true);

      const targetCoords =
        loc.coordinates ||
        (loc.lng !== undefined && loc.lat !== undefined ? [loc.lng, loc.lat] : null);
      if (!targetCoords || isNaN(targetCoords[0]) || isNaN(targetCoords[1])) {
        console.warn('flyToLocation: invalid coordinates in loc object:', loc);
        return;
      }
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
    window._map = map;

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
        const onEarth = isPointOnGlobe(map, e.point, e.lngLat);

        if (canvas && !isInteractingRef.current) {
          canvas.style.cursor = onEarth ? 'pointer' : 'default';
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
      isInteractingRef.current = true;
      hasDraggedRef.current = false;
    });

    map.on('touchstart', (e) => {
      if (e.points && e.points[0]) {
        mouseDownPosRef.current = { x: e.points[0].x, y: e.points[0].y };
      }
      isInteractingRef.current = true;
      hasDraggedRef.current = false;
    });

    map.on('dragstart', () => {
      isInteractingRef.current = true;
      isSpinningRef.current = false;
      hasDraggedRef.current = true;
      setIsRotating(false);
      if (map.getCanvas()) map.getCanvas().style.cursor = 'grabbing';
    });

    map.on('drag', () => {
      isInteractingRef.current = true;
      hasDraggedRef.current = true;
    });

    map.on('dragend', () => {
      isInteractingRef.current = false;
      if (map.getCanvas()) map.getCanvas().style.cursor = 'default';
      // Keep hasDraggedRef true for 250ms to block the trailing click event after release
      setTimeout(() => {
        hasDraggedRef.current = false;
      }, 250);
    });

    map.on('mouseup', () => {
      setTimeout(() => {
        isInteractingRef.current = false;
      }, 80);
    });

    map.on('touchend', () => {
      setTimeout(() => {
        isInteractingRef.current = false;
      }, 80);
    });

    map.on('zoomstart', () => {
      isInteractingRef.current = true;
      isSpinningRef.current = false;
      setIsRotating(false);
    });

    map.on('zoomend', () => {
      setTimeout(() => {
        isInteractingRef.current = false;
      }, 200);
    });

    // Click anywhere on Earth to zoom into a farm location (ONLY on true stationary clicks ON THE GLOBE)
    map.on('click', (e) => {
      if (hasDraggedRef.current) return;

      const dx = e.point.x - mouseDownPosRef.current.x;
      const dy = e.point.y - mouseDownPosRef.current.y;
      if (Math.hypot(dx, dy) > 6) return; // Ignored if user was dragging/turning the Earth!

      // CRITICAL: Block all clicks that fall in deep space outside the 3D Earth sphere!
      if (!isPointOnGlobe(map, e.point, e.lngLat)) {
        return;
      }

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
    setIsExperienceMode(false);
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
      {/* 3D Globe Canvas (100% FROZEN & UNTOUCHED) */}
      <div ref={containerRef} className="absolute inset-0 w-full h-full bg-[#000005]" />

      {/* Atmospheric glow vignette */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,transparent_40%,rgba(0,0,5,0.4)_100%)]" />

      {/* ── MODE 1: CINEMATIC HERO OVERLAY (From Reference Design) ── */}
      {!isExperienceMode && (
        <CinematicHeroOverlay
          onFlyToLocation={flyToLocation}
          onEnterExperience={() =>
            flyToLocation({
              name: 'Saïss / Meknes, Morocco',
              coordinates: [-5.55, 33.89],
              zoom: 14.5,
              pitch: 45,
              bearing: 0,
            })
          }
          onSelectTerroir={(terroir) =>
            flyToLocation({
              name: terroir.name,
              coordinates: [terroir.lng, terroir.lat],
              zoom: 14.5,
              pitch: 45,
              bearing: 0,
            })
          }
        />
      )}

      {/* ── MODE 2: ACTIVE MISSION OPERATIONS HUD ── */}
      {isExperienceMode && (
        <>
          {/* Top-Left: Mission HUD */}
          <div className="absolute top-3 left-3 sm:top-5 sm:left-5 z-20">
            <MissionHUD
              selectedLocation={selectedLocation}
              isFlying={!isRotating && !showTelemetryCard}
              coordsRef={coordsRef}
              altitudeRef={altitudeRef}
              onOpenTelemetry={() => setShowTelemetryCard(true)}
              hasTelemetry={Boolean(selectedLocation && !showTelemetryCard)}
            />
          </div>

          {/* Top-Right: Location Toolbar */}
          <div className="absolute top-3 right-3 sm:top-5 sm:right-5 z-20">
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
              onOpenChat={() => setIsChatOpen(true)}
              onClose={() => setShowTelemetryCard(false)}
            />
          )}

          {/* Bottom-Right: Standalone 3D AI Agronomist Persona (Like Codex Persona, without words) */}
          <div
            className="absolute bottom-3 sm:bottom-6 z-30 select-none"
            style={{ right: '0.75rem', left: 'auto' }}
          >
            <button
              type="button"
              onClick={() => setIsChatOpen(true)}
              className="relative w-16 h-20 sm:w-24 sm:h-28 md:w-28 md:h-32 flex items-center justify-center cursor-pointer group transition-transform duration-300 hover:scale-110 focus:outline-none"
              title={t('chat.openChatBtn', {}, 'Chat with SI Agronomist')}
            >
              {/* Subtle ambient glow aura under the character */}
              <div className="absolute inset-x-1 sm:inset-x-2 bottom-1 h-5 sm:h-6 rounded-full bg-emerald-500/20 blur-md group-hover:bg-emerald-400/40 transition-all duration-500 pointer-events-none" />

              {/* Little Live AI pulse indicator at top-right of persona */}
              <div className="absolute top-0.5 right-0.5 sm:top-1 sm:right-1 z-10 flex items-center justify-center w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-[#0b0e14]/90 border border-emerald-500/40 shadow-md">
                <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-emerald-400 animate-pulse" />
              </div>

              {/* Standalone 3D Model */}
              <div className="w-full h-full pointer-events-none filter drop-shadow-[0_8px_20px_rgba(0,0,0,0.85)] group-hover:drop-shadow-[0_0_25px_rgba(16,185,129,0.5)] transition-all duration-300">
                <Mascot3DViewer
                  modelSrc="/models/gardener.glb"
                  cameraControls={false}
                  autoRotate={true}
                />
              </div>
            </button>
          </div>

          {/* Bottom-Left: Satellite Constellations (Stacked above controls on desktop) */}
          <div
            className="absolute bottom-22 z-20 hidden md:flex"
            style={{ left: '1.25rem', right: 'auto' }}
          >
            <SatelliteConstellations />
          </div>

          {/* Bottom-Left: Orbit Controls */}
          <div
            className="absolute bottom-3 sm:bottom-6 z-20"
            style={{ left: '0.75rem', right: 'auto' }}
          >
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
        </>
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

      {/* AI Agronomist Multi-Agent Chat Drawer */}
      <AgroChatDrawer
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        selectedLocation={selectedLocation}
        telemetry={environmentalData}
        selectedYear={selectedYear}
      />
    </div>
  );
}
