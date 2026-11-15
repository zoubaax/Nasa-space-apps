import React, { useState } from 'react';
import {
  Satellite,
  Layers,
  FlaskConical,
  Cpu,
  ArrowRight,
  Play,
  Crosshair,
  Volume2,
  VolumeX,
  Compass,
  Globe2,
} from 'lucide-react';
import { useTranslation } from '../../context/LanguageContext';

export default function CinematicHeroOverlay({
  onEnterExperience,
  onSelectTerroir,
  onOpenStory,
}) {
  const { t, langInfo, isManualEnglish, toggleLanguageMode, isRtl } = useTranslation();
  const [isAudioActive, setIsAudioActive] = useState(false);

  return (
    <div
      className="absolute inset-0 pointer-events-none z-20 flex flex-col justify-between p-6 sm:p-10 select-none overflow-hidden"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      {/* ── Top Navigation Bar ── */}
      <header className="flex items-center justify-between w-full pointer-events-auto">
        {/* Brand Logo & Identity */}
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-400/30 text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.3)]">
            <Globe2 className="w-4 h-4 text-cyan-400 animate-spin-slow" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-mono font-bold tracking-widest text-sm text-zinc-100 uppercase">
              FARMER <span className="text-cyan-400">EYE</span>
            </span>
            <span className="text-zinc-600 hidden sm:inline">|</span>
            <span className="text-xs text-zinc-300 hidden sm:inline">
              DEVUPWARD · {t('hud.missionTitle', {}, "The Farmer's Second Eyes")}
            </span>
          </div>
        </div>

        {/* Top Right Links & Language Selector */}
        <div className="flex items-center gap-4 text-xs text-zinc-300">
          <button
            type="button"
            onClick={() => onSelectTerroir && onSelectTerroir({ name: 'Saïss / Meknes', lng: -5.55, lat: 33.89 })}
            className="hover:text-white transition hidden md:inline cursor-pointer"
          >
            EARTH TRIALS
          </button>
          <span className="text-zinc-700 hidden md:inline">|</span>
          <span className="text-zinc-400 hidden md:inline">
            IMPACT 2030
          </span>
          <span className="text-zinc-700 hidden md:inline">|</span>

          {/* Minimal Language Switcher */}
          <div className="flex items-center p-0.5 rounded-full bg-zinc-900/80 border border-white/[0.1] backdrop-blur-md">
            <button
              type="button"
              onClick={() => toggleLanguageMode('native')}
              className={`px-2.5 py-0.5 rounded-full text-xs font-medium transition cursor-pointer ${
                !isManualEnglish
                  ? 'bg-zinc-800 text-cyan-300 font-bold border border-cyan-500/40 shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              {langInfo?.native || 'الدارجة'}
            </button>
            <button
              type="button"
              onClick={() => toggleLanguageMode('en')}
              className={`px-2.5 py-0.5 rounded-full text-xs font-medium transition cursor-pointer ${
                isManualEnglish
                  ? 'bg-zinc-800 text-cyan-300 font-bold border border-cyan-500/40 shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              EN
            </button>
          </div>
        </div>
      </header>

      {/* ── Main Middle Row (Hero Left + Capability Cards Right) ── */}
      <div className="flex-1 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8 py-6 my-auto">
        
        {/* ── Left Editorial Hero Content ── */}
        <div className="pointer-events-auto max-w-xl animate-fade-in">
          {/* Eyebrow */}
          <div className="flex items-center gap-2 mb-3">
            <span className="w-5 h-[1.5px] bg-cyan-400"></span>
            <span className="text-[11px] font-mono uppercase tracking-widest text-cyan-400/90 font-medium">
              NASA EARTH OBSERVATION · AGRICULTURE · AI
            </span>
          </div>

          {/* Majestic Hero Headline */}
          <h1 className="font-display text-5xl sm:text-6xl md:text-7xl font-normal tracking-tight text-white leading-none">
            Farmer Eye
          </h1>

          {/* Subtitle */}
          <p className="font-display italic text-2xl sm:text-3xl text-zinc-300 font-light mt-2 tracking-wide">
            The Farmer's Second Eyes.
          </p>

          {/* Editorial Description */}
          <p className="text-zinc-400 text-sm sm:text-base font-sans mt-5 leading-relaxed max-w-lg">
            Turning NASA Earth observations, agricultural science, and artificial intelligence into clearer, climate-resilient farming decisions.
          </p>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-4 mt-8">
            <button
              type="button"
              onClick={onEnterExperience}
              className="px-7 py-3.5 rounded-full bg-gradient-to-r from-cyan-400 to-teal-400 hover:from-cyan-300 hover:to-teal-300 text-zinc-950 font-mono text-xs font-bold uppercase tracking-wider shadow-[0_0_35px_rgba(6,182,212,0.45)] hover:shadow-[0_0_45px_rgba(6,182,212,0.7)] flex items-center gap-2.5 transition-all duration-300 hover:scale-105 active:scale-95 cursor-pointer"
            >
              <span>ENTER EXPERIENCE</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => onOpenStory ? onOpenStory() : onSelectTerroir && onSelectTerroir({ name: 'Saïss / Meknes', lng: -5.55, lat: 33.89 })}
              className="px-5 py-3 rounded-full bg-zinc-900/60 hover:bg-zinc-800/80 border border-white/[0.1] hover:border-white/[0.25] text-zinc-200 text-xs font-mono tracking-wider flex items-center gap-2 transition cursor-pointer backdrop-blur-md"
            >
              <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center">
                <Play className="w-2.5 h-2.5 fill-current text-white ml-0.5" />
              </div>
              <span>WATCH OUR STORY</span>
            </button>
          </div>
        </div>

        {/* ── Right Capabilities Vertical Stack ── */}
        <div className="pointer-events-auto w-full sm:w-72 lg:w-80 flex flex-col gap-2.5 animate-fade-in-right">
          {/* Card 1: NASA POWER */}
          <div className="p-3.5 rounded-2xl bg-zinc-950/40 hover:bg-zinc-900/60 border border-white/[0.06] hover:border-white/[0.15] backdrop-blur-md transition-all cursor-pointer flex items-center gap-3.5 group">
            <div className="w-9 h-9 rounded-xl bg-sky-500/10 border border-sky-400/20 text-sky-400 flex items-center justify-center shrink-0 group-hover:bg-sky-500/20 transition">
              <Satellite className="w-4 h-4 text-sky-400" />
            </div>
            <div>
              <span className="font-mono font-bold text-xs text-zinc-100 block tracking-wide">
                NASA POWER
              </span>
              <span className="text-[11px] text-zinc-400 font-sans block mt-0.5">
                Climate & Weather Data
              </span>
            </div>
          </div>

          {/* Card 2: NASA SMAP */}
          <div className="p-3.5 rounded-2xl bg-zinc-950/40 hover:bg-zinc-900/60 border border-white/[0.06] hover:border-white/[0.15] backdrop-blur-md transition-all cursor-pointer flex items-center gap-3.5 group">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-400/20 text-cyan-400 flex items-center justify-center shrink-0 group-hover:bg-cyan-500/20 transition">
              <Layers className="w-4 h-4 text-cyan-400" />
            </div>
            <div>
              <span className="font-mono font-bold text-xs text-zinc-100 block tracking-wide">
                NASA SMAP
              </span>
              <span className="text-[11px] text-zinc-400 font-sans block mt-0.5">
                Soil Moisture Intelligence
              </span>
            </div>
          </div>

          {/* Card 3: Scientific Models */}
          <div className="p-3.5 rounded-2xl bg-zinc-950/40 hover:bg-zinc-900/60 border border-white/[0.06] hover:border-white/[0.15] backdrop-blur-md transition-all cursor-pointer flex items-center gap-3.5 group">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-400/20 text-emerald-400 flex items-center justify-center shrink-0 group-hover:bg-emerald-500/20 transition">
              <FlaskConical className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <span className="font-mono font-bold text-xs text-zinc-100 block tracking-wide">
                Scientific Models
              </span>
              <span className="text-[11px] text-zinc-400 font-sans block mt-0.5">
                Crop, Water & Climate (FAO-56)
              </span>
            </div>
          </div>

          {/* Card 4: AI Intelligence */}
          <div className="p-3.5 rounded-2xl bg-zinc-950/40 hover:bg-zinc-900/60 border border-white/[0.06] hover:border-white/[0.15] backdrop-blur-md transition-all cursor-pointer flex items-center gap-3.5 group">
            <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-400/20 text-purple-400 flex items-center justify-center shrink-0 group-hover:bg-purple-500/20 transition">
              <Cpu className="w-4 h-4 text-purple-400" />
            </div>
            <div>
              <span className="font-mono font-bold text-xs text-zinc-100 block tracking-wide">
                AI Intelligence
              </span>
              <span className="text-[11px] text-zinc-400 font-sans block mt-0.5">
                Interpretation & Decision Support
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Bottom Telemetry Strip ── */}
      <footer className="pointer-events-auto flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-white/[0.06]">
        {/* Left Orbital Readouts */}
        <div className="flex items-center gap-6 text-xs font-mono" dir="ltr">
          <div>
            <span className="text-[9px] text-zinc-500 uppercase tracking-widest block font-medium">ALTITUDE</span>
            <span className="font-bold text-zinc-200 tabular-nums">20,000 km</span>
          </div>
          <div className="w-[1px] h-6 bg-zinc-800"></div>
          <div>
            <span className="text-[9px] text-zinc-500 uppercase tracking-widest block font-medium">COORDINATES</span>
            <span className="font-bold text-zinc-200 tabular-nums">34.03° N, 4.98° W</span>
          </div>
        </div>

        {/* Center Target Zone Indicator */}
        <div
          onClick={() => onSelectTerroir && onSelectTerroir({ name: 'Fès – Saïss, Morocco', lng: -5.55, lat: 33.89 })}
          className="flex items-center gap-3 px-4 py-1.5 rounded-full bg-zinc-900/50 hover:bg-zinc-900/80 border border-white/[0.08] hover:border-cyan-400/30 transition cursor-pointer backdrop-blur-md"
        >
          <Crosshair className="w-4 h-4 text-cyan-400 animate-pulse shrink-0" />
          <div className="text-center">
            <span className="text-[9px] font-mono text-cyan-400 tracking-widest uppercase block">
              TARGET ZONE
            </span>
            <span className="font-display font-medium text-sm text-zinc-100 tracking-wide">
              Fès – Saïss
            </span>
            <span className="text-[9px] font-mono text-zinc-500 tracking-widest uppercase block">
              MOROCCO
            </span>
          </div>
        </div>

        {/* Right Ambient Controls */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsAudioActive(!isAudioActive)}
            className="p-2 rounded-full bg-zinc-900/70 hover:bg-zinc-800 border border-white/[0.08] text-zinc-400 hover:text-white transition cursor-pointer backdrop-blur-md"
            title={isAudioActive ? 'Mute Atmosphere Audio' : 'Play Planetary Atmosphere Ambience'}
          >
            {isAudioActive ? (
              <Volume2 className="w-4 h-4 text-cyan-400" />
            ) : (
              <VolumeX className="w-4 h-4 text-zinc-500" />
            )}
          </button>
        </div>
      </footer>
    </div>
  );
}
