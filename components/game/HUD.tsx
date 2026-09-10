"use client";

import { useEffect, useRef, useState } from "react";
import {
  Droplets,
  Eye,
  Flame,
  Gauge,
  Heart,
  Home,
  KeyRound,
  MousePointerClick,
  Shield,
  Skull,
  Sparkles,
  TreePine,
  Zap,
} from "lucide-react";
import { SkillBench } from "@/components/game/SkillBench";
import { Progress } from "@/components/ui/progress";
import { BOSSES, SKILLS, nextBoss, type SkillId } from "@/lib/gameData";
import { POWERUP_INFO, computePowerScore, runtime, useGameStore } from "@/lib/store";
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
  const lastPower = useGameStore((s) => s.lastPowerToast);
  const fragments = useGameStore((s) => s.fragments);
  const keys = useGameStore((s) => s.keys);
  const unlockedSkills = useGameStore((s) => s.unlockedSkills);
  const activeSkill = useGameStore((s) => s.activeSkill);
  const skillLevels = useGameStore((s) => s.skillLevels);
  const loadout = useGameStore((s) => s.loadout);
  const bossesDefeated = useGameStore((s) => s.bossesDefeated);
  const arenasOpened = useGameStore((s) => s.arenasOpened);
  const skillMenuOpen = useGameStore((s) => s.skillMenuOpen);
  const powerScore = useGameStore((s) => computePowerScore(s));

  const [health, setHealth] = useState(100);
  const [stamina, setStamina] = useState(100);
  const [fear, setFear] = useState(0);
  const [hitFlash, setHitFlash] = useState(0);
  const [hunted, setHunted] = useState(false);
  const [safe, setSafe] = useState(false);
  const [paused, setPaused] = useState(true);
  const [biome, setBiome] = useState<Biome>("forest");
  const [expiredToastId, setExpiredToastId] = useState<number | null>(null);
  const [expiredPower, setExpiredPower] = useState<string | null>(null);
  const [corruption, setCorruption] = useState(0);
  const [bossHp, setBossHp] = useState(0);
  const [bossMax, setBossMax] = useState(0);
  const [bossName, setBossName] = useState("");
  const [armored, setArmored] = useState(false);
  const [inFight, setInFight] = useState(false);
  const [nearAltar, setNearAltar] = useState(false);
  const [yaw, setYaw] = useState(0);

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
      setCorruption(runtime.corruption);
      setBossHp(runtime.bossHealth);
      setBossMax(runtime.bossMaxHealth);
      setArmored(runtime.bossArmored);
      setInFight(runtime.inArena && runtime.bossAlive);
      setBossName(runtime.bossId ? BOSSES[runtime.bossId].name : "");
      setNearAltar(runtime.nearAltarId !== null);
      setYaw(runtime.camYaw);
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

  useEffect(() => {
    if (!lastPower) return;
    const id = lastPower.id;
    const timer = setTimeout(() => setExpiredPower(id), lastPower.linger ? 5600 : 2800);
    return () => clearTimeout(timer);
  }, [lastPower]);
  const powerVisible = lastPower !== null && expiredPower !== lastPower.id;

  const current = nextBoss(bossesDefeated);
  const currentDef = current ? BOSSES[current] : null;
  const keyBits = currentDef ? keys[currentDef.biome] : [false, false, false];
  const portalOpen = current ? arenasOpened.includes(current) : false;

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

      {corruption > 8 && (
        <div
          className="absolute inset-0"
          style={{
            opacity: Math.min(0.55, corruption / 140),
            background:
              "radial-gradient(ellipse at center, transparent 40%, rgba(80,0,0,0.75) 100%)",
            mixBlendMode: "multiply",
          }}
        />
      )}

      {/* Objective + power */}
      <div className="absolute top-4 left-4 flex flex-col gap-2">
        <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-black/55 px-3 py-2 backdrop-blur-sm">
          <Sparkles className="size-4 text-purple-400" />
          <span className="font-mono text-sm tracking-widest text-purple-100">
            {collected} / {total}
          </span>
          <span className="text-[10px] tracking-widest text-white/40 uppercase">Talismans</span>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-black/55 px-3 py-2 backdrop-blur-sm">
          <Zap className="size-4 text-amber-300" />
          <span className="font-mono text-sm text-amber-100">
            {powerScore}
            {currentDef ? ` / ${currentDef.threshold}` : ""}
          </span>
          <span className="text-[10px] tracking-widest text-white/40 uppercase">Power</span>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-black/55 px-3 py-2 backdrop-blur-sm">
          <KeyRound className="size-4 text-yellow-300" />
          <span className="font-mono text-sm text-yellow-100">
            {portalOpen ? "Open" : `${keyBits.filter(Boolean).length} / 3`}
          </span>
          <span className="text-[10px] tracking-widest text-white/40 uppercase">
            {portalOpen ? "Portal" : currentDef ? `${currentDef.biome} keys` : "Keys"}
          </span>
        </div>
        <p className="max-w-64 text-xs text-white/60">
          {gateOpen ? (
            <span className="font-semibold text-sky-300">The north gate is open. Run.</span>
          ) : currentDef ? (
            <>
              Hunt {currentDef.name} in the {BIOME_INFO[currentDef.biome].name}. Three keys and Power{" "}
              {currentDef.threshold} open its portal. Tab opens the skill bench.
            </>
          ) : (
            "The Hollow One is down. The gate waits north."
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

      {inFight && (
        <div className="absolute top-16 left-1/2 w-80 -translate-x-1/2">
          <p className="mb-1 text-center text-[11px] font-bold tracking-[0.25em] text-red-200 uppercase">
            {bossName}
            {armored ? " — armored" : ""}
          </p>
          <Progress
            value={bossMax > 0 ? (bossHp / bossMax) * 100 : 0}
            className="h-2.5 bg-white/10"
            indicatorClassName={armored ? "bg-zinc-400" : "bg-red-500"}
          />
        </div>
      )}

      {lastPower && (
        <div
          key={lastPower.id}
          className={cn(
            "absolute top-[22%] left-1/2 -translate-x-1/2 rounded-xl border bg-black/75 px-5 py-3 text-center backdrop-blur-md transition-opacity duration-500",
            lastPower.linger ? "max-w-md px-7 py-4" : "",
            powerVisible ? "opacity-100 animate-in fade-in zoom-in-95" : "opacity-0"
          )}
          style={{ borderColor: `${lastPower.color}80` }}
        >
          <p className="text-sm font-bold tracking-[0.18em] uppercase" style={{ color: lastPower.color }}>
            {lastPower.title}
          </p>
          <p className="text-xs text-white/60">{lastPower.detail}</p>
        </div>
      )}

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

        <div className="mt-2.5 mb-1 flex items-center justify-between text-white/70">
          <span className="flex items-center gap-1.5">
            <Flame className="size-3.5 text-red-400" />
            <span className="text-[11px] font-medium tracking-widest uppercase">Corruption</span>
          </span>
          <span className="font-mono text-[11px] text-white/60">{Math.floor(corruption)}</span>
        </div>
        <Progress
          value={corruption}
          className="h-1.5 bg-white/10"
          indicatorClassName={corruption >= 50 ? "bg-red-600" : "bg-rose-800"}
        />

        <div className="mt-3 flex items-center justify-center gap-2">
          <StatChip icon={<Gauge className="size-3.5" />} label="Speed" value={`×${stats.speed.toFixed(2)}`} color={POWERUP_INFO.speed.color} />
          <StatChip icon={<Shield className="size-3.5" />} label="Armor" value={`${stats.armor}%`} color={POWERUP_INFO.armor.color} />
          <StatChip icon={<Sparkles className="size-3.5" />} label="Frags" value={`${fragments}`} color="#e8dcc0" />
        </div>

        <div className="pointer-events-none mt-3 flex justify-center gap-1.5">
          {unlockedSkills.map((id, i) => (
            <SkillChip key={id} id={id} index={i} active={id === activeSkill} level={skillLevels[id] ?? 1} slotted={loadout[id]?.length ?? 0} />
          ))}
        </div>
        {nearAltar && (
          <p className="mt-2 text-center text-[11px] text-violet-200">F — fuse at the shrine</p>
        )}
        <p className="mt-1 text-center text-[10px] tracking-widest text-white/35 uppercase">
          Tab — skills · V — light · RMB — look
        </p>
      </div>

      <Compass yaw={yaw} />

      {!paused && !skillMenuOpen && <AimCursor />}

      {paused && !skillMenuOpen && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/25">
          <div className="pointer-events-auto flex flex-col items-center gap-3 rounded-xl border bg-card/90 px-8 py-6 text-center backdrop-blur">
            <MousePointerClick className="size-8 text-primary" />
            <p className="text-lg font-semibold">Click to enter the forest</p>
            <p className="text-xs text-muted-foreground">
              WASD — move · Hold RMB — look · LMB — aim &amp; fire · V — flashlight · Tab — skills
            </p>
            <p className="text-[11px] text-muted-foreground/80">
              Aim with the free cursor. Esc pauses. Three keys open a boss portal when Power is high enough.
            </p>
          </div>
        </div>
      )}

      {skillMenuOpen && <SkillBench />}
    </div>
  );
}

/** Bone-needle reticle — follows the mouse immediately (no React / 100ms HUD lag). */
function AimCursor() {
  const root = useRef<HTMLDivElement>(null);
  const dot = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const paint = () => {
      const el = root.current;
      if (!el) return;
      const looking = runtime.looking;
      el.style.transform = `translate3d(${runtime.cursorX}px, ${runtime.cursorY}px, 0) translate(-50%, -50%)`;
      el.style.opacity = looking ? "0.45" : "1";
      if (dot.current) {
        dot.current.style.background = looking ? "#9ab0c8" : "#ffc56a";
        dot.current.style.boxShadow = looking
          ? "0 0 6px rgba(150,180,210,0.45)"
          : "0 0 10px rgba(255,180,80,0.7)";
      }
    };

    // Mouse events keep the reticle 1:1 with the OS cursor; rAF covers RMB-look opacity.
    window.addEventListener("mousemove", paint, { passive: true });
    let frame = 0;
    const tick = () => {
      paint();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("mousemove", paint);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div
      ref={root}
      className="pointer-events-none absolute top-0 left-0 z-40 will-change-transform"
      style={{ transform: "translate3d(-100px, -100px, 0) translate(-50%, -50%)" }}
    >
      <div className="relative size-9">
        <span className="absolute top-0 left-1/2 h-2.5 w-px -translate-x-1/2 bg-[#e8dcc0]" />
        <span className="absolute bottom-0 left-1/2 h-2.5 w-px -translate-x-1/2 bg-[#e8dcc0]" />
        <span className="absolute top-1/2 left-0 h-px w-2.5 -translate-y-1/2 bg-[#e8dcc0]" />
        <span className="absolute top-1/2 right-0 h-px w-2.5 -translate-y-1/2 bg-[#e8dcc0]" />
        <span
          ref={dot}
          className="absolute top-1/2 left-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#ffc56a]"
          style={{ boxShadow: "0 0 10px rgba(255,180,80,0.7)" }}
        />
        <span className="absolute inset-0 rounded-full border border-[#e8dcc0]/40" />
      </div>
    </div>
  );
}

/** World north is −Z (the escape gate). Letters orbit; the red tick is look direction. */
function Compass({ yaw }: { yaw: number }) {
  const marks = [
    { label: "N", angle: 0, color: "#ff5a5a" },
    { label: "E", angle: 90, color: "#e8e4d8" },
    { label: "S", angle: 180, color: "#e8e4d8" },
    { label: "W", angle: 270, color: "#e8e4d8" },
  ];
  const radius = 28;
  return (
    <div className="absolute right-5 bottom-6 flex flex-col items-center gap-1">
      <div className="relative size-20 rounded-full border border-white/20 bg-black/60 shadow-[0_0_20px_rgba(0,0,0,0.55)] backdrop-blur-sm">
        {marks.map((m) => {
          const rad = (m.angle * Math.PI) / 180 - yaw;
          const x = Math.sin(rad) * radius;
          const y = -Math.cos(rad) * radius;
          return (
            <span
              key={m.label}
              className="absolute top-1/2 left-1/2 text-[10px] font-bold tracking-widest"
              style={{
                color: m.color,
                transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`,
              }}
            >
              {m.label}
            </span>
          );
        })}
        <div className="absolute top-1/2 left-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/40 bg-white/15" />
        <div className="absolute top-2 left-1/2 h-5 w-0.5 -translate-x-1/2 rounded-full bg-red-400" />
        <div className="absolute top-[38px] left-1/2 h-3.5 w-0.5 -translate-x-1/2 rounded-full bg-white/35" />
      </div>
      <span className="text-[9px] tracking-[0.25em] text-white/40 uppercase">North</span>
    </div>
  );
}

function SkillChip({
  id,
  index,
  active,
  level,
  slotted,
}: {
  id: SkillId;
  index: number;
  active: boolean;
  level: number;
  slotted: number;
}) {
  const def = SKILLS[id];
  return (
    <div
      className={cn(
        "flex h-11 w-11 flex-col items-center justify-center rounded-md border bg-black/60",
        active ? "border-white/70" : "border-border/50"
      )}
      style={{ boxShadow: active ? `0 0 10px ${def.glow}` : undefined }}
    >
      <span className="text-[9px] font-bold tracking-widest" style={{ color: def.color }}>
        {index + 1}
      </span>
      <span className="text-[8px] text-white/70">{def.name.split(" ")[0]}</span>
      <span className="text-[8px] text-white/40">L{level}{slotted ? `·${slotted}` : ""}</span>
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
