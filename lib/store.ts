import { create } from "zustand";
import { clearCombat } from "@/lib/combat";
import {
  BOSSES,
  FRAGMENT_LEVEL_COST,
  MAX_CORRUPTION,
  MODIFIERS,
  RARITY_WEIGHT,
  SKILLS,
  bossForBiome,
  modifierFits,
  nextBoss,
  type BossId,
  type FuseKind,
  type ModifierId,
  type RelicId,
  type SkillId,
} from "@/lib/gameData";
import {
  TALISMAN_COUNT,
  generatePowerLoot,
  generatePowerups,
  type Biome,
  type PowerLootPlacement,
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

export interface PowerToast {
  id: string;
  title: string;
  detail: string;
  color: string;
  linger?: boolean;
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
  powerLoot: PowerLootPlacement[];
  lootTaken: string[];
  fragments: number;
  unlockedSkills: SkillId[];
  skillLevels: Partial<Record<SkillId, number>>;
  ownedModifiers: ModifierId[];
  loadout: Partial<Record<SkillId, ModifierId[]>>;
  activeSkill: SkillId;
  keys: Record<Biome, boolean[]>;
  relics: RelicId[];
  modifierSlots: number;
  corruption: number;
  bossesDefeated: BossId[];
  arenasOpened: BossId[];
  skillMenuOpen: boolean;
  lastPowerToast: PowerToast | null;
  setCharacter: (character: Character) => void;
  start: () => void;
  collect: (index: number) => void;
  takePowerup: (index: number) => void;
  takeLoot: (id: string) => void;
  setActiveSkill: (id: SkillId) => void;
  slotModifier: (skill: SkillId, modifier: ModifierId) => void;
  levelSkill: (id: SkillId) => void;
  fuseAtAltar: () => boolean;
  fuseRecipe: (kind: FuseKind) => boolean;
  enterArena: (id: BossId) => void;
  setSkillMenuOpen: (open: boolean) => void;
  defeatBoss: (id: BossId) => void;
  addCorruption: (amount: number) => void;
  decayCorruption: (amount: number) => void;
  die: () => void;
  win: () => void;
  toMenu: () => void;
}

const EMPTY_KEYS = (): Record<Biome, boolean[]> => ({
  forest: [false, false, false],
  swamp: [false, false, false],
  graveyard: [false, false, false],
});

export function emptyLoadout(): Partial<Record<SkillId, ModifierId[]>> {
  return { arrow: [] };
}

/** Temporary testing kit: every skill and modifier from the first click. */
const TESTING_UNLOCK_ALL = true;

function testingKit(): Pick<
  GameState,
  | "unlockedSkills"
  | "skillLevels"
  | "ownedModifiers"
  | "loadout"
  | "activeSkill"
  | "modifierSlots"
  | "relics"
  | "fragments"
> {
  const unlockedSkills = Object.keys(SKILLS) as SkillId[];
  const skillLevels: Partial<Record<SkillId, number>> = {};
  const loadout: Partial<Record<SkillId, ModifierId[]>> = {};
  for (const id of unlockedSkills) {
    skillLevels[id] = 1;
    loadout[id] = [];
  }
  return {
    unlockedSkills,
    skillLevels,
    ownedModifiers: Object.keys(MODIFIERS) as ModifierId[],
    loadout,
    activeSkill: "arrow",
    modifierSlots: 3,
    relics: ["slotII", "slotIII", "mastery"],
    fragments: 80,
  };
}

export function computePowerScore(state: {
  unlockedSkills: SkillId[];
  skillLevels: Partial<Record<SkillId, number>>;
  ownedModifiers: ModifierId[];
  fragments: number;
  relics: RelicId[];
  collected: number[];
}): number {
  let score = 0;
  for (const id of state.unlockedSkills) {
    score += (state.skillLevels[id] ?? 1) * 8;
  }
  for (const id of state.ownedModifiers) {
    const def = MODIFIERS[id];
    if (def) score += RARITY_WEIGHT[def.rarity];
  }
  score += state.fragments * 0.45;
  score += state.relics.length * 14;
  score += state.collected.length * 4;
  return Math.floor(score);
}

export function canOpenBoss(state: GameState, bossId: BossId): boolean {
  const def = BOSSES[bossId];
  const keys = state.keys[def.biome];
  const hasKeys = keys.every(Boolean);
  const previous = nextBoss(state.bossesDefeated);
  if (previous !== bossId) return false;
  return hasKeys && computePowerScore(state) >= def.threshold;
}

/** Door stays open after the first entry even though the keys are spent. */
export function canPassArena(state: GameState, bossId: BossId): boolean {
  if (state.arenasOpened.includes(bossId) || state.bossesDefeated.includes(bossId)) return true;
  return canOpenBoss(state, bossId);
}

function fuseShadowArrow(state: GameState): Partial<GameState> | null {
  const skills = state.unlockedSkills;
  if (!skills.includes("arrow") || !skills.includes("shadowBlade") || skills.includes("shadowArrow")) {
    return null;
  }
  return {
    unlockedSkills: [...skills.filter((s) => s !== "arrow" && s !== "shadowBlade"), "shadowArrow"],
    skillLevels: { ...state.skillLevels, shadowArrow: 1 },
    loadout: { ...state.loadout, shadowArrow: ["piercing"] },
    activeSkill: "shadowArrow",
    lastPowerToast: {
      id: "fuse-shadow-arrow",
      title: "Shadow Arrow",
      detail: "Arrow and blade, consumed.",
      color: "#c8b8ff",
    },
  };
}

function fuseVolleyBurst(state: GameState): Partial<GameState> | null {
  if (
    !state.ownedModifiers.includes("multishot") ||
    !state.ownedModifiers.includes("supershot") ||
    state.ownedModifiers.includes("volleyBurst")
  ) {
    return null;
  }
  const loadout: Partial<Record<SkillId, ModifierId[]>> = { ...state.loadout };
  for (const id of state.unlockedSkills) {
    const list = loadout[id];
    if (!list) continue;
    loadout[id] = list.filter((m) => m !== "multishot" && m !== "supershot");
  }
  return {
    ownedModifiers: [
      ...state.ownedModifiers.filter((m) => m !== "multishot" && m !== "supershot"),
      "volleyBurst",
    ],
    loadout,
    lastPowerToast: {
      id: "fuse-volley",
      title: "Volley Burst",
      detail: "Multishot and Supershot, consumed.",
      color: "#c084fc",
    },
  };
}

export const useGameStore = create<GameState>((set, get) => ({
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
  powerLoot: [],
  lootTaken: [],
  ...(TESTING_UNLOCK_ALL
    ? testingKit()
    : {
        fragments: 0,
        unlockedSkills: ["arrow"] as SkillId[],
        skillLevels: { arrow: 1 },
        ownedModifiers: [] as ModifierId[],
        loadout: emptyLoadout(),
        activeSkill: "arrow" as SkillId,
        relics: [] as RelicId[],
        modifierSlots: 1,
      }),
  keys: EMPTY_KEYS(),
  corruption: 0,
  bossesDefeated: [],
  arenasOpened: [],
  skillMenuOpen: false,
  lastPowerToast: null,
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
        powerLoot: generatePowerLoot(session + Date.now()),
        lootTaken: [],
        ...(TESTING_UNLOCK_ALL
          ? testingKit()
          : {
              fragments: 0,
              unlockedSkills: ["arrow"] as SkillId[],
              skillLevels: { arrow: 1 },
              ownedModifiers: [] as ModifierId[],
              loadout: emptyLoadout(),
              activeSkill: "arrow" as SkillId,
              relics: [] as RelicId[],
              modifierSlots: 1,
            }),
        keys: EMPTY_KEYS(),
        corruption: 0,
        bossesDefeated: [],
        arenasOpened: [],
        skillMenuOpen: false,
        lastPowerToast: null,
      };
    }),
  collect: (index) =>
    set((state) => {
      if (state.collected.includes(index)) return state;
      const collected = [...state.collected, index];
      return {
        collected,
        fragments: state.fragments + 8,
        lastPowerToast: {
          id: `tal-${index}`,
          title: "Talisman",
          detail: "+8 fragments",
          color: "#c084fc",
        },
      };
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
  takeLoot: (id) =>
    set((state) => {
      if (state.lootTaken.includes(id)) return state;
      const loot = state.powerLoot.find((item) => item.id === id);
      if (!loot) return state;
      const lootTaken = [...state.lootTaken, id];
      const next: Partial<GameState> = { lootTaken };
      if (loot.kind === "fragment") {
        next.fragments = state.fragments + 3;
        next.lastPowerToast = { id, title: "Fragment", detail: "+3 fragments", color: "#e8dcc0" };
      } else if (loot.kind === "skillShard" && loot.skillId) {
        const skill = loot.skillId as SkillId;
        if (!SKILLS[skill]) return state;
        if (state.unlockedSkills.includes(skill)) {
          const level = Math.min(SKILLS[skill].maxLevel, (state.skillLevels[skill] ?? 1) + 1);
          next.skillLevels = { ...state.skillLevels, [skill]: level };
          next.lastPowerToast = {
            id,
            title: SKILLS[skill].name,
            detail: `Level ${level}`,
            color: SKILLS[skill].color,
          };
        } else {
          next.unlockedSkills = [...state.unlockedSkills, skill];
          next.skillLevels = { ...state.skillLevels, [skill]: 1 };
          next.loadout = { ...state.loadout, [skill]: [] };
          next.lastPowerToast = {
            id,
            title: SKILLS[skill].name,
            detail: "Skill unlocked",
            color: SKILLS[skill].color,
          };
        }
      } else if (loot.kind === "modifier" && loot.modifierId) {
        const mod = loot.modifierId as ModifierId;
        if (!MODIFIERS[mod] || state.ownedModifiers.includes(mod)) return { ...state, lootTaken };
        next.ownedModifiers = [...state.ownedModifiers, mod];
        next.lastPowerToast = {
          id,
          title: MODIFIERS[mod].name,
          detail: MODIFIERS[mod].summary,
          color: MODIFIERS[mod].rarity === "cursed" ? "#ff3a3a" : MODIFIERS[mod].rarity === "rare" ? "#c084fc" : "#5aa8ff",
        };
      } else if (loot.kind === "keyPiece" && loot.keyIndex !== undefined) {
        const keys = {
          forest: [...state.keys.forest],
          swamp: [...state.keys.swamp],
          graveyard: [...state.keys.graveyard],
        };
        keys[loot.biome][loot.keyIndex] = true;
        next.keys = keys;
        const held = keys[loot.biome].filter(Boolean).length;
        const bossId = bossForBiome(loot.biome);
        const current = nextBoss(state.bossesDefeated);
        if (held === 3 && bossId && current === bossId) {
          const ready = computePowerScore(state) >= BOSSES[bossId].threshold;
          next.lastPowerToast = {
            id: `keys-ready-${loot.biome}`,
            title: ready ? "You can fight the boss" : "All keys gathered",
            detail: ready
              ? `Enter the portal and fight ${BOSSES[bossId].name}. The three keys will be spent, but the way stays open.`
              : `You hold all three keys. Raise Power to ${BOSSES[bossId].threshold}, then step through the portal to fight ${BOSSES[bossId].name}.`,
            color: "#ffd34d",
            linger: true,
          };
        } else {
          next.lastPowerToast = {
            id,
            title: "Boss Key",
            detail: `${held} / 3 ${loot.biome} pieces`,
            color: "#ffd34d",
          };
        }
      } else if (loot.kind === "cursedRelic") {
        const mod = (loot.modifierId as ModifierId) ?? "cursedSupershot";
        next.ownedModifiers = state.ownedModifiers.includes(mod)
          ? state.ownedModifiers
          : [...state.ownedModifiers, mod];
        next.corruption = Math.min(MAX_CORRUPTION, state.corruption + 18);
        runtime.corruption = next.corruption;
        next.lastPowerToast = {
          id,
          title: "Cursed Relic",
          detail: "Power, at a price.",
          color: "#ff3a3a",
        };
      }
      return next;
    }),
  setActiveSkill: (id) =>
    set((state) => (state.unlockedSkills.includes(id) ? { activeSkill: id } : state)),
  slotModifier: (skill, modifier) =>
    set((state) => {
      if (!state.unlockedSkills.includes(skill) || !state.ownedModifiers.includes(modifier)) return state;
      const skillDef = SKILLS[skill];
      const modDef = MODIFIERS[modifier];
      if (!skillDef || !modDef || !modifierFits(modDef, skillDef)) return state;
      const loadout: Partial<Record<SkillId, ModifierId[]>> = { ...state.loadout };
      const onThis = [...(loadout[skill] ?? [])];
      if (onThis.includes(modifier)) {
        loadout[skill] = onThis.filter((m) => m !== modifier);
        return { loadout };
      }
      for (const id of state.unlockedSkills) {
        const list = loadout[id];
        if (list?.includes(modifier)) {
          loadout[id] = list.filter((m) => m !== modifier);
        }
      }
      const next = [...(loadout[skill] ?? [])];
      if (next.length >= state.modifierSlots) next.shift();
      next.push(modifier);
      loadout[skill] = next;
      return { loadout };
    }),
  levelSkill: (id) =>
    set((state) => {
      const def = SKILLS[id];
      if (!def || !state.unlockedSkills.includes(id)) return state;
      const level = state.skillLevels[id] ?? 1;
      if (level >= def.maxLevel || state.fragments < FRAGMENT_LEVEL_COST) return state;
      return {
        fragments: state.fragments - FRAGMENT_LEVEL_COST,
        skillLevels: { ...state.skillLevels, [id]: level + 1 },
        lastPowerToast: {
          id: `lvl-${id}-${level + 1}`,
          title: def.name,
          detail: `Level ${level + 1}`,
          color: def.color,
        },
      };
    }),
  fuseAtAltar: () => {
    const state = get();
    const shadow = fuseShadowArrow(state);
    if (shadow) {
      set(shadow);
      return true;
    }
    const volley = fuseVolleyBurst(state);
    if (volley) {
      set(volley);
      return true;
    }
    return false;
  },
  fuseRecipe: (kind) => {
    const state = get();
    const patch = kind === "shadowArrow" ? fuseShadowArrow(state) : fuseVolleyBurst(state);
    if (!patch) return false;
    set(patch);
    return true;
  },
  enterArena: (id) =>
    set((state) => {
      if (state.arenasOpened.includes(id) || state.bossesDefeated.includes(id)) return state;
      if (!canOpenBoss(state, id)) return state;
      const biome = BOSSES[id].biome;
      return {
        arenasOpened: [...state.arenasOpened, id],
        keys: {
          forest: [...state.keys.forest],
          swamp: [...state.keys.swamp],
          graveyard: [...state.keys.graveyard],
          [biome]: [false, false, false],
        },
        lastPowerToast: {
          id: `enter-${id}`,
          title: "The portal takes the keys",
          detail: "The door stays unlocked. The boss waits inside.",
          color: "#7ad0ff",
          linger: true,
        },
      };
    }),
  setSkillMenuOpen: (open) => set({ skillMenuOpen: open }),
  defeatBoss: (id) =>
    set((state) => {
      if (state.bossesDefeated.includes(id)) return state;
      const bossesDefeated = [...state.bossesDefeated, id];
      const relic = BOSSES[id].relic;
      const relics = state.relics.includes(relic) ? state.relics : [...state.relics, relic];
      let modifierSlots = state.modifierSlots;
      if (relic === "slotII") modifierSlots = Math.max(modifierSlots, 2);
      if (relic === "slotIII") modifierSlots = Math.max(modifierSlots, 3);
      const allDown = bossesDefeated.length >= 3;
      return {
        bossesDefeated,
        relics,
        modifierSlots,
        gateOpen: allDown,
        lastPowerToast: {
          id: `boss-${id}`,
          title: `${BOSSES[id].name} falls`,
          detail: allDown ? "The north gate unseals." : "A relic settles in your bones.",
          color: "#ffd34d",
        },
      };
    }),
  addCorruption: (amount) =>
    set((state) => {
      const corruption = Math.min(MAX_CORRUPTION, state.corruption + amount);
      runtime.corruption = corruption;
      return { corruption };
    }),
  decayCorruption: (amount) =>
    set((state) => {
      const corruption = Math.max(0, state.corruption - amount);
      runtime.corruption = corruption;
      return { corruption };
    }),
  die: () => set({ phase: "dead", skillMenuOpen: false }),
  win: () => set({ phase: "won", skillMenuOpen: false }),
  toMenu: () => set({ phase: "menu", skillMenuOpen: false }),
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
  playerY: 0,
  playerZ: 0,
  playerSafe: false,
  biome: "forest" as Biome,
  monsterMood: "stalk" as MonsterMood,
  monsterDistance: 999,
  /** True until the player clicks into the forest (or after Esc). */
  paused: true,
  /** True once the player has focused the forest at least once this session. */
  hadFocus: false,
  /** Holding RMB — Valheim-style free look. */
  looking: false,
  /** Cursor NDC for aiming (−1…1). */
  aimNdcX: 0,
  aimNdcY: 0,
  /** Screen-pixel cursor for the HUD reticle. */
  cursorX: 0,
  cursorY: 0,
  /** World yaw the body faces while firing (horizontal part of the reticle ray). */
  aimYaw: 0,
  /** Camera ray through the reticle (origin + direction). */
  aimOx: 0,
  aimOy: 1.2,
  aimOz: 4,
  aimDx: 0,
  aimDy: 0,
  aimDz: -1,
  /** Closest world hit along the reticle (tree, house, ground, or far sky). */
  aimX: 0,
  aimY: 0.72,
  aimZ: -1,
  flashlightOn: true,
  fireHeld: false,
  fireClicked: false,
  charge: 0,
  wardUntil: 0,
  /** Seconds of Ward remaining. */
  wardLeft: 0,
  /** Full Ward duration when it was cast. */
  wardMax: 0,
  corruption: 0,
  bossId: null as BossId | null,
  bossX: 0,
  bossZ: 0,
  bossHealth: 0,
  bossMaxHealth: 0,
  bossArmored: false,
  bossAlive: false,
  bossHitFlash: 0,
  inArena: false,
  nearAltarId: null as string | null,
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
  runtime.playerY = 0;
  runtime.playerZ = 0;
  runtime.playerSafe = false;
  runtime.biome = "forest";
  runtime.monsterMood = "stalk";
  runtime.monsterDistance = 999;
  runtime.paused = true;
  runtime.hadFocus = false;
  runtime.looking = false;
  runtime.aimNdcX = 0;
  runtime.aimNdcY = 0;
  runtime.cursorX = 0;
  runtime.cursorY = 0;
  runtime.aimYaw = 0;
  runtime.aimOx = 0;
  runtime.aimOy = 1.2;
  runtime.aimOz = 4;
  runtime.aimDx = 0;
  runtime.aimDy = 0;
  runtime.aimDz = -1;
  runtime.aimX = 0;
  runtime.aimY = 0.72;
  runtime.aimZ = -1;
  runtime.flashlightOn = true;
  runtime.fireHeld = false;
  runtime.fireClicked = false;
  runtime.charge = 0;
  runtime.wardUntil = 0;
  runtime.wardLeft = 0;
  runtime.wardMax = 0;
  runtime.corruption = 0;
  runtime.bossId = null;
  runtime.bossX = 0;
  runtime.bossZ = 0;
  runtime.bossHealth = 0;
  runtime.bossMaxHealth = 0;
  runtime.bossArmored = false;
  runtime.bossAlive = false;
  runtime.bossHitFlash = 0;
  runtime.inArena = false;
  runtime.nearAltarId = null;
  clearCombat();
}
