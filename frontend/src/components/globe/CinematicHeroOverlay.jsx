import React from 'react';
import { Sparkles, Compass } from 'lucide-react';
import { useTranslation } from '../../context/LanguageContext';
import Mascot3DViewer from './Mascot3DViewer';

export default function CinematicHeroOverlay({ onEnterExperience }) {
  const { t, isRtl } = useTranslation();

  return (
    <div
      className="absolute inset-0 pointer-events-none z-20 flex flex-col lg:flex-row items-center justify-between p-6 sm:p-10 md:p-14 lg:p-16 select-none overflow-hidden"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      {/* ── Left Editorial Text Floating Directly in Space ── */}
      <div
        onClick={onEnterExperience}
        className="pointer-events-auto max-w-xl cursor-pointer group transition-all duration-300 z-10 shrink-0"
        title={t('hero.clickToEnter', {}, 'Click to enter experience')}
      >
        {/* Subtle Eyebrow */}
        <div className="flex items-center gap-2 mb-4">
          <span className="w-6 h-[1.5px] bg-zinc-500 group-hover:w-10 transition-all duration-500" />
          <span className="text-[11px] font-mono uppercase tracking-widest text-zinc-400 font-medium">
            {t('hero.eyebrow', {}, 'NASA EARTH OBSERVATION · AGRICULTURE · SCIENCE')}
          </span>
        </div>

        {/* Hero Headline */}
        <h1 className="font-display text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-normal tracking-tight text-white leading-none drop-shadow-[0_4px_30px_rgba(0,0,0,0.85)] group-hover:text-cyan-50 transition-colors duration-300">
          {t('hero.title', {}, 'Farmer Eye')}
        </h1>

        {/* Subtitle */}
        <p className="font-display italic text-2xl sm:text-3xl text-zinc-300 font-light mt-3 tracking-wide drop-shadow-[0_2px_15px_rgba(0,0,0,0.85)]">
          {t('hero.subtitle', {}, "The Farmer's Second Eyes.")}
        </p>

        {/* Description */}
        <p className="text-zinc-400 text-sm sm:text-base font-sans mt-6 leading-relaxed max-w-lg drop-shadow-[0_2px_12px_rgba(0,0,0,0.85)] group-hover:text-zinc-300 transition-colors duration-300">
          {t('hero.description', {}, 'Turning NASA Earth observations, agricultural science, and artificial intelligence into clearer, climate-resilient farming decisions.')}
        </p>

        {/* Subtle Spatial Prompt */}
        <div className="mt-8 flex items-center gap-3 text-xs sm:text-sm font-mono text-zinc-400 tracking-wider uppercase group-hover:text-zinc-200 transition-colors duration-300">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>{t('hero.clickToExplore', {}, 'Click anywhere to explore ➔')}</span>
        </div>
      </div>

      {/* ── Center is intentionally open for the 3D rotating globe ── */}

      {/* ── Right: 3D Mascot Character welcoming the visitor ── */}
      <div className="pointer-events-auto flex flex-col items-center justify-center lg:items-center mt-6 lg:mt-0 z-10 shrink-0">
        {/* Fluid Thought Cloud emerging from head */}
        <div
          onClick={onEnterExperience}
          className="relative max-w-xs sm:max-w-sm rounded-[32px] bg-[#0b0e14]/85 border border-zinc-700/60 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8)] backdrop-blur-2xl p-5 sm:p-6 text-zinc-100 transition-all duration-300 hover:border-zinc-500 hover:scale-[1.02] cursor-pointer animate-float"
        >
          {/* Subtle cloud glow effect */}
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-emerald-400" />
              <span>{t('mascot.role', {}, 'Your 3D AI Agronomist')}</span>
            </span>
            <span className="text-[10px] font-mono text-zinc-400">NASA AI</span>
          </div>

          {/* Welcoming Greeting */}
          <h3 className="font-display text-sm sm:text-base font-bold text-white leading-snug">
            {t('mascot.greeting', {}, 'Welcome to Farmer Eye! 👋')}
          </h3>

          {/* Speech Message */}
          <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed mt-1.5 font-body">
            {t('mascot.message', {}, "I'm here to help you navigate NASA Earth observations, soil moisture, and climate-resilient crop rotations. Click anywhere to start our journey!")}
          </p>

          {/* Thought cloud tail dots leading down toward the gardener's head */}
          <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 pointer-events-none">
            <div className="w-3.5 h-3.5 rounded-full bg-[#0b0e14] border border-zinc-700/70 shadow-sm" />
            <div className="w-2 h-2 rounded-full bg-[#0b0e14] border border-zinc-700/70 shadow-xs" />
          </div>
        </div>

        {/* 3D Model Display */}
        <div
          onClick={onEnterExperience}
          className="relative w-72 sm:w-80 md:w-96 h-[360px] sm:h-[420px] md:h-[470px] flex items-center justify-center cursor-grab active:cursor-grabbing group transition-transform duration-300 hover:scale-[1.02] pt-2"
          title={t('hero.clickToEnter', {}, 'Click to enter experience')}
        >
          <Mascot3DViewer modelSrc="/models/gardener.glb" />
        </div>
      </div>
    </div>
  );
}
