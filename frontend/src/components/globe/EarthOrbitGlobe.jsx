import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

import { SATELLITE_STYLE } from '../../constants/satellites';
import { reverseGeocode, getEstimatedEnvironmentalTelemetry } from '../../utils/geo';
import MissionHUD from './MissionHUD';
import SatelliteConstellations from './SatelliteConstellations';
import GlobeControls from './GlobeControls';
import LocationToolbar from './LocationToolbar';
import FieldTelemetryCard from './FieldTelemetryCard';

// ─── Direct Static Worker from public/ directory ─────────────────────────────
// Guaranteed to resolve in Vite dev & build with zero worker loading errors
if (typeof maplibregl.setWorkerUrl === 'function') {
  maplibregl.setWorkerUrl('/maplibre-gl-worker.js');
}

const DEFAULT_INITIAL_CENTER = [0, 20];
const DEFAULT_INITIAL_ZOOM = 1.6;

export default function EarthOrbitGlobe({
  initialCenter = DEFAULT_INITIAL_CENTER,
  initialZoom = DEFAULT_INITIAL_ZOOM,
  onLocationSelect = null,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const animFrameRef = useRef(null);
  const mouseRafRef = useRef(null);

  // Synchronous spin guard
  const isSpinningRef = useRef(true);
  const isInteractingRef = useRef(false);

  // Direct DOM refs for zero-rerender telemetry
  const coordsRef = useRef(null);
  const altitudeRef = useRef(null);

  const [isRotating, setIsRotating] = useState(true);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [environmentalData, setEnvironmentalData] = useState(null);
  const [showTelemetryCard, setShowTelemetryCard] = useState(false);
  const [currentPitch, setCurrentPitch] = useState(0);
  const onLocationSelectRef = useRef(onLocationSelect);

  // Keep the map lifecycle independent from parent callback identity changes.
  useEffect(() => {
    onLocationSelectRef.current = onLocationSelect;
  }, [onLocationSelect]);

  // ─── Google Maps Style Pulsing Blue Dot ────────────────────────────────────
  const createLocationMarker = (label = 'My Location') => {
    const el = document.createElement('div');
    el.className = 'relative flex items-center justify-center cursor-pointer';
    el.innerHTML = `
      <div class="absolute -top-7 px-2.5 py-0.5 rounded-full bg-zinc-950/90 border border-blue-500/50 text-blue-300 font-mono text-[10px] whitespace-nowrap shadow-xl pointer-events-none">
        ${label}
      </div>
      <span class="absolute inline-flex h-10 w-10 animate-ping rounded-full bg-blue-500 opacity-60"></span>
      <span class="relative inline-flex rounded-full h-4 w-4 bg-blue-500 border-2 border-white shadow-[0_0_15px_#3b82f6]"></span>
    `;
    return el;
  };

  const setMarkerAt = useCallback((coords, label) => {
    if (!mapRef.current) return;
    if (markerRef.current) markerRef.current.remove();
    markerRef.current = new maplibregl.Marker({
      element: createLocationMarker(label),
      anchor: 'center',
    })
      .setLngLat(coords)
      .addTo(mapRef.current);
  }, []);

  // ─── Cinematic 3D Space-to-Ground Fly-To ───────────────────────────────────
  const flyToLocation = useCallback(
    (loc) => {
      const map = mapRef.current;
      if (!map) return;

      // 1. Immediately kill auto-spin
      isSpinningRef.current = false;
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      setIsRotating(false);
      setShowTelemetryCard(false);

      const targetCoords = loc.coordinates; // [lng, lat]
      const targetZoom = loc.zoom || 14;

      // 2. Drop location marker
      setMarkerAt(targetCoords, loc.name || 'Selected Field');

      // 3. Cinematic 3D Fly-To Animation (Parabolic NASA dive)
      map.flyTo({
        center: targetCoords,
        zoom: targetZoom,
        pitch: 50,                  // 3D camera tilt angle
        bearing: -15,               // Heading rotation
        duration: 4200,             // 4.2s smooth descent
        curve: 1.42,                // Parabolic trajectory arc
        speed: 0.8,
        essential: true,
      });

      // 4. In background, resolve location metadata & telemetry
      const estTelemetry = getEstimatedEnvironmentalTelemetry(targetCoords[0], targetCoords[1]);
      setEnvironmentalData(estTelemetry);

      reverseGeocode(targetCoords[0], targetCoords[1]).then((geo) => {
        const resolved = {
          name: loc.name || geo.displayName,
          lat: targetCoords[1],
          lng: targetCoords[0],
          coordinates: targetCoords,
        };
        setSelectedLocation(resolved);
        if (onLocationSelectRef.current) onLocationSelectRef.current(resolved, estTelemetry);
      });

      // 5. Open telemetry card when arrived
      map.once('moveend', () => {
        setShowTelemetryCard(true);
      });
    },
    [setMarkerAt]
  );

  // ─── Map Initialization ───────────────────────────────────────────────────
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
            coordsRef.current.textContent = 'Deep Space';
          }
        }
      });
    });

    map.on('dragstart', () => {
      isInteractingRef.current = true;
      isSpinningRef.current = false;
      setIsRotating(false);
      if (map.getCanvas()) map.getCanvas().style.cursor = 'grabbing';
    });

    map.on('dragend', () => {
      isInteractingRef.current = false;
      if (map.getCanvas()) map.getCanvas().style.cursor = 'default';
    });

    // Click anywhere to zoom into a farm location
    map.on('click', (e) => {
      if (e.lngLat && !isNaN(e.lngLat.lat) && !isNaN(e.lngLat.lng)) {
        flyToLocation({
          coordinates: [Number(e.lngLat.lng.toFixed(5)), Number(e.lngLat.lat.toFixed(5))],
          zoom: Math.max(map.getZoom(), 14),
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
  // Map creation is a mount-time operation. Keep it from restarting when a
  // parent passes fresh array/callback identities during ordinary rerenders.
  // The current initialCenter/initialZoom values remain available to reset.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyToLocation]);

  // ─── Smooth Orbit Spin ─────────────────────────────────────────────────────
  useEffect(() => {
    isSpinningRef.current = isRotating;
    if (!isRotating) {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      return;
    }

    let last = performance.now();
    const loop = (now) => {
      if (!isSpinningRef.current) return;
      const dt = (now - last) / 1000;
      last = now;

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

      {/* Top-Right: Location Toolbar */}
      <div className="absolute top-5 right-5 z-20">
        <LocationToolbar onFlyToLocation={flyToLocation} isFlying={false} />
      </div>

      {/* Field Telemetry Card (after camera arrives) */}
      {showTelemetryCard && (
        <FieldTelemetryCard
          locationData={selectedLocation}
          telemetry={environmentalData}
          onEvaluateRotation={(loc) => {
            alert(`Evaluating crop rotations for ${loc.name}…`);
          }}
          onClose={() => setShowTelemetryCard(false)}
        />
      )}

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
