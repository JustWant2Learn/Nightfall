"use client";

import { useEffect, useState } from "react";
import {
  Droplets,
  Eye,
  Gauge,
  Heart,
  Home,
  MousePointerClick,
  Shield,
  Skull,
  Sparkles,
  TreePine,
  Zap,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { POWERUP_INFO, runtime, useGameStore } from "@/lib/store";
import { BIOME_INFO, type Biome } from "@/lib/world-data";
import { cn } from "@/lib/utils";

const BIOME_ICON: Record<Biome, typeof TreePine> = {
  forest: TreePine,
  swamp: Droplets,
  graveyard: Skull,
};

export function HUD() {
  const collected = useGameStore((s) => s.collected.length);
  const total = useGameStore((s) => s.totalTalismans);
  const gateOpen = useGameStore((s) => s.gateOpen);
  const stats = useGameStore((s) => s.stats);
  const lastPickup = useGameStore((s) => s.lastPickup);

  const [health, setHealth] = useState(100);
  const [stamina, setStamina] = useState(100);
  const [fear, setFear] = useState(0);
  const [hitFlash, setHitFlash] = useState(0);
  const [hunted, setHunted] = useState(false);
  const [safe, setSafe] = useState(false);
  const [paused, setPaused] = useState(true);
  const [biome, setBiome] = useState<Biome>("forest");
  const [expiredToastId, setExpiredToastId] = useState<number | null>(null);

  // Sample the per-frame runtime values on a slow interval so the HUD
  // never forces the 3D loop to re-render React.
  useEffect(() => {
    const interval = setInterval(() => {
      setHealth(runtime.health);
      setStamina(runtime.stamina);
      setFear(runtime.fear);
      setHitFlash(runtime.hitFlash);
      setHunted(runtime.monsterMood === "hunt");
      setSafe(runtime.playerSafe);
      setPaused(runtime.paused);
      setBiome(runtime.biome);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  // Hide the pickup toast a moment after each new powerup is taken.
  useEffect(() => {
    if (!lastPickup) return;
    const id = lastPickup.id;
    const timer = setTimeout(() => setExpiredToastId(id), 2600);
    return () => clearTimeout(timer);
  }, [lastPickup]);
  const toastVisible = lastPickup !== null && expiredToastId !== lastPickup.id;

  const healthPct = (health / stats.maxHealth) * 100;
  const staminaPct = (stamina / stats.maxStamina) * 100;
  const biomeInfo = BIOME_INFO[biome];
  const BiomeIcon = BIOME_ICON[biome];

  return (
    <div className="pointer-events-none absolute inset-0 select-none">
      {/* Fear vignette */}
      <div
        className="absolute inset-0 transition-opacity duration-500"
        style={{
          opacity: 0.12 + fear * 0.72,
          background:
            "radial-gradient(ellipse at center, transparent 42%, rgba(0,0,0,0.85) 100%)",
        }}
      />
      {hunted && !safe && (
        <div
          className="nf-pulse-red absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at center, transparent 55%, rgba(150,10,10,0.5) 100%)",
          }}
        />
      )}
      {/* Damage flash */}
      {hitFlash > 0.01 && (
        <div
          className="absolute inset-0"
          style={{
            opacity: hitFlash * 0.6,
            background:
              "radial-gradient(ellipse at center, rgba(180,20,20,0.35) 0%, rgba(120,0,0,0.85) 100%)",
          }}
        />
      )}
      {/* Low-health pulse */}
      {healthPct < 30 && !paused && (
        <div
          className="nf-pulse-red absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at center, transparent 60%, rgba(120,0,0,0.6) 100%)",
          }}
        />
      )}

      {/* Objective + talisman counter */}
      <div className="absolute top-4 left-4 flex flex-col gap-2">
        <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-black/55 px-3 py-2 backdrop-blur-sm">
          <Sparkles className="size-4 text-purple-400" />
          <span className="font-mono text-sm tracking-widest text-purple-100">
            {collected} / {total}
          </span>
        </div>
        <p className="max-w-55 text-xs text-white/60">
          {gateOpen ? (
            <span className="font-semibold text-sky-300">
              The gate is open. Run north — escape!
            </span>
          ) : (
            "Walk south into the open cabin if you need a safe house. Collect talismans to unseal the gate."
          )}
        </p>
      </div>

      {/* Current biome */}
      <div
        key={biome}
        className="absolute top-4 right-4 flex items-center gap-2.5 rounded-lg border border-border/60 bg-black/55 px-3 py-2 backdrop-blur-sm animate-in fade-in slide-in-from-top-2 duration-500"
      >
        <BiomeIcon className="size-4" style={{ color: biomeInfo.lamp }} />
        <div className="text-right">
          <p className="text-[11px] font-bold tracking-[0.2em] text-white/85 uppercase">{biomeInfo.name}</p>
          <p className="text-[10px] text-white/45">{biomeInfo.tagline}</p>
        </div>
      </div>

      {/* Hunted warning */}
      {safe ? (
        <div className="absolute top-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-emerald-800/70 bg-emerald-950/75 px-4 py-2 backdrop-blur-sm">
          <Home className="size-4 text-emerald-300" />
          <span className="text-sm font-bold tracking-[0.25em] text-emerald-200 uppercase">
            Safe haven
          </span>
        </div>
      ) : hunted ? (
        <div className="absolute top-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-red-900/70 bg-red-950/70 px-4 py-2 backdrop-blur-sm">
          <Eye className="size-4 animate-pulse text-red-400" />
          <span className="text-sm font-bold tracking-[0.25em] text-red-300 uppercase">
            It sees you
          </span>
        </div>
      ) : null}

      {/* Powerup toast */}
      {lastPickup && (
        <div
          key={lastPickup.id}
          className={cn(
            "absolute top-1/4 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-xl border bg-black/70 px-5 py-3 backdrop-blur-md transition-opacity duration-500",
            toastVisible ? "opacity-100 animate-in fade-in zoom-in-95" : "opacity-0"
          )}
          style={{ borderColor: `${POWERUP_INFO[lastPickup.type].color}80` }}
        >
          <PowerupIcon type={lastPickup.type} className="size-5" />
          <div>
            <p
              className="text-sm font-bold tracking-[0.2em] uppercase"
              style={{ color: POWERUP_INFO[lastPickup.type].color }}
            >
              {POWERUP_INFO[lastPickup.type].label}
            </p>
            <p className="text-xs text-white/60">{POWERUP_INFO[lastPickup.type].effect}</p>
          </div>
        </div>
      )}

      {/* Vitals + stats */}
      <div className="absolute bottom-6 left-1/2 w-72 -translate-x-1/2">
        <div className="mb-1 flex items-center justify-between text-white/70">
          <span className="flex items-center gap-1.5">
            <Heart className="size-3.5 text-red-400" />
            <span className="text-[11px] font-medium tracking-widest uppercase">Health</span>
          </span>
          <span className="font-mono text-[11px] text-white/60">
            {Math.ceil(health)} / {stats.maxHealth}
          </span>
        </div>
        <Progress
          value={healthPct}
          className="h-2.5 bg-white/10"
          indicatorClassName={healthPct < 30 ? "bg-red-600" : healthPct < 60 ? "bg-orange-500" : "bg-red-400"}
        />

        <div className="mt-2.5 mb-1 flex items-center justify-between text-white/70">
          <span className="flex items-center gap-1.5">
            <Zap className="size-3.5 text-emerald-300" />
            <span className="text-[11px] font-medium tracking-widest uppercase">Stamina</span>
          </span>
          <span className="font-mono text-[11px] text-white/60">
            {Math.floor(stamina)} / {stats.maxStamina}
          </span>
        </div>
        <Progress
          value={staminaPct}
          className="h-2 bg-white/10"
          indicatorClassName={
            staminaPct < 25 ? "bg-red-500" : staminaPct < 55 ? "bg-amber-400" : "bg-emerald-400"
          }
        />

        <div className="mt-3 flex items-center justify-center gap-2">
          <StatChip icon={<Gauge className="size-3.5" />} label="Speed" value={`×${stats.speed.toFixed(2)}`} color={POWERUP_INFO.speed.color} />
          <StatChip icon={<Shield className="size-3.5" />} label="Armor" value={`${stats.armor}%`} color={POWERUP_INFO.armor.color} />
        </div>
      </div>

      {/* Click-to-play prompt (also acts as pause). Keep it light so the
          forest stays visible underneath — a heavy veil looked like a crash. */}
      {paused && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/25">
          <div className="flex flex-col items-center gap-3 rounded-xl border bg-card/90 px-8 py-6 text-center backdrop-blur">
            <MousePointerClick className="size-8 text-primary" />
            <p className="text-lg font-semibold">Click to enter the forest</p>
            <p className="text-xs text-muted-foreground">
              WASD — move · Space — jump · Shift — sprint · Mouse — look · Esc — pause
            </p>
            <p className="text-[11px] text-muted-foreground/80">
              Glowing pickups raise your stats. Three biomes, three kinds of safe house.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function StatChip({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="flex items-center gap-1.5 rounded-md border border-border/60 bg-black/55 px-2.5 py-1 backdrop-blur-sm">
      <span style={{ color }}>{icon}</span>
      <span className="text-[10px] tracking-widest text-white/55 uppercase">{label}</span>
      <span className="font-mono text-xs text-white/90">{value}</span>
    </div>
  );
}

export function PowerupIcon({ type, className }: { type: keyof typeof POWERUP_INFO; className?: string }) {
  const color = POWERUP_INFO[type].color;
  const style = { color };
  switch (type) {
    case "health":
      return <Heart className={className} style={style} />;
    case "speed":
      return <Gauge className={className} style={style} />;
    case "stamina":
      return <Zap className={className} style={style} />;
    case "armor":
      return <Shield className={className} style={style} />;
  }
}
