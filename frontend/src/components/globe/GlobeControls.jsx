import React from 'react';
import { RotateCcw, Eye, ZoomIn, ZoomOut } from 'lucide-react';
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
      className="flex items-center gap-2 p-1.5 sm:p-2 rounded-2xl bg-[#0b0e14]/95 border border-zinc-800 shadow-2xl backdrop-blur-2xl select-none font-body text-zinc-300"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      {/* Auto Orbit Rotation Toggle */}
      <button
        onClick={onToggleRotate}
        type="button"
        className={`flex items-center gap-2 p-2 sm:px-4 sm:py-2 rounded-xl text-xs sm:text-sm font-bold transition cursor-pointer ${
          isRotating
            ? 'bg-zinc-800 border border-zinc-700 text-zinc-100 shadow-sm'
            : 'bg-zinc-900/80 border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800'
        }`}
        title={t('controls.orbitSpinOn', {}, 'Toggle Planetary Orbit Rotation')}
      >
        <span
          className={`w-2 h-2 rounded-full ${
            isRotating ? 'bg-emerald-400' : 'bg-zinc-500'
          }`}
        />
        <span className="hidden sm:inline">
          {isRotating ? t('controls.orbitSpinOn', {}, 'Orbit Spin ON') : t('controls.orbitSpinPaused', {}, 'Spin Paused')}
        </span>
      </button>

      {/* 3D Horizon Pitch Tilt Toggle */}
      <button
        onClick={onTogglePitch}
        type="button"
        className={`p-2 rounded-xl border transition cursor-pointer ${
          currentPitch > 20
            ? 'bg-zinc-800 border-zinc-700 text-zinc-100 shadow-sm'
            : 'bg-zinc-900/80 hover:bg-zinc-800 border-zinc-800 text-zinc-300 hover:text-white'
        }`}
        title={t('controls.togglePitch', {}, 'Toggle 3D Horizon Pitch')}
      >
        <Eye className="w-4 h-4 sm:w-5 sm:h-5" />
      </button>

      {/* Zoom In */}
      <button
        onClick={onZoomIn}
        type="button"
        className="p-2 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white transition cursor-pointer shadow-sm"
        title={t('controls.zoomIn', {}, 'Zoom In')}
      >
        <ZoomIn className="w-4 h-4 sm:w-5 sm:h-5" />
      </button>

      {/* Zoom Out */}
      <button
        onClick={onZoomOut}
        type="button"
        className="p-2 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white transition cursor-pointer shadow-sm"
        title={t('controls.zoomOut', {}, 'Zoom Out')}
      >
        <ZoomOut className="w-4 h-4 sm:w-5 sm:h-5" />
      </button>

      {/* Reset Global Orbit */}
      <button
        onClick={onResetOrbit}
        type="button"
        className="p-2 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white transition cursor-pointer shadow-sm"
        title={t('controls.resetGlobalOrbit', {}, 'Reset Global Orbit')}
      >
        <RotateCcw className="w-4 h-4 sm:w-5 sm:h-5" />
      </button>
    </div>
  );
}
