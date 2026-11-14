import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

import { SATELLITE_STYLE } from '../../constants/satellites';
import MissionHUD from './MissionHUD';
import SatelliteConstellations from './SatelliteConstellations';
import GlobeControls from './GlobeControls';
import LocationToolbar from './LocationToolbar';

export default function EarthOrbitGlobe({
  initialCenter = [0, 20],
  initialZoom = 1.6,
  onLocationSelect = null,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const animFrameRef = useRef(null);
  const mouseRafRef = useRef(null);

  // Direct DOM refs to eliminate React re-rendering on mousemove & zoom
  const coordsRef = useRef(null);
  const altitudeRef = useRef(null);

  const [isRotating, setIsRotating] = useState(true);
  const [isFlying, setIsFlying] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [currentPitch, setCurrentPitch] = useState(0);

  // Track user interaction state for auto-spin
  const isInteractingRef = useRef(false);

  // ─── Custom Radar Pulsing Marker ──────────────────────────────────────────
  const createPulsingMarkerElement = (label = 'Target Field') => {
    const el = document.createElement('div');
    el.className = 'relative flex items-center justify-center cursor-pointer';
    el.innerHTML = `
      <div class="absolute -top-7 px-2 py-0.5 rounded-md bg-zinc-950/90 border border-emerald-500/50 text-emerald-300 font-mono text-[10px] whitespace-nowrap shadow-xl pointer-events-none">
        ${label}
      </div>
      <span class="absolute inline-flex h-10 w-10 animate-ping rounded-full bg-emerald-400 opacity-75"></span>
      <span class="relative inline-flex rounded-full h-4 w-4 bg-emerald-500 border-2 border-white shadow-[0_0_15px_#10b981]"></span>
    `;
    return el;
  };

  // ─── Set / Update Map Marker ──────────────────────────────────────────────
  const setMarkerAt = useCallback((coords, label) => {
    if (!mapRef.current) return;
    if (markerRef.current) {
      markerRef.current.remove();
    }

    const markerEl = createPulsingMarkerElement(label);
    const marker = new maplibregl.Marker({ element: markerEl, anchor: 'center' })
      .setLngLat(coords)
      .addTo(mapRef.current);

    markerRef.current = marker;
  }, []);

  // ─── Cinematic Fly-To Location Handler ────────────────────────────────────
  const flyToLocation = useCallback(
    (loc) => {
      if (!mapRef.current) return;

      setIsRotating(false);
      setIsFlying(true);
      setSelectedLocation(loc);

      const targetCoords = loc.coordinates; // [lng, lat]
      const targetZoom = loc.zoom || 14.8;
      const targetPitch = loc.pitch !== undefined ? loc.pitch : 48;
      const targetBearing = loc.bearing || 15;

      mapRef.current.flyTo({
        center: targetCoords,
        zoom: targetZoom,
        pitch: targetPitch,
        bearing: targetBearing,
        duration: 4200,
        essential: true,
      });

      setMarkerAt(targetCoords, loc.name || 'Selected Field');

      if (onLocationSelect) {
        onLocationSelect({
          lat: targetCoords[1],
          lng: targetCoords[0],
          name: loc.name,
          metadata: loc,
        });
      }

      setTimeout(() => {
        setIsFlying(false);
      }, 4300);
    },
    [onLocationSelect, setMarkerAt]
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

    map.on('load', () => {
      try {
        if (typeof map.setProjection === 'function') {
          map.setProjection({ type: 'globe' });
        }
      } catch (err) {
        console.warn('MapLibre globe projection warning:', err);
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
        // Sky atmosphere unsupported in some projections
      }

      map.resize();
    });

    // Altitude calculation directly updating DOM (No React re-renders)
    map.on('zoom', () => {
      if (altitudeRef.current) {
        const z = map.getZoom();
        const km = Math.round(20000 * Math.pow(0.35, Math.max(0, z - 1)));
        altitudeRef.current.textContent = km > 1000 ? `${km.toLocaleString()} km` : `${Math.max(0.8, km).toFixed(1)} km`;
      }
    });

    map.on('pitch', () => {
      setCurrentPitch(map.getPitch());
    });

    // Throttled mousemove with direct DOM ref (100% lag-free)
    map.on('mousemove', (e) => {
      if (mouseRafRef.current) return;
      mouseRafRef.current = requestAnimationFrame(() => {
        mouseRafRef.current = null;
        if (coordsRef.current && e.lngLat) {
          const lat = e.lngLat.lat;
          const lng = e.lngLat.lng;
          const latStr = lat >= 0 ? `${lat.toFixed(3)}°N` : `${Math.abs(lat).toFixed(3)}°S`;
          const lngStr = lng >= 0 ? `${lng.toFixed(3)}°E` : `${Math.abs(lng).toFixed(3)}°W`;
          coordsRef.current.textContent = `${latStr}, ${lngStr}`;
        }
      });
    });

    // Pause spin while user is actively interacting
    map.on('dragstart', () => {
      isInteractingRef.current = true;
      setIsRotating(false);
    });
    map.on('dragend', () => {
      isInteractingRef.current = false;
    });

    // Click anywhere to zoom into a farm location
    map.on('click', (e) => {
      const coords = [Number(e.lngLat.lng.toFixed(5)), Number(e.lngLat.lat.toFixed(5))];
      flyToLocation({
        name: `Farm Plot (${coords[1].toFixed(3)}°N, ${coords[0].toFixed(3)}°E)`,
        coordinates: coords,
        zoom: Math.max(map.getZoom(), 14.5),
        pitch: 45,
      });
    });

    const handleResize = () => map.resize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (mouseRafRef.current) cancelAnimationFrame(mouseRafRef.current);
      if (markerRef.current) markerRef.current.remove();
      map.remove();
      mapRef.current = null;
    };
  }, [flyToLocation, initialCenter, initialZoom]);

  // ─── GPU-Synchronized Orbit Spin (requestAnimationFrame) ────────────────────
  useEffect(() => {
    if (!isRotating) {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      return;
    }

    let lastTime = performance.now();
    const spinLoop = (now) => {
      const delta = (now - lastTime) / 1000;
      lastTime = now;

      if (mapRef.current && !isInteractingRef.current && !isFlying) {
        const zoom = mapRef.current.getZoom();
        // Spin only when zoomed out at orbital levels (z < 5)
        if (zoom < 5) {
          const center = mapRef.current.getCenter();
          // Natural slow drift: 360 deg in ~120s
          center.lng -= 3 * delta;
          mapRef.current.jumpTo({ center });
        }
      }

      animFrameRef.current = requestAnimationFrame(spinLoop);
    };

    animFrameRef.current = requestAnimationFrame(spinLoop);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isRotating, isFlying]);

  // ─── Control Actions ──────────────────────────────────────────────────────
  const handleZoomIn = () => mapRef.current?.zoomIn();
  const handleZoomOut = () => mapRef.current?.zoomOut();

  const handleResetOrbit = () => {
    if (markerRef.current) markerRef.current.remove();
    setSelectedLocation(null);
    mapRef.current?.flyTo({
      center: initialCenter,
      zoom: initialZoom,
      pitch: 0,
      bearing: 0,
      duration: 2500,
      essential: true,
    });
    setTimeout(() => {
      setIsRotating(true);
    }, 2600);
  };

  const handleTogglePitch = () => {
    if (!mapRef.current) return;
    const nextPitch = currentPitch > 20 ? 0 : 55;
    mapRef.current.easeTo({ pitch: nextPitch, duration: 800 });
  };

  return (
    <div className="relative w-full h-full min-h-screen bg-black overflow-hidden select-none font-sans">
      {/* ── 3D Globe Canvas Container ── */}
      <div ref={containerRef} className="absolute inset-0 w-full h-full bg-[#000005]" />

      {/* ── Atmospheric Radial Glow Overlay ── */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,transparent_40%,rgba(0,0,5,0.4)_100%)]" />

      {/* ── Top-Left: Mission HUD & Live Telemetry ── */}
      <div className="absolute top-5 left-5 z-20">
        <MissionHUD
          selectedLocation={selectedLocation}
          isFlying={isFlying}
          coordsRef={coordsRef}
          altitudeRef={altitudeRef}
        />
      </div>

      {/* ── Top-Right: Location Toolbar (Get My Location & Pilot Farms) ── */}
      <div className="absolute top-5 right-5 z-20">
        <LocationToolbar onFlyToLocation={flyToLocation} isFlying={isFlying} />
      </div>

      {/* ── Bottom-Left: Satellite Constellations ── */}
      <div className="absolute bottom-6 left-5 z-20 hidden md:flex">
        <SatelliteConstellations />
      </div>

      {/* ── Bottom-Right: Interactive Orbit & Camera Controls ── */}
      <div className="absolute bottom-6 right-5 z-20">
        <GlobeControls
          isRotating={isRotating}
          onToggleRotate={() => setIsRotating((prev) => !prev)}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onResetOrbit={handleResetOrbit}
          onTogglePitch={handleTogglePitch}
          currentPitch={currentPitch}
        />
      </div>
    </div>
  );
}
