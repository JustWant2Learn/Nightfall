"use client";

import {
  Gauge,
  Ghost,
  Heart,
  Home,
  Keyboard,
  MousePointer2,
  Play,
  Shield,
  Sparkles,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { audio } from "@/lib/audio";
import { BASE_STATS, resetRuntime, useGameStore, type Character } from "@/lib/store";

export function MainMenu() {
  const character = useGameStore((s) => s.character);
  const setCharacter = useGameStore((s) => s.setCharacter);
  const start = useGameStore((s) => s.start);
  const total = useGameStore((s) => s.totalTalismans);

  const handleStart = () => {
    audio.init();
    audio.startAmbient();
    resetRuntime();
    start();
  };

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-[#050408] px-4 py-12">
      {/* Ambient backdrop */}
      <div
        className="nf-drift pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 50% at 50% 0%, rgba(60,20,90,0.28), transparent 70%), radial-gradient(ellipse 60% 45% at 20% 100%, rgba(120,20,20,0.16), transparent 70%), radial-gradient(ellipse 55% 40% at 85% 90%, rgba(20,40,80,0.18), transparent 70%)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.9) 100%)",
        }}
      />

      <div className="relative z-10 flex w-full max-w-3xl flex-col items-center gap-10">
        {/* Title */}
        <div className="text-center">
          <div className="mb-3 flex items-center justify-center gap-2 text-red-500/80">
            <Ghost className="size-5" />
            <span className="text-xs font-medium tracking-[0.5em] uppercase">
              A third-person horror
            </span>
          </div>
          <h1
            className="nf-flicker text-6xl font-black tracking-[0.18em] text-white sm:text-7xl"
            style={{ textShadow: "0 0 24px rgba(255,40,20,0.55), 0 0 90px rgba(255,40,20,0.25)" }}
          >
            NIGHTFALL
          </h1>
          <p className="mt-4 text-sm text-white/50">
            Three biomes. Three bosses. Scavenge fragments and key pieces,
            combine skills at the shrines, then kill the Rotting Bear, the Ogre,
            and the Hollow One before the north gate will open. {total} talismans
            still feed your Power.
          </p>
        </div>

        {/* Character select */}
        <div className="w-full">
          <p className="mb-3 text-center text-xs font-medium tracking-[0.3em] text-white/40 uppercase">
            Choose your survivor
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <SurvivorCard
              name="Maya"
              tagline="Quick and quiet"
              value="girl"
              selected={character === "girl"}
              onSelect={setCharacter}
              accent="#d0679d"
            />
            <SurvivorCard
              name="Eli"
              tagline="Steady under pressure"
              value="boy"
              selected={character === "boy"}
              onSelect={setCharacter}
              accent="#4d9db8"
            />
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-white/45">
          <span className="flex items-center gap-1.5">
            <Keyboard className="size-3.5" /> WASD to move · Space to jump
          </span>
          <span className="flex items-center gap-1.5">
            <Zap className="size-3.5" /> Shift to sprint
          </span>
          <span className="flex items-center gap-1.5">
            <MousePointer2 className="size-3.5" /> Mouse to look
          </span>
          <span className="flex items-center gap-1.5">
            <Home className="size-3.5" /> Houses are safe zones
          </span>
          <span className="flex items-center gap-1.5">
            <Sparkles className="size-3.5" /> Click to fire · Tab for the skill bench
          </span>
          <span className="flex items-center gap-1.5">
            <Shield className="size-3.5" /> Glowing pickups raise your stats
          </span>
        </div>

        <Button size="lg" className="h-12 gap-2 px-10 text-base font-bold tracking-widest uppercase" onClick={handleStart}>
          <Play className="size-5" />
          Enter the forest
        </Button>
        <p className="-mt-6 text-[11px] text-white/30">
          Best played on desktop with headphones.
        </p>
      </div>
    </div>
  );
}

interface SurvivorCardProps {
  name: string;
  tagline: string;
  value: Character;
  selected: boolean;
  accent: string;
  onSelect: (c: Character) => void;
}

function SurvivorCard({ name, tagline, value, selected, accent, onSelect }: SurvivorCardProps) {
  const stats = BASE_STATS[value];
  return (
    <Card
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={() => onSelect(value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onSelect(value);
      }}
      className={cn(
        "cursor-pointer border-2 bg-black/50 py-5 backdrop-blur transition-all hover:scale-[1.02]",
        selected
          ? "border-primary shadow-[0_0_30px_rgba(200,40,30,0.25)]"
          : "border-white/10 opacity-70 hover:opacity-100"
      )}
    >
      <CardContent className="flex items-center gap-4 px-5">
        <SurvivorAvatar variant={value} accent={accent} />
        <div className="min-w-0 flex-1">
          <p className="text-lg font-bold text-white">{name}</p>
          <p className="text-xs text-white/50">{tagline}</p>
          <p className="mt-1 text-[10px] tracking-[0.25em] text-white/35 uppercase">
            {value === "girl" ? "Girl" : "Boy"}
          </p>
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
            <StatRow icon={<Heart className="size-3 text-red-400" />} label="Health" value={`${stats.maxHealth}`} />
            <StatRow icon={<Gauge className="size-3 text-amber-300" />} label="Speed" value={`×${stats.speed.toFixed(2)}`} />
            <StatRow icon={<Zap className="size-3 text-emerald-300" />} label="Stamina" value={`${stats.maxStamina}`} />
            <StatRow icon={<Shield className="size-3 text-sky-300" />} label="Armor" value={`${stats.armor}%`} />
          </div>
        </div>
        {selected && (
          <span className="ml-auto rounded-full bg-primary/20 px-2.5 py-1 text-[10px] font-bold tracking-widest text-primary uppercase">
            Selected
          </span>
        )}
      </CardContent>
    </Card>
  );
}

function StatRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <span className="flex items-center gap-1.5 text-white/60">
      {icon}
      <span className="tracking-wide uppercase text-[10px] text-white/40">{label}</span>
      <span className="ml-auto font-mono text-white/85">{value}</span>
    </span>
  );
}

/** Tiny SVG silhouette matching each survivor's in-game look. */
function SurvivorAvatar({ variant, accent }: { variant: Character; accent: string }) {
  return (
    <svg viewBox="0 0 64 88" className="h-20 w-14 shrink-0" aria-hidden>
      {/* head */}
      <circle cx="32" cy="16" r="10" fill="#e8b090" />
      {/* hair */}
      {variant === "girl" ? (
        <>
          <path d="M22 14 a10 10 0 0 1 20 0 v-2 a10 10 0 0 0 -20 0 z" fill="#4a2c1a" />
          <path d="M22 12 q10 -10 20 0 l-2 4 q-8 -8 -16 0 z" fill="#4a2c1a" />
          <path d="M40 18 q8 6 4 20 l-5 -2 q3 -10 -2 -15 z" fill="#4a2c1a" />
        </>
      ) : (
        <path d="M22 13 q10 -11 20 0 l-1 3 q-9 -8 -18 0 z" fill="#181410" />
      )}
      {/* torso */}
      <rect x="21" y="27" width="22" height="26" rx="8" fill={accent} />
      {/* skirt / jacket hem */}
      {variant === "girl" ? (
        <path d="M21 50 L43 50 L47 60 L17 60 Z" fill="#6e2c46" />
      ) : (
        <rect x="21" y="50" width="22" height="8" rx="3" fill="#1e3f4a" />
      )}
      {/* arms */}
      <rect x="13" y="29" width="7" height="22" rx="3.5" fill={accent} />
      <rect x="44" y="29" width="7" height="22" rx="3.5" fill={accent} />
      {/* legs */}
      <rect x="23" y="58" width="8" height="24" rx="4" fill={variant === "girl" ? "#2a2333" : "#26292e"} />
      <rect x="33" y="58" width="8" height="24" rx="4" fill={variant === "girl" ? "#2a2333" : "#26292e"} />
      {/* shoes */}
      <rect x="21" y="80" width="11" height="6" rx="3" fill="#15130f" />
      <rect x="32" y="80" width="11" height="6" rx="3" fill="#15130f" />
    </svg>
  );
}
