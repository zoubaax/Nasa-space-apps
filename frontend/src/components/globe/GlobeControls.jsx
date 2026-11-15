import React from 'react';
import {
  TbZoomIn,
  TbZoomOut,
  TbRefresh,
  TbEye,
} from 'react-icons/tb';
import { useTranslation } from '../../context/LanguageContext';

export default function GlobeControls({
  isRotating,
  onToggleRotate,
  onZoomIn,
  onZoomOut,
  onResetOrbit,
  onTogglePitch,
  currentPitch = 0,
}) {
  const { t, isRtl } = useTranslation();

  return (
    <div
      className="flex items-center gap-2 select-none"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      {/* Auto Spin Toggle */}
      <button
        onClick={onToggleRotate}
        type="button"
        className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-mono font-medium backdrop-blur-md border transition-all duration-300 cursor-pointer shadow-lg ${
          isRotating
            ? 'bg-cyan-950/80 border-cyan-500/50 text-cyan-300 shadow-cyan-900/30'
            : 'bg-zinc-950/80 border-zinc-800/80 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
        }`}
        title={t('controls.orbitSpinOn', {}, 'Toggle Planetary Orbit Rotation')}
      >
        <span
          className={`w-2 h-2 rounded-full ${
            isRotating ? 'bg-cyan-400 animate-pulse' : 'bg-zinc-600'
          }`}
        />
        <span>{isRotating ? t('controls.orbitSpinOn', {}, 'Orbit Spin ON') : t('controls.orbitSpinPaused', {}, 'Spin Paused')}</span>
      </button>

      {/* 3D Pitch Tilt Toggle */}
      <button
        onClick={onTogglePitch}
        type="button"
        className={`p-2.5 rounded-xl border backdrop-blur-md transition-all cursor-pointer shadow-lg ${
          currentPitch > 20
            ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300'
            : 'bg-zinc-950/80 hover:bg-zinc-900 border-zinc-800/80 text-zinc-400 hover:text-zinc-200'
        }`}
        title={t('controls.togglePitch', {}, 'Toggle 3D Horizon Pitch')}
      >
        <TbEye className="w-4 h-4" />
      </button>

      {/* Zoom In */}
      <button
        onClick={onZoomIn}
        type="button"
        className="p-2.5 rounded-xl bg-zinc-950/80 hover:bg-zinc-900 border border-zinc-800/80 text-zinc-300 hover:text-white backdrop-blur-md transition-all cursor-pointer shadow-lg"
        title={t('controls.zoomIn', {}, 'Zoom In')}
      >
        <TbZoomIn className="w-4 h-4" />
      </button>

      {/* Zoom Out */}
      <button
        onClick={onZoomOut}
        type="button"
        className="p-2.5 rounded-xl bg-zinc-950/80 hover:bg-zinc-900 border border-zinc-800/80 text-zinc-300 hover:text-white backdrop-blur-md transition-all cursor-pointer shadow-lg"
        title={t('controls.zoomOut', {}, 'Zoom Out')}
      >
        <TbZoomOut className="w-4 h-4" />
      </button>

      {/* Reset Orbit */}
      <button
        onClick={onResetOrbit}
        type="button"
        className="p-2.5 rounded-xl bg-zinc-950/80 hover:bg-zinc-900 border border-zinc-800/80 text-zinc-300 hover:text-white backdrop-blur-md transition-all cursor-pointer shadow-lg"
        title={t('controls.resetOrbit', {}, 'Reset Global Earth Orbit')}
      >
        <TbRefresh className="w-4 h-4" />
      </button>
    </div>
  );
}
