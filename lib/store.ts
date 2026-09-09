import { create } from "zustand";
import {
  TALISMAN_COUNT,
  generatePowerups,
  type Biome,
  type PowerupPlacement,
  type PowerupType,
} from "@/lib/world-data";

export type Character = "girl" | "boy";
export type Phase = "menu" | "playing" | "dead" | "won";
export type MonsterMood = "stalk" | "hunt";

/** Survivor attributes. Health/stamina are maximums; the live values sit in `runtime`. */
export interface Stats {
  maxHealth: number;
  /** Movement multiplier (1 = base). */
  speed: number;
  maxStamina: number;
  /** Percentage of incoming damage absorbed (0–70). */
  armor: number;
}

export const BASE_STATS: Record<Character, Stats> = {
  girl: { maxHealth: 90, speed: 1.08, maxStamina: 110, armor: 0 },
  boy: { maxHealth: 110, speed: 1.0, maxStamina: 100, armor: 10 },
};

export const STAT_CAPS: Stats = { maxHealth: 180, speed: 1.55, maxStamina: 200, armor: 70 };

export const POWERUP_INFO: Record<
  PowerupType,
  { label: string; effect: string; color: string; glow: string }
> = {
  health: { label: "Vitality", effect: "+12 max health, heals 40", color: "#ff5a6a", glow: "#ff2a3a" },
  speed: { label: "Swiftness", effect: "+8% speed", color: "#ffd34d", glow: "#ffb400" },
  stamina: { label: "Endurance", effect: "+18 max stamina", color: "#5ce08a", glow: "#1ec25a" },
  armor: { label: "Ward", effect: "+9 armor", color: "#5aa8ff", glow: "#2a7cff" },
};

export interface PickupToast {
  id: number;
  type: PowerupType;
}

interface GameState {
  phase: Phase;
  character: Character;
  /** Bumped on every restart so the 3D scene fully remounts. */
  session: number;
  collected: number[];
  totalTalismans: number;
  gateOpen: boolean;
  stats: Stats;
  powerups: PowerupPlacement[];
  powerupsTaken: number[];
  lastPickup: PickupToast | null;
  setCharacter: (character: Character) => void;
  start: () => void;
  collect: (index: number) => void;
  takePowerup: (index: number) => void;
  die: () => void;
  win: () => void;
  toMenu: () => void;
}

export const useGameStore = create<GameState>((set) => ({
  phase: "menu",
  character: "girl",
  session: 0,
  collected: [],
  totalTalismans: TALISMAN_COUNT,
  gateOpen: false,
  stats: BASE_STATS.girl,
  powerups: [],
  powerupsTaken: [],
  lastPickup: null,
  setCharacter: (character) => set({ character }),
  start: () =>
    set((state) => {
      const session = state.session + 1;
      const stats = { ...BASE_STATS[state.character] };
      resetRuntime(stats);
      return {
        phase: "playing",
        session,
        collected: [],
        gateOpen: false,
        stats,
        powerups: generatePowerups(session + Date.now()),
        powerupsTaken: [],
        lastPickup: null,
      };
    }),
  collect: (index) =>
    set((state) => {
      if (state.collected.includes(index)) return state;
      const collected = [...state.collected, index];
      return { collected, gateOpen: collected.length >= state.totalTalismans };
    }),
  takePowerup: (index) =>
    set((state) => {
      if (state.powerupsTaken.includes(index)) return state;
      const powerup = state.powerups[index];
      if (!powerup) return state;
      const stats = applyPowerup(state.stats, powerup.type);
      return {
        stats,
        powerupsTaken: [...state.powerupsTaken, index],
        lastPickup: { id: index, type: powerup.type },
      };
    }),
  die: () => set({ phase: "dead" }),
  win: () => set({ phase: "won" }),
  toMenu: () => set({ phase: "menu" }),
}));

/** Applies a powerup to the stats and to the live runtime values. */
function applyPowerup(stats: Stats, type: PowerupType): Stats {
  const next = { ...stats };
  switch (type) {
    case "health":
      next.maxHealth = Math.min(STAT_CAPS.maxHealth, stats.maxHealth + 12);
      runtime.health = Math.min(next.maxHealth, runtime.health + 40);
      break;
    case "speed":
      next.speed = Math.min(STAT_CAPS.speed, +(stats.speed + 0.08).toFixed(2));
      break;
    case "stamina":
      next.maxStamina = Math.min(STAT_CAPS.maxStamina, stats.maxStamina + 18);
      runtime.stamina = Math.min(next.maxStamina, runtime.stamina + 35);
      break;
    case "armor":
      next.armor = Math.min(STAT_CAPS.armor, stats.armor + 9);
      break;
  }
  return next;
}

/**
 * Per-frame mutable values shared between the 3D loop and the HUD.
 * Kept outside zustand so 60fps updates never trigger React re-renders;
 * the HUD samples this object on a slow interval instead.
 */
export const runtime = {
  health: 100,
  stamina: 100,
  fear: 0,
  /** 1 right after taking a hit, decays to 0. Drives the red flash. */
  hitFlash: 0,
  sprinting: false,
  camYaw: 0,
  camPitch: 0.32,
  playerX: 0,
  playerZ: 0,
  playerSafe: false,
  biome: "forest" as Biome,
  monsterMood: "stalk" as MonsterMood,
  monsterDistance: 999,
  /** True until the player clicks into the forest (or after Esc). */
  paused: true,
  /** True once pointer lock has succeeded at least once this session. */
  hadPointerLock: false,
};

export function resetRuntime(stats: Stats = BASE_STATS.girl): void {
  runtime.health = stats.maxHealth;
  runtime.stamina = stats.maxStamina;
  runtime.fear = 0;
  runtime.hitFlash = 0;
  runtime.sprinting = false;
  runtime.camYaw = 0;
  runtime.camPitch = 0.32;
  runtime.playerX = 0;
  runtime.playerZ = 0;
  runtime.playerSafe = false;
  runtime.biome = "forest";
  runtime.monsterMood = "stalk";
  runtime.monsterDistance = 999;
  runtime.paused = true;
  runtime.hadPointerLock = false;
}
