import React from 'react';
import { useTranslation } from '../../context/LanguageContext';

export default function CinematicHeroOverlay({ onEnterExperience }) {
  const { t, isRtl } = useTranslation();

  return (
    <div
      className="absolute inset-0 pointer-events-none z-20 flex items-center p-6 sm:p-12 md:p-16 lg:p-20 select-none overflow-hidden"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      {/* ── Left Editorial Text Floating Directly in Space ── */}
      <div
        onClick={onEnterExperience}
        className="pointer-events-auto max-w-xl cursor-pointer group transition-all duration-300"
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
    </div>
  );
}
