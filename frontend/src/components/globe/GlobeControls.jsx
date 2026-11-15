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
      className="flex items-center gap-1.5 p-1 rounded-xl bg-white/95 border border-slate-200/90 backdrop-blur-2xl shadow-[0_10px_35px_-5px_rgba(15,23,42,0.15)] select-none font-body text-slate-700"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      {/* Auto Orbit Rotation Toggle */}
      <button
        onClick={onToggleRotate}
        type="button"
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-300 cursor-pointer ${
          isRotating
            ? 'bg-cyan-50 border border-cyan-300 text-cyan-800 shadow-xs'
            : 'bg-slate-50 border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-white'
        }`}
        title={t('controls.orbitSpinOn', {}, 'Toggle Planetary Orbit Rotation')}
      >
        <span
          className={`w-2 h-2 rounded-full ${
            isRotating ? 'bg-cyan-600 animate-pulse' : 'bg-slate-400'
          }`}
        />
        <span>{isRotating ? t('controls.orbitSpinOn', {}, 'Orbit Spin ON') : t('controls.orbitSpinPaused', {}, 'Spin Paused')}</span>
      </button>

      {/* 3D Horizon Pitch Tilt Toggle */}
      <button
        onClick={onTogglePitch}
        type="button"
        className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
          currentPitch > 20
            ? 'bg-emerald-50 border-emerald-300 text-emerald-800 shadow-xs'
            : 'bg-slate-50 hover:bg-white border-slate-200 text-slate-600 hover:text-slate-900'
        }`}
        title={t('controls.togglePitch', {}, 'Toggle 3D Horizon Pitch')}
      >
        <Eye className="w-4 h-4" />
      </button>

      {/* Zoom In */}
      <button
        onClick={onZoomIn}
        type="button"
        className="p-1.5 rounded-lg bg-slate-50 hover:bg-white border border-slate-200 text-slate-600 hover:text-slate-900 transition-all cursor-pointer shadow-xs"
        title={t('controls.zoomIn', {}, 'Zoom In')}
      >
        <ZoomIn className="w-4 h-4" />
      </button>

      {/* Zoom Out */}
      <button
        onClick={onZoomOut}
        type="button"
        className="p-1.5 rounded-lg bg-slate-50 hover:bg-white border border-slate-200 text-slate-600 hover:text-slate-900 transition-all cursor-pointer shadow-xs"
        title={t('controls.zoomOut', {}, 'Zoom Out')}
      >
        <ZoomOut className="w-4 h-4" />
      </button>

      {/* Reset Global Orbit */}
      <button
        onClick={onResetOrbit}
        type="button"
        className="p-1.5 rounded-lg bg-slate-50 hover:bg-white border border-slate-200 text-slate-600 hover:text-slate-900 transition-all cursor-pointer shadow-xs"
        title={t('controls.resetGlobalOrbit', {}, 'Reset Global Orbit')}
      >
        <RotateCcw className="w-4 h-4" />
      </button>
    </div>
  );
}
