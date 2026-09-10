import {
  CORRUPTION_TIER,
  MODIFIERS,
  SKILLS,
  skillDamage,
  type ModifierId,
  type SkillId,
} from "@/lib/gameData";
import { raycastWorld, type HitSurface } from "@/lib/aim-ray";
import { audio } from "@/lib/audio";
import { runtime, useGameStore } from "@/lib/store";

export interface Bolt {
  id: number;
  skill: SkillId;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  damage: number;
  piercing: boolean;
  explosive: boolean;
  homing: boolean;
  ricochet: boolean;
  bounced: boolean;
  split: boolean;
  chain: boolean;
  vampiric: boolean;
  color: string;
  radius: number;
  /** World colliders this bolt has already punched through. */
  pierced: string[];
}

export interface GroundTrap {
  id: number;
  x: number;
  z: number;
  armIn: number;
  life: number;
  damage: number;
  explosive: boolean;
  color: string;
}

export interface Burst {
  id: number;
  x: number;
  y: number;
  z: number;
  age: number;
  color: string;
  size: number;
  /** Ground ring — Pulse and similar, not the muzzle flash. */
  ring: boolean;
}

export interface Beam {
  id: number;
  x0: number;
  y0: number;
  z0: number;
  x1: number;
  y1: number;
  z1: number;
  age: number;
}

export interface Spark {
  id: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  color: string;
}

export type SlashKind = "hook" | "loop" | "ring";

export interface Slash {
  id: number;
  heading: number;
  /** +1 first slash (left→right), −1 second slash (right→left). */
  sign: number;
  kind: SlashKind;
  radius: number;
  lift: number;
  age: number;
  life: number;
}

export const combat = {
  bolts: [] as Bolt[],
  traps: [] as GroundTrap[],
  bursts: [] as Burst[],
  beams: [] as Beam[],
  sparks: [] as Spark[],
  slashes: [] as Slash[],
  nextId: 1,
  cooldownUntil: 0,
};

export function clearCombat(): void {
  combat.bolts.length = 0;
  combat.traps.length = 0;
  combat.bursts.length = 0;
  combat.beams.length = 0;
  combat.sparks.length = 0;
  combat.slashes.length = 0;
  combat.cooldownUntil = 0;
}

export function applyPlayerDamage(raw: number): void {
  const store = useGameStore.getState();
  const warded = runtime.wardLeft > 0;
  const afterWard = warded ? raw * 0.4 : raw;
  const damage = afterWard * (1 - store.stats.armor / 100);
  runtime.health = Math.max(0, runtime.health - damage);
  runtime.hitFlash = 1;
  if (warded) {
    runtime.wardUntil = 0;
    runtime.wardLeft = 0;
    runtime.wardMax = 0;
    spawnBurst(runtime.playerX, (runtime.playerY ?? 0) + 1.05, runtime.playerZ, "#9be7ff", 0.55, false);
    spraySparks(runtime.playerX, (runtime.playerY ?? 0) + 1.05, runtime.playerZ, 0, 1, 0, "#9be7ff", 10, 3.2, 1.6);
  }
}

export function hurtActiveBoss(amount: number, tags: { piercing?: boolean; explosive?: boolean }): number {
  if (!runtime.bossAlive || runtime.bossHealth <= 0) return 0;
  let dealt = amount;
  if (runtime.bossArmored && !tags.piercing && !tags.explosive) dealt *= 0.22;
  if (runtime.bossArmored && (tags.piercing || tags.explosive)) {
    runtime.bossArmored = false;
  }
  if (runtime.bossId === "ogre" && runtime.corruption >= CORRUPTION_TIER && !runtime.bossArmored) {
    dealt *= 1.35;
  }
  runtime.bossHealth = Math.max(0, runtime.bossHealth - dealt);
  runtime.bossHitFlash = 1;
  return dealt;
}

function equippedMods(skill: SkillId): ModifierId[] {
  const store = useGameStore.getState();
  return store.loadout[skill] ?? [];
}

function hasMod(mods: ModifierId[], id: ModifierId): boolean {
  return mods.includes(id);
}

export function tryFireSkill(now: number, heading: number, px: number, py: number, pz: number): boolean {
  const store = useGameStore.getState();
  const skill = store.activeSkill;
  const def = SKILLS[skill];
  if (!def || !store.unlockedSkills.includes(skill)) return false;
  if (now < combat.cooldownUntil) return false;

  const mods = equippedMods(skill);
  const chargeMods = hasMod(mods, "supershot") || hasMod(mods, "volleyBurst") || hasMod(mods, "cursedSupershot");
  const chargeMul = chargeMods ? 1 + runtime.charge * ((MODIFIERS.supershot.chargeMultiplier ?? 2.4) - 1) : 1;
  if (hasMod(mods, "cursedSupershot")) {
    const extra = (MODIFIERS.cursedSupershot.chargeMultiplier ?? 3.6) - 1;
    // cursed charge replaces the normal curve when slotted
    void extra;
  }
  const level = store.skillLevels[skill] ?? 1;
  const corrupted = store.corruption >= CORRUPTION_TIER;
  const mastery = store.relics.includes("mastery");
  const damage = skillDamage(def, level, mastery, corrupted) * chargeMul;

  let cost = 0;
  for (const id of mods) cost += MODIFIERS[id].corruptionCostPerUse;
  if (cost > 0) store.addCorruption(cost);

  combat.cooldownUntil = now + def.cooldown * (chargeMods && runtime.charge > 0.6 ? 1.15 : 1);

  const originY = py + 0.72;
  // Leave the character's hand and fly at the reticle hit (tree, house, boss, or ground).
  let dirX = runtime.aimX - px;
  let dirY = runtime.aimY - originY;
  let dirZ = runtime.aimZ - pz;
  const dirLen = Math.hypot(dirX, dirY, dirZ);
  if (dirLen > 0.0001) {
    dirX /= dirLen;
    dirY /= dirLen;
    dirZ /= dirLen;
  } else {
    dirX = -Math.sin(heading);
    dirY = 0;
    dirZ = -Math.cos(heading);
  }
  const spawnX = px + dirX * 0.55;
  const spawnY = originY + dirY * 0.55;
  const spawnZ = pz + dirZ * 0.55;
  const flatLen = Math.hypot(dirX, dirZ) || 1;
  const flatX = dirX / flatLen;
  const flatZ = dirZ / flatLen;

  if (def.type === "defense") {
    const duration = 30;
    runtime.wardUntil = now + duration;
    runtime.wardLeft = duration;
    runtime.wardMax = duration;
    runtime.charge = 0;
    return true;
  }

  if (def.type === "placed") {
    combat.traps.push({
      id: combat.nextId++,
      x: px + flatX * 2.4,
      z: pz + flatZ * 2.4,
      armIn: 0.55,
      life: 16,
      damage,
      explosive: hasMod(mods, "explosive"),
      color: def.color,
    });
    runtime.charge = 0;
    return true;
  }

  if (def.type === "burst" || def.type === "melee") {
    const reach = def.type === "melee" ? 2.15 : 4.2;
    const dx = runtime.bossX - px;
    const dy = 1.2 - originY;
    const dz = runtime.bossZ - pz;
    const toBoss = Math.hypot(dx, dy, dz) || 1;
    const aligned = (dx / toBoss) * dirX + (dy / toBoss) * dirY + (dz / toBoss) * dirZ;
    const dist = Math.hypot(dx, dz);
    if (runtime.bossAlive && dist < reach + 1.2 && aligned > 0.15) {
      const dealt = hurtActiveBoss(damage, {
        piercing: hasMod(mods, "piercing") || skill === "shadowArrow",
        explosive: hasMod(mods, "explosive"),
      });
      spawnImpact(runtime.bossX, 1.3, runtime.bossZ, def.color);
      if (dealt > 0 && hasMod(mods, "vampiric")) {
        runtime.health = Math.min(store.stats.maxHealth, runtime.health + dealt * 0.18);
      }
      if (hasMod(mods, "chain") && runtime.bossAlive) {
        combat.beams.push({
          id: combat.nextId++,
          x0: runtime.bossX,
          y0: 1.4,
          z0: runtime.bossZ,
          x1: runtime.bossX,
          y1: 2.2,
          z1: runtime.bossZ,
          age: 0,
        });
        hurtActiveBoss(damage * 0.45, { piercing: true });
      }
    }
    if (def.type === "melee") {
      spawnSlash(heading);
    } else {
      spawnBurst(px + dirX * 1.1, originY + dirY * 1.1, pz + dirZ * 1.1, def.color, 0.85, true);
    }
    runtime.charge = 0;
    return true;
  }

  const count = hasMod(mods, "volleyBurst")
    ? 5
    : hasMod(mods, "multishot")
      ? 3
      : 1;
  const spread = hasMod(mods, "volleyBurst") ? 22 : hasMod(mods, "multishot") ? 16 : 0;
  const speed = skill === "fireBolt" ? 16 : 28;

  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : (i / (count - 1) - 0.5) * (spread * Math.PI) / 180;
    let vx: number;
    let vy: number;
    let vz: number;
    if (t === 0) {
      vx = dirX * speed;
      vy = dirY * speed;
      vz = dirZ * speed;
    } else {
      const c = Math.cos(t);
      const s = Math.sin(t);
      const sx = flatX * c - flatZ * s;
      const sz = flatX * s + flatZ * c;
      const spreadLen = Math.hypot(sx, dirY, sz) || 1;
      vx = (sx / spreadLen) * speed;
      vy = (dirY / spreadLen) * speed;
      vz = (sz / spreadLen) * speed;
    }
    combat.bolts.push({
      id: combat.nextId++,
      skill,
      x: spawnX,
      y: spawnY,
      z: spawnZ,
      vx,
      vy,
      vz,
      life: 2.4,
      damage,
      piercing: hasMod(mods, "piercing") || skill === "shadowArrow",
      explosive: hasMod(mods, "explosive") || skill === "fireBolt",
      homing: hasMod(mods, "homing"),
      ricochet: hasMod(mods, "ricochet"),
      bounced: false,
      split: hasMod(mods, "split"),
      chain: hasMod(mods, "chain"),
      vampiric: hasMod(mods, "vampiric"),
      color: corrupted ? "#ff2a2a" : def.color,
      radius: skill === "fireBolt" ? 0.28 : 0.16,
      pierced: [],
    });
  }
  spawnBurst(spawnX + dirX * 0.2, spawnY + dirY * 0.2, spawnZ + dirZ * 0.2, def.color, 0.16);
  runtime.charge = 0;
  return true;
}

export function spawnBurst(x: number, y: number, z: number, color: string, size = 1, ring = false): void {
  combat.bursts.push({ id: combat.nextId++, x, y, z, age: 0, color, size, ring });
}

function spawnSlash(heading: number): void {
  combat.slashes.length = 0;
  combat.slashes.push(
    { id: combat.nextId++, heading, sign: 1, kind: "hook", radius: 1.18, lift: 1.02, age: 0, life: 0.2 },
    { id: combat.nextId++, heading, sign: -1, kind: "hook", radius: 1.18, lift: 0.92, age: -0.14, life: 0.2 },
    { id: combat.nextId++, heading, sign: 1, kind: "loop", radius: 0.15, lift: 1.05, age: -0.28, life: 0.34 },
    { id: combat.nextId++, heading, sign: 1, kind: "ring", radius: 1.05, lift: 0.72, age: -0.28, life: 0.3 }
  );
}

/** Flash + sparks at the point a skill connects with a boss. */
export function spawnImpact(x: number, y: number, z: number, color: string): void {
  audio.impact();
  spawnBurst(x, y, z, color, 1.15, false);
  spraySparks(x, y, z, 0, 1, 0, color, 10, 4.2, 1.4);
}

function isArrowSkill(skill: SkillId): boolean {
  return skill === "arrow" || skill === "shadowArrow";
}

function piercesSurface(bolt: Bolt, surface: HitSurface): boolean {
  if (bolt.explosive) return false;
  if (surface === "wood") return isArrowSkill(bolt.skill) || bolt.piercing;
  return false;
}

function spraySparks(
  x: number,
  y: number,
  z: number,
  vx: number,
  vy: number,
  vz: number,
  color: string,
  count: number,
  speed: number,
  lift: number
): void {
  const len = Math.hypot(vx, vy, vz) || 1;
  const fx = vx / len;
  const fy = vy / len;
  const fz = vz / len;
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const p = 0.35 + Math.random();
    combat.sparks.push({
      id: combat.nextId++,
      x,
      y,
      z,
      vx: -fx * speed * 0.35 + Math.cos(a) * p * speed,
      vy: -fy * speed * 0.2 + lift + Math.random() * speed * 0.55,
      vz: -fz * speed * 0.35 + Math.sin(a) * p * speed,
      age: 0,
      color,
    });
  }
  if (combat.sparks.length > 220) combat.sparks.splice(0, combat.sparks.length - 220);
}

function spawnWorldImpact(bolt: Bolt, x: number, y: number, z: number, surface: HitSurface): void {
  if (bolt.explosive) {
    spawnImpact(x, y, z, "#ff9a40");
    return;
  }
  if (surface === "wood") {
    audio.thwack();
    spawnBurst(x, y, z, "#c48a4a", 0.38);
    spraySparks(x, y, z, bolt.vx, bolt.vy, bolt.vz, "#c4a06a", 8, 3.4, 0.8);
    spraySparks(x, y, z, bolt.vx, bolt.vy, bolt.vz, "#6a4428", 4, 2.2, 0.4);
    return;
  }
  if (surface === "ground") {
    audio.thwack();
    spawnBurst(x, y, z, "#8a7a58", 0.42);
    spraySparks(x, y, z, bolt.vx, bolt.vy, bolt.vz, "#9a8a68", 7, 2.6, 1.1);
    return;
  }
  audio.impact();
  spawnBurst(x, y, z, "#c8c4bc", 0.55);
  spraySparks(x, y, z, bolt.vx, bolt.vy, bolt.vz, "#d0ccc4", 8, 3.6, 1.2);
}

function spawnSplit(from: Bolt): void {
  const ang = Math.atan2(from.vx, from.vz);
  const speed = Math.hypot(from.vx, from.vy, from.vz) || 22;
  for (const side of [-0.4, 0.4]) {
    const a = ang + side;
    const vx = Math.sin(a) * speed;
    const vz = Math.cos(a) * speed;
    combat.bolts.push({
      ...from,
      id: combat.nextId++,
      vx,
      vy: from.vy,
      vz,
      life: 0.7,
      split: false,
      damage: from.damage * 0.55,
      pierced: [...from.pierced],
    });
  }
}

export function stepCombat(dt: number): void {
  const store = useGameStore.getState();
  const half = 168;

  if (runtime.wardLeft > 0) {
    runtime.wardLeft = Math.max(0, runtime.wardLeft - dt);
    if (runtime.wardLeft <= 0) {
      runtime.wardUntil = 0;
      runtime.wardMax = 0;
    }
  }

  for (let i = combat.bolts.length - 1; i >= 0; i--) {
    const b = combat.bolts[i];
    if (b.homing && runtime.bossAlive) {
      const dx = runtime.bossX - b.x;
      const dy = 1.2 - b.y;
      const dz = runtime.bossZ - b.z;
      const d = Math.hypot(dx, dy, dz) || 1;
      const speed = Math.hypot(b.vx, b.vy, b.vz);
      b.vx += (dx / d) * 38 * dt;
      b.vy += (dy / d) * 38 * dt;
      b.vz += (dz / d) * 38 * dt;
      const s = Math.hypot(b.vx, b.vy, b.vz) || 1;
      b.vx = (b.vx / s) * speed;
      b.vy = (b.vy / s) * speed;
      b.vz = (b.vz / s) * speed;
    }

    const travel = Math.hypot(b.vx, b.vy, b.vz) * dt;
    let ox = b.x;
    let oy = b.y;
    let oz = b.z;
    const speedNow = Math.hypot(b.vx, b.vy, b.vz) || 1;
    const dirX = b.vx / speedNow;
    const dirY = b.vy / speedNow;
    const dirZ = b.vz / speedNow;
    let remaining = travel;
    let stopped = false;
    const ignore = new Set(b.pierced);
    let hops = 0;
    while (remaining > 0.001 && hops < 6) {
      hops += 1;
      const hit = raycastWorld(ox, oy, oz, dirX, dirY, dirZ, remaining, ignore);
      if (!hit) {
        ox += dirX * remaining;
        oy += dirY * remaining;
        oz += dirZ * remaining;
        remaining = 0;
        break;
      }
      spawnWorldImpact(b, hit.x, hit.y, hit.z, hit.surface);
      if (!piercesSurface(b, hit.surface)) {
        ox = hit.x;
        oy = hit.y;
        oz = hit.z;
        stopped = true;
        break;
      }
      b.pierced.push(hit.id);
      ignore.add(hit.id);
      const skip = hit.t + 0.06;
      ox = hit.x + dirX * 0.06;
      oy = hit.y + dirY * 0.06;
      oz = hit.z + dirZ * 0.06;
      remaining = Math.max(0, remaining - skip);
    }
    b.x = ox;
    b.y = oy;
    b.z = oz;
    b.life -= dt;
    if (b.ricochet && !b.bounced && (Math.abs(b.x) > half || Math.abs(b.z) > half)) {
      if (Math.abs(b.x) > half) b.vx *= -1;
      if (Math.abs(b.z) > half) b.vz *= -1;
      b.bounced = true;
    }
    let hitBoss = false;
    if (!stopped && runtime.bossAlive) {
      const dx = b.x - runtime.bossX;
      const dy = b.y - 1.2;
      const dz = b.z - runtime.bossZ;
      if (dx * dx + dy * dy + dz * dz < (1.85 + b.radius) ** 2) {
        const dealt = hurtActiveBoss(b.damage, { piercing: b.piercing, explosive: b.explosive });
        spawnImpact(b.x, b.y, b.z, b.explosive ? "#ff9a40" : b.color);
        if (dealt > 0 && b.vampiric) {
          runtime.health = Math.min(store.stats.maxHealth, runtime.health + dealt * 0.16);
        }
        if (b.chain && runtime.bossAlive) {
          combat.beams.push({
            id: combat.nextId++,
            x0: b.x,
            y0: b.y,
            z0: b.z,
            x1: runtime.bossX,
            y1: 1.6,
            z1: runtime.bossZ,
            age: 0,
          });
          hurtActiveBoss(b.damage * 0.4, { piercing: true });
        }
        if (b.split) spawnSplit(b);
        hitBoss = true;
      }
    }
    if (stopped || (hitBoss && !b.piercing)) {
      combat.bolts.splice(i, 1);
      continue;
    }
    if (b.life <= 0 || Math.abs(b.x) > 190 || Math.abs(b.z) > 190 || b.y < -0.45 || b.y > 40) {
      combat.bolts.splice(i, 1);
    }
  }

  for (let i = combat.traps.length - 1; i >= 0; i--) {
    const t = combat.traps[i];
    t.armIn -= dt;
    t.life -= dt;
    if (t.armIn <= 0 && runtime.bossAlive) {
      const dx = runtime.bossX - t.x;
      const dz = runtime.bossZ - t.z;
      if (dx * dx + dz * dz < 2.4 * 2.4) {
        hurtActiveBoss(t.damage, { piercing: false, explosive: t.explosive });
        spawnImpact(t.x, 0.7, t.z, t.color);
        combat.traps.splice(i, 1);
        continue;
      }
    }
    if (t.life <= 0) combat.traps.splice(i, 1);
  }

  for (let i = combat.sparks.length - 1; i >= 0; i--) {
    const s = combat.sparks[i];
    s.age += dt;
    s.vy -= 14 * dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.z += s.vz * dt;
    if (s.age > 0.48) combat.sparks.splice(i, 1);
  }

  for (let i = combat.slashes.length - 1; i >= 0; i--) {
    combat.slashes[i].age += dt;
    if (combat.slashes[i].age > combat.slashes[i].life) combat.slashes.splice(i, 1);
  }

  for (let i = combat.bursts.length - 1; i >= 0; i--) {
    combat.bursts[i].age += dt;
    if (combat.bursts[i].age > 0.35) combat.bursts.splice(i, 1);
  }
  for (let i = combat.beams.length - 1; i >= 0; i--) {
    combat.beams[i].age += dt;
    if (combat.beams[i].age > 0.22) combat.beams.splice(i, 1);
  }
}
