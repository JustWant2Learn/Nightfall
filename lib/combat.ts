import {
  CORRUPTION_TIER,
  MODIFIERS,
  SKILLS,
  skillDamage,
  type ModifierId,
  type SkillId,
} from "@/lib/gameData";
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

export const combat = {
  bolts: [] as Bolt[],
  traps: [] as GroundTrap[],
  bursts: [] as Burst[],
  beams: [] as Beam[],
  sparks: [] as Spark[],
  nextId: 1,
  cooldownUntil: 0,
};

export function clearCombat(): void {
  combat.bolts.length = 0;
  combat.traps.length = 0;
  combat.bursts.length = 0;
  combat.beams.length = 0;
  combat.sparks.length = 0;
  combat.cooldownUntil = 0;
}

export function applyPlayerDamage(raw: number): void {
  const store = useGameStore.getState();
  const now = performance.now() / 1000;
  const warded = now < runtime.wardUntil;
  const afterWard = warded ? raw * 0.4 : raw;
  const damage = afterWard * (1 - store.stats.armor / 100);
  runtime.health = Math.max(0, runtime.health - damage);
  runtime.hitFlash = 1;
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

  // Fire exactly along the camera→reticle ray (same path the crosshair is on).
  let dirX = runtime.aimDirX;
  let dirY = runtime.aimDirY;
  let dirZ = runtime.aimDirZ;
  const aimLen = Math.hypot(dirX, dirY, dirZ);
  if (aimLen > 0.001) {
    dirX /= aimLen;
    dirY /= aimLen;
    dirZ /= aimLen;
  } else {
    dirX = -Math.sin(heading);
    dirY = 0;
    dirZ = -Math.cos(heading);
  }
  const spawnX = runtime.muzzleX;
  const spawnY = runtime.muzzleY;
  const spawnZ = runtime.muzzleZ;
  // Horizontal facing for traps / body-relative offsets.
  const flatLen = Math.hypot(dirX, dirZ) || 1;
  const flatX = dirX / flatLen;
  const flatZ = dirZ / flatLen;

  if (def.type === "defense") {
    runtime.wardUntil = now + 2.2 + level * 0.25;
    spawnBurst(spawnX, spawnY, spawnZ, def.color);
    runtime.charge = 0;
    return true;
  }

  if (def.type === "placed") {
    combat.traps.push({
      id: combat.nextId++,
      x: px + flatX * 1.4,
      z: pz + flatZ * 1.4,
      armIn: 0.7,
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
    const dx = runtime.bossX - spawnX;
    const dy = 1.2 - spawnY;
    const dz = runtime.bossZ - spawnZ;
    const toBoss = Math.hypot(dx, dy, dz) || 1;
    const aligned = (dx / toBoss) * dirX + (dy / toBoss) * dirY + (dz / toBoss) * dirZ;
    const dist = Math.hypot(runtime.bossX - px, runtime.bossZ - pz);
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
    spawnBurst(spawnX + dirX * 1.1, spawnY + dirY * 1.1, spawnZ + dirZ * 1.1, def.color);
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

  // Build a stable basis around the aim ray for multishot fan.
  let upX = 0;
  let upY = 1;
  let upZ = 0;
  if (Math.abs(dirY) > 0.92) {
    upX = 1;
    upY = 0;
    upZ = 0;
  }
  let sideX = upY * dirZ - upZ * dirY;
  let sideY = upZ * dirX - upX * dirZ;
  let sideZ = upX * dirY - upY * dirX;
  const sideLen = Math.hypot(sideX, sideY, sideZ) || 1;
  sideX /= sideLen;
  sideY /= sideLen;
  sideZ /= sideLen;

  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : (i / (count - 1) - 0.5) * (spread * Math.PI) / 180;
    const c = Math.cos(t);
    const s = Math.sin(t);
    let sx = dirX * c + sideX * s;
    let sy = dirY * c + sideY * s;
    let sz = dirZ * c + sideZ * s;
    const sl = Math.hypot(sx, sy, sz) || 1;
    sx /= sl;
    sy /= sl;
    sz /= sl;
    combat.bolts.push({
      id: combat.nextId++,
      skill,
      x: spawnX + sx * 0.2,
      y: spawnY + sy * 0.2,
      z: spawnZ + sz * 0.2,
      vx: sx * speed,
      vy: sy * speed,
      vz: sz * speed,
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
    });
  }
  spawnBurst(spawnX + dirX * 0.45, spawnY + dirY * 0.45, spawnZ + dirZ * 0.45, def.color);
  runtime.charge = 0;
  return true;
}

export function spawnBurst(x: number, y: number, z: number, color: string): void {
  combat.bursts.push({ id: combat.nextId++, x, y, z, age: 0, color });
}

/** Flash + sparks at the point a skill connects with a boss. */
export function spawnImpact(x: number, y: number, z: number, color: string): void {
  audio.impact();
  spawnBurst(x, y, z, color);
  for (let i = 0; i < 10; i++) {
    const a = Math.random() * Math.PI * 2;
    const p = 0.35 + Math.random() * 0.9;
    combat.sparks.push({
      id: combat.nextId++,
      x,
      y,
      z,
      vx: Math.cos(a) * p * 4,
      vy: 1.4 + Math.random() * 3.2,
      vz: Math.sin(a) * p * 4,
      age: 0,
      color,
    });
  }
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
    });
  }
}

export function stepCombat(dt: number): void {
  const store = useGameStore.getState();
  const half = 168;

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
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.z += b.vz * dt;
    b.life -= dt;
    if (b.ricochet && !b.bounced && (Math.abs(b.x) > half || Math.abs(b.z) > half)) {
      if (Math.abs(b.x) > half) b.vx *= -1;
      if (Math.abs(b.z) > half) b.vz *= -1;
      b.bounced = true;
    }
    let hit = false;
    if (runtime.bossAlive) {
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
        hit = true;
      }
    }
    if (hit && !b.piercing) {
      combat.bolts.splice(i, 1);
      continue;
    }
    if (b.life <= 0 || Math.abs(b.x) > 190 || Math.abs(b.z) > 190 || b.y < -4 || b.y > 40) {
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
    if (s.age > 0.38) combat.sparks.splice(i, 1);
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
