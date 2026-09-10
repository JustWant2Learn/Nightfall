import type { Biome } from "@/lib/world-data";

export type SkillId =
  | "arrow"
  | "fireBolt"
  | "shadowBlade"
  | "ward"
  | "trap"
  | "pulse"
  | "shadowArrow";

export type ModifierId =
  | "multishot"
  | "supershot"
  | "homing"
  | "chain"
  | "piercing"
  | "explosive"
  | "ricochet"
  | "vampiric"
  | "split"
  | "volleyBurst"
  | "cursedSupershot";

export type Rarity = "common" | "uncommon" | "rare" | "cursed";
export type SkillType = "ranged" | "melee" | "defense" | "placed" | "burst";
export type BossId = "bear" | "ogre" | "hollow";
export type RelicId = "slotII" | "slotIII" | "mastery";

export interface SkillDef {
  id: SkillId;
  name: string;
  type: SkillType;
  baseDamage: number;
  cooldown: number;
  maxLevel: number;
  slots: number;
  color: string;
  glow: string;
  summary: string;
}

export interface ModifierDef {
  id: ModifierId;
  name: string;
  rarity: Rarity;
  appliesTo: SkillType[] | "*";
  summary: string;
  corruptionCostPerUse: number;
  projectileCount?: number;
  spreadAngle?: number;
  chargeMultiplier?: number;
}

export interface BossDef {
  id: BossId;
  name: string;
  biome: Biome;
  threshold: number;
  keyCount: number;
  maxHealth: number;
  relic: RelicId;
  summary: string;
}

export const SKILLS: Record<SkillId, SkillDef> = {
  arrow: {
    id: "arrow",
    name: "Bone Arrow",
    type: "ranged",
    baseDamage: 11,
    cooldown: 0.55,
    maxLevel: 5,
    slots: 1,
    color: "#f4eee0",
    glow: "#e8dcc0",
    summary: "A thin pale bolt. Single-target, sharp.",
  },
  fireBolt: {
    id: "fireBolt",
    name: "Fire Bolt",
    type: "ranged",
    baseDamage: 9,
    cooldown: 0.85,
    maxLevel: 5,
    slots: 1,
    color: "#ff6a2a",
    glow: "#ff3a00",
    summary: "A roiling ember. Burns the ground it hits.",
  },
  shadowBlade: {
    id: "shadowBlade",
    name: "Shadow Blade",
    type: "melee",
    baseDamage: 16,
    cooldown: 0.42,
    maxLevel: 5,
    slots: 1,
    color: "#7a4cff",
    glow: "#4a1ad0",
    summary: "A short violet cut. Fast, close.",
  },
  ward: {
    id: "ward",
    name: "Ward",
    type: "defense",
    baseDamage: 0,
    cooldown: 7,
    maxLevel: 5,
    slots: 1,
    color: "#9be7ff",
    glow: "#5ad4ff",
    summary: "A glassy shell. Drinks the next few claws.",
  },
  trap: {
    id: "trap",
    name: "Hex Trap",
    type: "placed",
    baseDamage: 20,
    cooldown: 4.2,
    maxLevel: 5,
    slots: 1,
    color: "#86d04a",
    glow: "#5aaf20",
    summary: "A sickly glyph. Arms, then bites.",
  },
  pulse: {
    id: "pulse",
    name: "Pulse",
    type: "burst",
    baseDamage: 13,
    cooldown: 3.4,
    maxLevel: 5,
    slots: 1,
    color: "#8aa0b8",
    glow: "#6a88aa",
    summary: "A panic ring. Hits everything nearby.",
  },
  shadowArrow: {
    id: "shadowArrow",
    name: "Shadow Arrow",
    type: "ranged",
    baseDamage: 14,
    cooldown: 0.6,
    maxLevel: 5,
    slots: 2,
    color: "#c8b8ff",
    glow: "#8a6aff",
    summary: "Fused: pierces and blinds the mark for a breath.",
  },
};

export const MODIFIERS: Record<ModifierId, ModifierDef> = {
  multishot: {
    id: "multishot",
    name: "Multishot",
    rarity: "common",
    appliesTo: ["ranged"],
    summary: "Three bolts in a fan.",
    corruptionCostPerUse: 0,
    projectileCount: 3,
    spreadAngle: 16,
  },
  supershot: {
    id: "supershot",
    name: "Supershot",
    rarity: "uncommon",
    appliesTo: ["ranged", "melee", "burst"],
    summary: "Hold to charge a heavier hit.",
    corruptionCostPerUse: 0,
    chargeMultiplier: 2.4,
  },
  homing: {
    id: "homing",
    name: "Homing",
    rarity: "uncommon",
    appliesTo: ["ranged"],
    summary: "Curves toward the nearest horror.",
    corruptionCostPerUse: 0,
  },
  chain: {
    id: "chain",
    name: "Chain",
    rarity: "rare",
    appliesTo: ["ranged", "melee"],
    summary: "A second bite after the first lands.",
    corruptionCostPerUse: 0,
  },
  piercing: {
    id: "piercing",
    name: "Piercing",
    rarity: "uncommon",
    appliesTo: ["ranged"],
    summary: "Passes through hide and armor.",
    corruptionCostPerUse: 0,
  },
  explosive: {
    id: "explosive",
    name: "Explosive",
    rarity: "rare",
    appliesTo: ["ranged", "placed"],
    summary: "A burst on impact. Cracks armor.",
    corruptionCostPerUse: 0,
  },
  ricochet: {
    id: "ricochet",
    name: "Ricochet",
    rarity: "common",
    appliesTo: ["ranged"],
    summary: "Bounces once off the world edge.",
    corruptionCostPerUse: 0,
  },
  vampiric: {
    id: "vampiric",
    name: "Vampiric",
    rarity: "rare",
    appliesTo: "*",
    summary: "A little of their life becomes yours.",
    corruptionCostPerUse: 0,
  },
  split: {
    id: "split",
    name: "Split",
    rarity: "uncommon",
    appliesTo: ["ranged"],
    summary: "Breaks into two after the first hit.",
    corruptionCostPerUse: 0,
  },
  cursedSupershot: {
    id: "cursedSupershot",
    name: "Cursed Charge",
    rarity: "cursed",
    appliesTo: ["ranged", "melee"],
    summary: "A brutal charge. Each use feeds the rot.",
    corruptionCostPerUse: 4,
    chargeMultiplier: 3.6,
  },
  volleyBurst: {
    id: "volleyBurst",
    name: "Volley Burst",
    rarity: "rare",
    appliesTo: ["ranged"],
    summary: "Fused: charge, then a fan of heavy shots.",
    corruptionCostPerUse: 0,
    projectileCount: 5,
    spreadAngle: 22,
    chargeMultiplier: 1.8,
  },
};

export const BOSSES: Record<BossId, BossDef> = {
  bear: {
    id: "bear",
    name: "The Rotting Bear",
    biome: "forest",
    threshold: 40,
    keyCount: 3,
    maxHealth: 240,
    relic: "slotII",
    summary: "Hide like wet paper over a skull. Armor until Piercing or Explosive cracks it.",
  },
  ogre: {
    id: "ogre",
    name: "The Forest Ogre",
    biome: "swamp",
    threshold: 90,
    keyCount: 3,
    maxHealth: 340,
    relic: "slotIII",
    summary: "Horned and clubbed. High Corruption makes it furious — and exposes a weak point.",
  },
  hollow: {
    id: "hollow",
    name: "The Hollow One",
    biome: "graveyard",
    threshold: 140,
    keyCount: 3,
    maxHealth: 420,
    relic: "mastery",
    summary: "The tree-wraith that has always been waiting.",
  },
};

export const BOSS_ORDER: BossId[] = ["bear", "ogre", "hollow"];

export const RELICS: Record<RelicId, { name: string; summary: string }> = {
  slotII: { name: "Second Slot", summary: "Each skill can hold two modifiers." },
  slotIII: { name: "Third Slot", summary: "Each skill can hold three modifiers." },
  mastery: { name: "Hollow Mastery", summary: "All skills hit 12% harder." },
};

export const RARITY_COLOR: Record<Rarity, string> = {
  common: "#e8e4d8",
  uncommon: "#5aa8ff",
  rare: "#c084fc",
  cursed: "#ff3a3a",
};

export const RARITY_WEIGHT: Record<Rarity, number> = {
  common: 5,
  uncommon: 8,
  rare: 12,
  cursed: 18,
};

export const FRAGMENT_LEVEL_COST = 8;
export const CORRUPTION_TIER = 50;
export const MAX_CORRUPTION = 100;

export function modifierFits(mod: ModifierDef, skill: SkillDef): boolean {
  return mod.appliesTo === "*" || mod.appliesTo.includes(skill.type);
}

export function skillDamage(def: SkillDef, level: number, mastery: boolean, corrupted: boolean): number {
  const leveled = def.baseDamage + Math.max(0, level - 1) * 4;
  return leveled * (mastery ? 1.12 : 1) * (corrupted ? 1.2 : 1);
}

export function nextBoss(defeated: BossId[]): BossId | null {
  return BOSS_ORDER.find((id) => !defeated.includes(id)) ?? null;
}

export function biomeForBoss(id: BossId): Biome {
  return BOSSES[id].biome;
}

/** Later biomes' keys stay hidden until the previous boss is down. */
export function keyBiomeUnlocked(biome: Biome, defeated: BossId[]): boolean {
  const current = nextBoss(defeated);
  return current !== null && BOSSES[current].biome === biome;
}

export type FuseKind = "shadowArrow" | "volleyBurst";

export interface FuseRecipe {
  id: FuseKind;
  name: string;
  detail: string;
  color: string;
}

export const FUSE_RECIPES: FuseRecipe[] = [
  {
    id: "shadowArrow",
    name: "Shadow Arrow",
    detail: "Bone Arrow + Shadow Blade",
    color: "#c8b8ff",
  },
  {
    id: "volleyBurst",
    name: "Volley Burst",
    detail: "Multishot + Supershot",
    color: "#c084fc",
  },
];

export function recipeReady(
  kind: FuseKind,
  unlockedSkills: SkillId[],
  ownedModifiers: ModifierId[]
): boolean {
  if (kind === "shadowArrow") {
    return (
      unlockedSkills.includes("arrow") &&
      unlockedSkills.includes("shadowBlade") &&
      !unlockedSkills.includes("shadowArrow")
    );
  }
  return (
    ownedModifiers.includes("multishot") &&
    ownedModifiers.includes("supershot") &&
    !ownedModifiers.includes("volleyBurst")
  );
}

export function bossForBiome(biome: Biome): BossId | null {
  const found = BOSS_ORDER.find((id) => BOSSES[id].biome === biome);
  return found ?? null;
}
