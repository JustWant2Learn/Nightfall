/**
 * Deterministic world generation. Rendering and collision both read from
 * this module, so the visual forest and the physical forest always match.
 *
 * The map is split into three biomes, each with its own safe-house style:
 *   - Hollow Woods (south, spawn):     log cabins
 *   - Drowned Marsh (north-west):      stilt shacks
 *   - Ashen Graveyard (north-east):    stone crypts
 */

export const WORLD_HALF = 170;
export const GATE_POSITION = { x: 0, z: -164 };
export const MONSTER_SPAWN = { x: 72, z: 78 };
export const TALISMAN_COUNT = 7;

// House construction constants (declared before the generators that use them).
export const WALL_THICKNESS = 0.34;
/** Half the width of the door opening (a generous 2.2 m door). */
export const DOOR_HALF = 1.1;
export const DOOR_HEIGHT = 2.35;
/** How far the porch deck extends in front of the door wall. */
export const PORCH_DEPTH = 2.1;
/** Clear ground kept in front of each door. */
export const APPROACH_DEPTH = 9;

/* ------------------------------------------------------------------------ */
/* Biomes                                                                    */
/* ------------------------------------------------------------------------ */

export type Biome = "forest" | "swamp" | "graveyard";

export interface BiomeInfo {
  name: string;
  tagline: string;
  fog: string;
  ground: string;
  lamp: string;
}

export const BIOME_INFO: Record<Biome, BiomeInfo> = {
  forest: {
    name: "Hollow Woods",
    tagline: "Dead pines and lantern-lit cabins.",
    fog: "#0a101c",
    ground: "#7f8f68",
    lamp: "#ffc56a",
  },
  swamp: {
    name: "Drowned Marsh",
    tagline: "Stilt shacks above black water.",
    fog: "#0a1512",
    ground: "#56684a",
    lamp: "#a8e6a0",
  },
  graveyard: {
    name: "Ashen Graveyard",
    tagline: "Crypts among the crooked stones.",
    fog: "#131420",
    ground: "#767a80",
    lamp: "#9ab6ff",
  },
};

/** Wobbly borders so the biome edges are not straight lines. */
export function biomeAt(x: number, z: number): Biome {
  const border = -38 + Math.sin(x / 23) * 9;
  if (z > border) return "forest";
  const split = Math.sin(z / 19) * 9;
  return x < split ? "swamp" : "graveyard";
}

/* ------------------------------------------------------------------------ */
/* Types                                                                     */
/* ------------------------------------------------------------------------ */

export interface Placement {
  x: number;
  z: number;
  scale: number;
  rot: number;
}

export type HouseKind = "cabin" | "shack" | "crypt";

export interface HousePlacement {
  x: number;
  z: number;
  rot: number;
  scale: number;
  kind: HouseKind;
  biome: Biome;
  /** cabin: 0 cabin · 1 cottage · 2 ruined. shack/crypt: 0 small · 1 large */
  variant: 0 | 1 | 2;
  halfW: number;
  halfD: number;
  /** Height of the interior floor (and porch) above the ground. */
  floorY: number;
}

export type PowerupType = "health" | "speed" | "stamina" | "armor";

export interface PowerupPlacement {
  x: number;
  z: number;
  type: PowerupType;
}

export type PowerLootKind = "fragment" | "skillShard" | "modifier" | "keyPiece" | "cursedRelic";

export interface PowerLootPlacement {
  id: string;
  kind: PowerLootKind;
  x: number;
  z: number;
  biome: Biome;
  skillId?: string;
  modifierId?: string;
  keyIndex?: number;
}

export interface ArenaDef {
  bossId: "bear" | "ogre" | "hollow";
  x: number;
  z: number;
  radius: number;
  /** Facing toward spawn so the gate reads as an entrance. */
  rot: number;
}

export interface AltarPlacement {
  id: string;
  x: number;
  z: number;
  biome: Biome;
}

/* ------------------------------------------------------------------------ */
/* Helpers                                                                   */
/* ------------------------------------------------------------------------ */

/** mulberry32 — tiny seeded PRNG so the forest is identical every run. */
export function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20260908);

function tooClose(x: number, z: number, list: { x: number; z: number }[], minDist: number): boolean {
  return list.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < minDist * minDist);
}

function nearGatePath(x: number, z: number): boolean {
  return Math.abs(x - GATE_POSITION.x) < 4.2 && z < GATE_POSITION.z + 16;
}

function nearSpawn(x: number, z: number): boolean {
  return x * x + z * z < 11 * 11;
}

/** Ritual rings where the three bosses wait. Kept clear of trees and houses. */
export const BOSS_ARENAS: ArenaDef[] = [
  { bossId: "bear", x: 12, z: 102, radius: 16, rot: Math.atan2(-12, -102) },
  { bossId: "ogre", x: -95, z: -88, radius: 16, rot: Math.atan2(95, 88) },
  { bossId: "hollow", x: 95, z: -88, radius: 16, rot: Math.atan2(-95, 88) },
];

export const FUSION_ALTARS: AltarPlacement[] = [
  { id: "woods-shrine", x: -26, z: 44, biome: "forest" },
  { id: "marsh-shrine", x: -72, z: -52, biome: "swamp" },
];

export function nearBossArena(x: number, z: number, pad = 4): boolean {
  return BOSS_ARENAS.some((a) => (x - a.x) ** 2 + (z - a.z) ** 2 < (a.radius + pad) ** 2);
}

export function arenaAt(x: number, z: number): ArenaDef | null {
  return BOSS_ARENAS.find((a) => (x - a.x) ** 2 + (z - a.z) ** 2 < a.radius * a.radius) ?? null;
}

export function nearAltar(x: number, z: number, reach = 2.4): AltarPlacement | null {
  return FUSION_ALTARS.find((a) => (x - a.x) ** 2 + (z - a.z) ** 2 < reach * reach) ?? null;
}

/**
 * Door is on local +Z. Three.js rotates Y so local +Z maps to world
 * (sin r, cos r); solving for the direction toward spawn gives atan2(-x, -z).
 */
function doorFacingSpawn(x: number, z: number): number {
  return Math.atan2(-x, -z);
}

function footprint(kind: HouseKind, variant: number, scale: number): { halfW: number; halfD: number } {
  if (kind === "shack") {
    return variant === 1 ? { halfW: 3.7 * scale, halfD: 4.1 * scale } : { halfW: 3.1 * scale, halfD: 3.6 * scale };
  }
  if (kind === "crypt") {
    return variant === 1 ? { halfW: 3.7 * scale, halfD: 5.0 * scale } : { halfW: 3.0 * scale, halfD: 4.1 * scale };
  }
  if (variant === 1) return { halfW: 4.4 * scale, halfD: 5.0 * scale };
  if (variant === 2) return { halfW: 3.6 * scale, halfD: 4.2 * scale };
  return { halfW: 3.5 * scale, halfD: 4.4 * scale };
}

const FLOOR_BY_KIND: Record<HouseKind, number> = { cabin: 0.22, shack: 0.5, crypt: 0.3 };

/** The house style is decided by the biome it stands in, so they always match. */
function house(x: number, z: number, scale: number, variant: 0 | 1 | 2): HousePlacement {
  const biome = biomeAt(x, z);
  const kind: HouseKind = biome === "forest" ? "cabin" : biome === "swamp" ? "shack" : "crypt";
  const v = kind === "cabin" ? variant : ((variant % 2) as 0 | 1);
  return {
    x,
    z,
    rot: doorFacingSpawn(x, z),
    scale,
    kind,
    biome,
    variant: v,
    floorY: FLOOR_BY_KIND[kind],
    ...footprint(kind, v, scale),
  };
}

/* ------------------------------------------------------------------------ */
/* Houses                                                                    */
/* ------------------------------------------------------------------------ */

/** Safe houses — doors face spawn so you can walk straight in. */
export const HOUSES: HousePlacement[] = [
  // Hollow Woods — cabins
  house(0, -16, 1, 0),
  house(-48, 22, 1, 0),
  house(-62, 10, 0.95, 1),
  house(-44, 38, 0.9, 0),
  house(58, -20, 1.05, 1),
  house(74, -6, 0.88, 2),
  house(32, 68, 1, 0),
  house(82, 48, 1, 1),
  house(-18, 78, 0.86, 2),
  house(-110, 60, 1, 0),
  house(120, 22, 1, 1),
  house(60, 120, 1, 0),
  house(-70, 130, 1, 2),
  house(140, -12, 1, 0),
  house(-140, 12, 1, 1),
  house(-100, -8, 1, 0),
  house(104, 104, 1, 2),
  house(-20, 150, 1, 0),
  // Drowned Marsh — stilt shacks
  house(-40, -70, 1, 0),
  house(-90, -55, 1, 1),
  house(-60, -110, 1, 0),
  house(-120, -100, 1, 1),
  house(-30, -140, 1, 0),
  house(-140, -150, 1, 0),
  house(-85, -150, 1, 1),
  house(-150, -72, 1, 0),
  // Ashen Graveyard — crypts
  house(40, -70, 1, 0),
  house(90, -55, 1, 1),
  house(60, -110, 1, 0),
  house(120, -100, 1, 1),
  house(30, -140, 1, 0),
  house(140, -150, 1, 1),
  house(85, -150, 1, 0),
  house(150, -68, 1, 0),
];

export function hasPorch(h: HousePlacement): boolean {
  if (h.kind === "cabin") return h.variant !== 2;
  return h.kind === "shack";
}

/**
 * World → house-local. Matches THREE's Y rotation
 * (x' = x cos r + z sin r, z' = -x sin r + z cos r), so collision and
 * rendering agree for every rotation.
 */
export function toLocal(h: HousePlacement, x: number, z: number): { lx: number; lz: number } {
  const cos = Math.cos(h.rot);
  const sin = Math.sin(h.rot);
  const dx = x - h.x;
  const dz = z - h.z;
  return {
    lx: dx * cos - dz * sin,
    lz: dx * sin + dz * cos,
  };
}

export function toWorld(h: HousePlacement, lx: number, lz: number): { x: number; z: number } {
  const cos = Math.cos(h.rot);
  const sin = Math.sin(h.rot);
  return {
    x: h.x + lx * cos + lz * sin,
    z: h.z - lx * sin + lz * cos,
  };
}

function tooCloseToHouse(x: number, z: number, padding: number): boolean {
  return HOUSES.some((h) => {
    const { lx, lz } = toLocal(h, x, z);
    return Math.abs(lx) < h.halfW + padding && Math.abs(lz) < h.halfD + padding;
  });
}

/** Keeps the strip in front of every door free so the entrance is walkable. */
function blocksDoorway(x: number, z: number): boolean {
  return HOUSES.some((h) => {
    const { lx, lz } = toLocal(h, x, z);
    return Math.abs(lx) < DOOR_HALF + 2.2 && lz > h.halfD - 1 && lz < h.halfD + APPROACH_DEPTH;
  });
}

/* ------------------------------------------------------------------------ */
/* Objectives                                                                */
/* ------------------------------------------------------------------------ */

/** Talismans: a few sit by houses in every biome; the rest scatter. */
export const TALISMANS: Placement[] = (() => {
  const list: Placement[] = [];
  const houseAnchors = [3, 9, 20, 24, 28, 31];
  for (const hi of houseAnchors) {
    const h = HOUSES[hi];
    const angle = h.rot + Math.PI * 0.35 + rand() * 0.4;
    list.push({
      x: h.x + Math.cos(angle) * (h.halfW + 3.2),
      z: h.z + Math.sin(angle) * (h.halfD + 3.2),
      scale: 1,
      rot: rand() * Math.PI * 2,
    });
  }
  let guard = 0;
  while (list.length < TALISMAN_COUNT && guard++ < 2000) {
    const angle = rand() * Math.PI * 2;
    const radius = 30 + rand() * 120;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (Math.abs(x) > WORLD_HALF - 8 || Math.abs(z) > WORLD_HALF - 8) continue;
    if (nearSpawn(x, z) || nearGatePath(x, z)) continue;
    if (tooCloseToHouse(x, z, 2.4)) continue;
    if (tooClose(x, z, list, 24)) continue;
    list.push({ x, z, scale: 1, rot: rand() * Math.PI * 2 });
  }
  return list;
})();

/* ------------------------------------------------------------------------ */
/* Scenery                                                                   */
/* ------------------------------------------------------------------------ */

/** Trees fill every biome (sparser in the marsh and graveyard), with clearings. */
export const TREES: Placement[] = (() => {
  const list: Placement[] = [];
  let guard = 0;
  while (list.length < 1250 && guard++ < 30000) {
    const x = (rand() * 2 - 1) * (WORLD_HALF - 3);
    const z = (rand() * 2 - 1) * (WORLD_HALF - 3);
    const biome = biomeAt(x, z);
    const keep = rand();
    if (biome === "swamp" && keep < 0.38) continue;
    if (biome === "graveyard" && keep < 0.5) continue;
    if (nearSpawn(x, z)) continue;
    if (nearGatePath(x, z)) continue;
    if (nearBossArena(x, z, 3)) continue;
    if (tooCloseToHouse(x, z, 2.8)) continue;
    if (blocksDoorway(x, z)) continue;
    if (tooClose(x, z, TALISMANS, 2.6)) continue;
    if (tooClose(x, z, list, 3.4)) continue;
    list.push({ x, z, scale: 0.8 + rand() * 1.05, rot: rand() * Math.PI * 2 });
  }
  // Dense ring of big trees walls the world in.
  const ringCount = 230;
  for (let i = 0; i < ringCount; i++) {
    const angle = (i / ringCount) * Math.PI * 2;
    const radius = WORLD_HALF - 0.4 + rand() * 1.8;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (nearGatePath(x, z)) continue;
    list.push({ x, z, scale: 1.15 + rand() * 0.8, rot: rand() * Math.PI * 2 });
  }
  return list;
})();

/** Crooked tombstones fill the graveyard biome. */
export const TOMBSTONES: Placement[] = (() => {
  const list: Placement[] = [];
  let guard = 0;
  while (list.length < 170 && guard++ < 6000) {
    const x = 8 + rand() * (WORLD_HALF - 14);
    const z = -(45 + rand() * (WORLD_HALF - 52));
    if (biomeAt(x, z) !== "graveyard") continue;
    if (nearGatePath(x, z)) continue;
    if (nearBossArena(x, z, 2)) continue;
    if (tooClose(x, z, TREES, 1.2)) continue;
    if (tooCloseToHouse(x, z, 2)) continue;
    if (blocksDoorway(x, z)) continue;
    if (tooClose(x, z, TALISMANS, 2)) continue;
    if (tooClose(x, z, list, 2.4)) continue;
    list.push({ x, z, scale: 0.7 + rand() * 0.6, rot: (rand() - 0.5) * 0.9 });
  }
  return list;
})();

/** Black water pools in the marsh (visual only). */
export const PUDDLES: Placement[] = (() => {
  const list: Placement[] = [];
  let guard = 0;
  while (list.length < 22 && guard++ < 3000) {
    const x = -(8 + rand() * (WORLD_HALF - 14));
    const z = -(45 + rand() * (WORLD_HALF - 52));
    if (biomeAt(x, z) !== "swamp") continue;
    if (nearGatePath(x, z)) continue;
    if (tooCloseToHouse(x, z, 3)) continue;
    if (tooClose(x, z, list, 14)) continue;
    list.push({ x, z, scale: 3 + rand() * 4.5, rot: rand() * Math.PI * 2 });
  }
  return list;
})();

/** Scattered rocks. */
export const ROCKS: Placement[] = (() => {
  const list: Placement[] = [];
  let guard = 0;
  while (list.length < 150 && guard++ < 4000) {
    const x = (rand() * 2 - 1) * (WORLD_HALF - 4);
    const z = (rand() * 2 - 1) * (WORLD_HALF - 4);
    if (nearSpawn(x, z)) continue;
    if (nearGatePath(x, z)) continue;
    if (tooCloseToHouse(x, z, 1.6)) continue;
    if (blocksDoorway(x, z)) continue;
    if (tooClose(x, z, TALISMANS, 2)) continue;
    list.push({ x, z, scale: 0.3 + rand() * 0.9, rot: rand() * Math.PI * 2 });
  }
  return list;
})();

/** Grass tufts — purely visual, no collision. */
export const GRASS: Placement[] = (() => {
  const list: Placement[] = [];
  let guard = 0;
  while (list.length < 1000 && guard++ < 3000) {
    const x = (rand() * 2 - 1) * (WORLD_HALF - 2);
    const z = (rand() * 2 - 1) * (WORLD_HALF - 2);
    if (tooCloseToHouse(x, z, 0.6)) continue;
    list.push({ x, z, scale: 0.5 + rand() * 0.9, rot: rand() * Math.PI * 2 });
  }
  return list;
})();

/** Streetlights by house porches, spawn, and the road toward the gate. */
export const STREETLIGHTS: Placement[] = (() => {
  const list: Placement[] = [];
  for (const h of HOUSES) {
    const lx = h.halfW + 1.1;
    const lz = h.halfD + PORCH_DEPTH + 0.4;
    const p = toWorld(h, lx, lz);
    list.push({ x: p.x, z: p.z, scale: 1, rot: h.rot + Math.PI * 0.75 });
  }
  const extras: Placement[] = [
    { x: 6.2, z: 7.5, scale: 1, rot: 0.1 },
    { x: -6.2, z: 7.5, scale: 1, rot: -0.1 },
    { x: 4.2, z: -48, scale: 1, rot: 0.05 },
    { x: -4.2, z: -72, scale: 1, rot: -0.05 },
    { x: 4.2, z: -96, scale: 1, rot: 0 },
    { x: -4.2, z: -120, scale: 1, rot: 0 },
    { x: 4.2, z: -142, scale: 1, rot: 0 },
    { x: -4.6, z: -158, scale: 1, rot: 0 },
    { x: -54, z: 26, scale: 1, rot: 0.4 },
    { x: 64, z: -14, scale: 1, rot: 2.4 },
  ];
  for (const extra of extras) {
    if (tooCloseToHouse(extra.x, extra.z, 1.2)) continue;
    if (tooClose(extra.x, extra.z, TREES, 1.6)) continue;
    list.push(extra);
  }
  return list;
})();

/* ------------------------------------------------------------------------ */
/* Powerups (re-rolled every run)                                            */
/* ------------------------------------------------------------------------ */

const POWERUP_MIX: PowerupType[] = [
  "health", "speed", "stamina", "armor",
  "health", "speed", "stamina", "armor",
  "health", "speed", "armor", "stamina",
  "health", "speed", "armor", "stamina",
];

/** Scatter powerups in random open spots; the seed changes per session. */
export function generatePowerups(seed: number): PowerupPlacement[] {
  const r = mulberry32(seed * 7919 + 17);
  const types = [...POWERUP_MIX];
  for (let i = types.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [types[i], types[j]] = [types[j], types[i]];
  }
  const list: PowerupPlacement[] = [];
  let guard = 0;
  while (list.length < types.length && guard++ < 6000) {
    const x = (r() * 2 - 1) * (WORLD_HALF - 10);
    const z = (r() * 2 - 1) * (WORLD_HALF - 10);
    if (x * x + z * z < 16 * 16) continue;
    if (nearGatePath(x, z)) continue;
    if (nearBossArena(x, z, 2)) continue;
    if (tooCloseToHouse(x, z, 2)) continue;
    if (tooClose(x, z, TREES, 1.5)) continue;
    if (tooClose(x, z, TALISMANS, 5)) continue;
    if (tooClose(x, z, list, 24)) continue;
    list.push({ x, z, type: types[list.length] });
  }
  return list;
}

/* ------------------------------------------------------------------------ */
/* Power loot (re-rolled every run)                                          */
/* ------------------------------------------------------------------------ */

const SKILL_BY_BIOME: Record<Biome, string[]> = {
  forest: ["arrow", "fireBolt", "ward"],
  swamp: ["shadowBlade", "trap"],
  graveyard: ["pulse"],
};

const MODS_BY_BIOME: Record<Biome, string[]> = {
  forest: ["multishot", "homing", "piercing", "explosive"],
  swamp: ["chain", "vampiric", "ricochet", "split"],
  graveyard: ["supershot"],
};

function scatterInBiome(
  r: () => number,
  biome: Biome,
  list: { x: number; z: number }[],
  minDist: number,
  attempts = 80,
  arenaPad = 3
): { x: number; z: number } | null {
  for (let i = 0; i < attempts; i++) {
    const x = (r() * 2 - 1) * (WORLD_HALF - 12);
    const z = (r() * 2 - 1) * (WORLD_HALF - 12);
    if (biomeAt(x, z) !== biome) continue;
    if (nearSpawn(x, z) || nearGatePath(x, z)) continue;
    if (nearBossArena(x, z, arenaPad)) continue;
    if (tooCloseToHouse(x, z, 2.2)) continue;
    if (tooClose(x, z, TREES, 1.4)) continue;
    if (tooClose(x, z, TALISMANS, 4)) continue;
    if (tooClose(x, z, list, minDist)) continue;
    return { x, z };
  }
  return null;
}

const KEY_GAPS = [92, 76, 60, 46];

function scatterKeyInBiome(
  r: () => number,
  biome: Biome,
  occupied: { x: number; z: number }[],
  siblingKeys: { x: number; z: number }[]
): { x: number; z: number } | null {
  for (const gap of KEY_GAPS) {
    const p = scatterInBiome(r, biome, [...occupied, ...siblingKeys], gap, 240, 12);
    if (p && !tooClose(p.x, p.z, siblingKeys, gap)) return p;
  }
  return scatterInBiome(r, biome, [...occupied, ...siblingKeys], 36, 200, 10);
}

/** Fragments, skill shards, modifiers, key pieces, and one cursed relic per later biome. */
export function generatePowerLoot(seed: number): PowerLootPlacement[] {
  const r = mulberry32(seed * 4133 + 91);
  const list: PowerLootPlacement[] = [];
  const occupied: { x: number; z: number }[] = [];
  let n = 0;

  const push = (item: Omit<PowerLootPlacement, "id">): void => {
    const id = `loot-${n++}`;
    list.push({ ...item, id });
    occupied.push({ x: item.x, z: item.z });
  };

  const biomes: Biome[] = ["forest", "swamp", "graveyard"];
  const fragmentCounts: Record<Biome, number> = { forest: 16, swamp: 14, graveyard: 10 };

  for (const biome of biomes) {
    const keysHere: { x: number; z: number }[] = [];
    for (let k = 0; k < 3; k++) {
      const p = scatterKeyInBiome(r, biome, occupied, keysHere);
      if (!p) continue;
      keysHere.push(p);
      push({ kind: "keyPiece", x: p.x, z: p.z, biome, keyIndex: k });
    }
    for (let i = 0; i < fragmentCounts[biome]; i++) {
      const p = scatterInBiome(r, biome, occupied, 18);
      if (!p) continue;
      push({ kind: "fragment", x: p.x, z: p.z, biome });
    }
    for (const skillId of SKILL_BY_BIOME[biome]) {
      const p = scatterInBiome(r, biome, occupied, 22);
      if (!p) continue;
      push({ kind: "skillShard", x: p.x, z: p.z, biome, skillId });
    }
    for (const modifierId of MODS_BY_BIOME[biome]) {
      const p = scatterInBiome(r, biome, occupied, 20);
      if (!p) continue;
      push({ kind: "modifier", x: p.x, z: p.z, biome, modifierId });
    }
  }

  const cursedSpot = scatterInBiome(r, "swamp", occupied, 24);
  if (cursedSpot) {
    push({
      kind: "cursedRelic",
      x: cursedSpot.x,
      z: cursedSpot.z,
      biome: "swamp",
      modifierId: "cursedSupershot",
    });
  }

  return list;
}

/* ------------------------------------------------------------------------ */
/* Collision                                                                 */
/* ------------------------------------------------------------------------ */

function collideAabb(
  lx: number,
  lz: number,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  radius: number
): { lx: number; lz: number } {
  const a0 = minX - radius;
  const a1 = maxX + radius;
  const b0 = minZ - radius;
  const b1 = maxZ + radius;
  if (lx <= a0 || lx >= a1 || lz <= b0 || lz >= b1) return { lx, lz };

  const pushLeft = lx - a0;
  const pushRight = a1 - lx;
  const pushDown = lz - b0;
  const pushUp = b1 - lz;
  const minPush = Math.min(pushLeft, pushRight, pushDown, pushUp);
  if (minPush === pushLeft) return { lx: a0, lz };
  if (minPush === pushRight) return { lx: a1, lz };
  if (minPush === pushDown) return { lx, lz: b0 };
  return { lx, lz: b1 };
}

type LocalBox = [minX: number, maxX: number, minZ: number, maxZ: number];

/** Solid pieces of a house in local space: four walls minus the door, plus porch rails. */
function houseSolids(h: HousePlacement): LocalBox[] {
  const hw = h.halfW;
  const hd = h.halfD;
  const t = WALL_THICKNESS;
  const solids: LocalBox[] = [
    [-hw, -hw + t, -hd, hd], // left
    [hw - t, hw, -hd, hd], // right
    [-hw, hw, -hd, -hd + t], // back
    [-hw, -DOOR_HALF, hd - t, hd], // front, left of door
    [DOOR_HALF, hw, hd - t, hd], // front, right of door
  ];
  if (hasPorch(h)) {
    const railZ = hd + PORCH_DEPTH - 0.12;
    solids.push([-hw, -(DOOR_HALF + 0.45), railZ - 0.08, railZ + 0.08]);
    solids.push([DOOR_HALF + 0.45, hw, railZ - 0.08, railZ + 0.08]);
  }
  return solids;
}

/** Player collision: hollow walls with a front door gap. */
function resolveHouseWalls(px: number, pz: number, bodyRadius: number): { x: number; z: number } {
  let x = px;
  let z = pz;
  for (const h of HOUSES) {
    let { lx, lz } = toLocal(h, x, z);
    const hw = h.halfW;
    const hd = h.halfD;
    // Quick reject if far from the building (porch included).
    if (Math.abs(lx) > hw + bodyRadius + 0.4 || lz < -hd - bodyRadius - 0.4) continue;
    if (lz > hd + PORCH_DEPTH + bodyRadius + 0.4) continue;

    for (const [minX, maxX, minZ, maxZ] of houseSolids(h)) {
      const next = collideAabb(lx, lz, minX, maxX, minZ, maxZ, bodyRadius);
      lx = next.lx;
      lz = next.lz;
    }
    const world = toWorld(h, lx, lz);
    x = world.x;
    z = world.z;
  }
  return { x, z };
}

function resolvePoles(px: number, pz: number, bodyRadius: number): { x: number; z: number } {
  let x = px;
  let z = pz;
  for (const light of STREETLIGHTS) {
    const radius = 0.18 + bodyRadius;
    const dx = x - light.x;
    const dz = z - light.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > 0.0001 && d2 < radius * radius) {
      const d = Math.sqrt(d2);
      x = light.x + (dx / d) * radius;
      z = light.z + (dz / d) * radius;
    }
  }
  return { x, z };
}

/** The house whose interior, doorway, or porch contains this point. */
export function safeHouseAt(x: number, z: number): HousePlacement | null {
  for (const h of HOUSES) {
    const { lx, lz } = toLocal(h, x, z);
    const innerW = h.halfW - WALL_THICKNESS * 0.4;
    const innerD = h.halfD - WALL_THICKNESS * 0.4;
    if (Math.abs(lx) < innerW && Math.abs(lz) < innerD) return h;
    const porchReach = hasPorch(h) ? PORCH_DEPTH + 0.3 : 0.9;
    if (Math.abs(lx) < innerW && lz >= innerD && lz < h.halfD + porchReach) return h;
  }
  return null;
}

/** True when the survivor is inside a house, in the doorway, or on its porch. */
export function isInsideSafeZone(x: number, z: number): boolean {
  return safeHouseAt(x, z) !== null;
}

/**
 * Keep the Hollow One outside houses. Uses a solid footprint (porch
 * included) so it cannot squeeze through the door or reach the deck.
 */
export function excludeFromHouses(
  px: number,
  pz: number,
  bodyRadius: number
): { x: number; z: number } {
  let x = px;
  let z = pz;
  for (const h of HOUSES) {
    let { lx, lz } = toLocal(h, x, z);
    const pad = bodyRadius + 1.2;
    const hw = h.halfW + pad;
    const back = -h.halfD - pad;
    const front = h.halfD + (hasPorch(h) ? PORCH_DEPTH : 0) + pad + 1.2;
    if (Math.abs(lx) >= hw || lz <= back || lz >= front) continue;

    const pushX = hw - Math.abs(lx);
    const pushBack = lz - back;
    const pushFront = front - lz;
    const minPush = Math.min(pushX, pushBack, pushFront);
    if (minPush === pushX) {
      lx = lx > 0 ? hw : -hw;
    } else if (minPush === pushBack) {
      lz = back;
    } else {
      lz = front;
    }
    const world = toWorld(h, lx, lz);
    x = world.x;
    z = world.z;
  }
  return { x, z };
}

/** Keep the survivor outside a locked boss ring. */
export function resolveLockedArenas(
  x: number,
  z: number,
  bodyRadius: number,
  unlocked: Record<string, boolean>
): { x: number; z: number } {
  let px = x;
  let pz = z;
  for (const arena of BOSS_ARENAS) {
    if (unlocked[arena.bossId]) continue;
    const dx = px - arena.x;
    const dz = pz - arena.z;
    const d = Math.hypot(dx, dz);
    const limit = arena.radius + bodyRadius;
    if (d > 0.001 && d < limit) {
      px = arena.x + (dx / d) * limit;
      pz = arena.z + (dz / d) * limit;
    }
  }
  return { x: px, z: pz };
}

/** Push a point out of trees, house walls, and streetlight poles. */
export function resolveWorldCollision(
  x: number,
  z: number,
  bodyRadius: number
): { x: number; z: number } {
  let px = x;
  let pz = z;
  for (const tree of TREES) {
    const treeRadius = 0.3 * tree.scale + bodyRadius;
    const dx = px - tree.x;
    const dz = pz - tree.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > 0.0001 && d2 < treeRadius * treeRadius) {
      const d = Math.sqrt(d2);
      px = tree.x + (dx / d) * treeRadius;
      pz = tree.z + (dz / d) * treeRadius;
    }
  }
  const h = resolveHouseWalls(px, pz, bodyRadius);
  return resolvePoles(h.x, h.z, bodyRadius);
}
