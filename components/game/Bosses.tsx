"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { BOSSES, CORRUPTION_TIER, type BossId } from "@/lib/gameData";
import { applyPlayerDamage } from "@/lib/combat";
import { audio } from "@/lib/audio";
import { TreantMesh } from "@/components/game/Monster";
import { canPassArena, runtime, useGameStore } from "@/lib/store";
import { BOSS_ARENAS, WORLD_HALF, excludeFromHouses } from "@/lib/world-data";

const STRIKE: Record<BossId, { range: number; interval: number; damage: number; speed: number }> = {
  bear: { range: 2.3, interval: 1.35, damage: 22, speed: 3.8 },
  ogre: { range: 2.6, interval: 1.5, damage: 28, speed: 3.3 },
  hollow: { range: 1.9, interval: 1.1, damage: 34, speed: 4.8 },
};

export function Bosses() {
  return (
    <group>
      <Boss id="bear" />
      <Boss id="ogre" />
      <Boss id="hollow" />
    </group>
  );
}

function Boss({ id }: { id: BossId }) {
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const facing = useRef(0);
  const gait = useRef(0);
  const stride = useRef(0);
  const nextStrike = useRef(0);
  const last = useRef({ x: 0, z: 0 });
  const raging = useRef(false);
  const arena = BOSS_ARENAS.find((a) => a.bossId === id)!;
  const stats = STRIKE[id];

  useFrame((state, delta) => {
    const group = root.current;
    if (!group) return;
    const store = useGameStore.getState();
    if (store.phase !== "playing") return;
    const dead = store.bossesDefeated.includes(id);
    if (dead) {
      group.visible = false;
      if (runtime.bossId === id) runtime.bossAlive = false;
      return;
    }
    const dt = Math.min(delta, 0.05);
    const t = state.clock.elapsedTime;
    const unlocked = canPassArena(store, id);
    const px = runtime.playerX;
    const pz = runtime.playerZ;
    const dx = px - group.position.x;
    const dz = pz - group.position.z;
    const dist = Math.hypot(dx, dz);
    const inRing = (px - arena.x) ** 2 + (pz - arena.z) ** 2 < arena.radius * arena.radius;
    group.visible = inRing;
    const fighting = unlocked && inRing;

    if (fighting) {
      if (runtime.bossId !== id) {
        runtime.bossId = id;
        let hp = BOSSES[id].maxHealth;
        if (id === "ogre" && runtime.corruption >= CORRUPTION_TIER) hp += 110;
        runtime.bossMaxHealth = hp;
        runtime.bossHealth = hp;
        runtime.bossArmored = id === "bear";
        audio.huntSting();
      }
      runtime.bossAlive = runtime.bossHealth > 0;
      runtime.bossX = group.position.x;
      runtime.bossZ = group.position.z;
      runtime.inArena = true;
    } else if (runtime.bossId === id && !inRing) {
      runtime.inArena = false;
    }

    if (runtime.bossId === id && runtime.bossHealth <= 0 && runtime.bossAlive) {
      runtime.bossAlive = false;
      audio.stopHuntPresence();
      queueMicrotask(() => useGameStore.getState().defeatBoss(id));
    }

    if (!runtime.paused) {
      if (fighting) {
        const inv = dist > 0.001 ? 1 / dist : 0;
        const rage = id === "ogre" && runtime.corruption >= CORRUPTION_TIER ? 1.25 : 1;
        if (dist > 1.3) {
          group.position.x += dx * inv * stats.speed * rage * dt;
          group.position.z += dz * inv * stats.speed * rage * dt;
        }
        const kept = excludeFromHouses(group.position.x, group.position.z, 1.4);
        group.position.x = kept.x;
        group.position.z = kept.z;
        const adx = group.position.x - arena.x;
        const adz = group.position.z - arena.z;
        const ad = Math.hypot(adx, adz);
        if (ad > arena.radius - 1.5) {
          group.position.x = arena.x + (adx / ad) * (arena.radius - 1.5);
          group.position.z = arena.z + (adz / ad) * (arena.radius - 1.5);
        }
        if (dist < stats.range && t > nextStrike.current) {
          nextStrike.current = t + stats.interval;
          applyPlayerDamage(stats.damage);
          if (runtime.health <= 0) {
            store.die();
            audio.death();
            runtime.paused = true;
          } else {
            audio.hurt();
          }
        }
        if (id === "ogre" && runtime.corruption >= CORRUPTION_TIER && !raging.current && runtime.bossHealth < runtime.bossMaxHealth * 0.4) {
          raging.current = true;
          runtime.bossHealth = Math.min(runtime.bossMaxHealth, runtime.bossHealth + 70);
        }
      } else {
        const orbit = 0.18 * dt;
        const ox = arena.x + Math.cos(t * 0.18) * 3.2;
        const oz = arena.z + Math.sin(t * 0.18) * 3.2;
        const tx = ox - group.position.x;
        const tz = oz - group.position.z;
        const td = Math.hypot(tx, tz);
        if (td > 0.4) {
          group.position.x += (tx / td) * 1.1 * dt;
          group.position.z += (tz / td) * 1.1 * dt;
        }
        void orbit;
      }
    }

    const moved = Math.hypot(group.position.x - last.current.x, group.position.z - last.current.z);
    last.current.x = group.position.x;
    last.current.z = group.position.z;
    const speedNow = dt > 0 ? moved / dt : 0;
    gait.current = THREE.MathUtils.lerp(gait.current, Math.min(1, speedNow / 3.5), 1 - Math.exp(-5 * dt));
    stride.current += dt * (1.4 + speedNow);
    const swing = Math.sin(stride.current) * gait.current;
    if (runtime.bossId === id) {
      runtime.bossHitFlash = Math.max(0, runtime.bossHitFlash - dt * 5);
    }
    if (body.current) {
      const punch = runtime.bossId === id ? runtime.bossHitFlash : 0;
      body.current.position.y = Math.abs(Math.sin(stride.current)) * gait.current * (id === "bear" ? 0.06 : 0.1);
      body.current.rotation.z = swing * 0.04;
      body.current.rotation.x = punch * -0.18;
      const s = 1 + punch * 0.06;
      body.current.scale.setScalar(s);
    }
    if (dx * dx + dz * dz > 0.0001) {
      const desired = Math.atan2(dx, dz);
      let diff = (desired - facing.current) % (Math.PI * 2);
      if (diff > Math.PI) diff -= Math.PI * 2;
      if (diff < -Math.PI) diff += Math.PI * 2;
      facing.current += diff * (1 - Math.exp(-5 * dt));
      group.rotation.y = facing.current;
    }

    if (fighting) {
      runtime.monsterMood = "hunt";
      runtime.monsterDistance = dist;
    } else if (runtime.bossId === id) {
      runtime.monsterMood = "stalk";
      runtime.monsterDistance = dist;
    }

    const half = WORLD_HALF - 2;
    group.position.x = THREE.MathUtils.clamp(group.position.x, -half, half);
    group.position.z = THREE.MathUtils.clamp(group.position.z, -half, half);
  });

  return (
    <group ref={root} position={[arena.x, 0, arena.z]}>
      <group ref={body}>
        {id === "bear" && <RottingBearMesh />}
        {id === "ogre" && <OgreMesh />}
        {id === "hollow" && (
          <group scale={1.05}>
            <TreantMesh
              leftEye={{ current: null }}
              rightEye={{ current: null }}
              leftArm={{ current: null }}
              rightArm={{ current: null }}
              leftLeg={{ current: null }}
              rightLeg={{ current: null }}
              head={{ current: null }}
            />
          </group>
        )}
      </group>
    </group>
  );
}

/** Antlered white bear: hunched yeti body, crimson cape, bone-red rack. */
function RottingBearMesh() {
  const fur = "#c9c2c0";
  const furDark = "#9a8f90";
  const antler = "#c45a62";
  const cape = "#8a2a3a";
  return (
    <group>
      {/* Hunched torso + rump */}
      <mesh position={[0, 1.22, 0.05]} rotation={[0.55, 0, 0]} castShadow>
        <capsuleGeometry args={[0.62, 1.05, 6, 12]} />
        <meshStandardMaterial color={fur} roughness={0.92} />
      </mesh>
      <mesh position={[0, 1.48, -0.15]} castShadow>
        <sphereGeometry args={[0.7, 12, 10]} />
        <meshStandardMaterial color={fur} roughness={0.9} />
      </mesh>
      <mesh position={[0, 1.05, -0.75]} castShadow>
        <sphereGeometry args={[0.58, 12, 10]} />
        <meshStandardMaterial color={furDark} roughness={0.92} />
      </mesh>

      {/* Crimson cape over the back */}
      <mesh position={[0.02, 1.72, -0.05]} rotation={[0.85, 0.15, -0.35]} castShadow>
        <boxGeometry args={[0.95, 0.06, 1.15]} />
        <meshStandardMaterial color={cape} roughness={0.7} />
      </mesh>
      <mesh position={[-0.15, 1.35, -0.55]} rotation={[0.4, 0.4, -0.2]}>
        <boxGeometry args={[0.55, 0.04, 0.7]} />
        <meshStandardMaterial color="#6e2030" roughness={0.75} />
      </mesh>

      {/* Antler rack — a few branching tines, pink-red like the reference */}
      <group position={[0.05, 1.95, -0.05]}>
        <mesh position={[0, 0.35, 0]} rotation={[0.15, 0.2, 0.12]} castShadow>
          <capsuleGeometry args={[0.055, 0.85, 4, 6]} />
          <meshStandardMaterial color={antler} roughness={0.55} />
        </mesh>
        <mesh position={[-0.12, 0.55, 0.05]} rotation={[0.05, 0, 0.55]} castShadow>
          <capsuleGeometry args={[0.04, 0.55, 3, 6]} />
          <meshStandardMaterial color={antler} roughness={0.55} />
        </mesh>
        <mesh position={[0.18, 0.72, -0.02]} rotation={[-0.1, 0, -0.45]} castShadow>
          <capsuleGeometry args={[0.038, 0.62, 3, 6]} />
          <meshStandardMaterial color="#d46a70" roughness={0.55} />
        </mesh>
        <mesh position={[-0.28, 0.85, 0.08]} rotation={[0.2, 0, 0.7]} castShadow>
          <capsuleGeometry args={[0.03, 0.42, 3, 5]} />
          <meshStandardMaterial color="#b85058" roughness={0.55} />
        </mesh>
        <mesh position={[0.32, 1.05, 0]} rotation={[-0.15, 0, -0.35]} castShadow>
          <capsuleGeometry args={[0.028, 0.38, 3, 5]} />
          <meshStandardMaterial color="#d46a70" roughness={0.55} />
        </mesh>
        <mesh position={[0.08, 0.22, 0.08]}>
          <sphereGeometry args={[0.08, 6, 5]} />
          <meshStandardMaterial color="#6a8a4a" roughness={0.8} />
        </mesh>
      </group>

      {/* Fore and hind legs */}
      {[
        [-0.42, 0.78, 0.62],
        [0.42, 0.78, 0.62],
        [-0.4, 0.72, -0.72],
        [0.4, 0.72, -0.72],
      ].map((p, i) => (
        <group key={i} position={p as [number, number, number]}>
          <mesh rotation={[0.15, 0, i < 2 ? 0.12 * (i === 0 ? -1 : 1) : 0]} castShadow>
            <capsuleGeometry args={[0.2, 0.52, 4, 8]} />
            <meshStandardMaterial color={fur} roughness={0.92} />
          </mesh>
          <mesh position={[0, -0.4, 0.14]} rotation={[0.35, 0, 0]} castShadow>
            <boxGeometry args={[0.26, 0.12, 0.38]} />
            <meshStandardMaterial color="#d8d0ce" roughness={0.85} />
          </mesh>
          {[-0.08, 0, 0.08].map((x) => (
            <mesh key={x} position={[x, -0.46, 0.3]} rotation={[0.8, 0, 0]}>
              <coneGeometry args={[0.018, 0.1, 4]} />
              <meshStandardMaterial color="#e8e2dc" roughness={0.4} />
            </mesh>
          ))}
        </group>
      ))}

      {/* Head: short snout, fangs, ears */}
      <group position={[0, 1.12, 1.12]} rotation={[0.15, 0, 0]}>
        <mesh castShadow>
          <sphereGeometry args={[0.32, 12, 10]} />
          <meshStandardMaterial color="#ded8d6" roughness={0.75} />
        </mesh>
        <mesh position={[0, -0.04, 0.22]} scale={[0.85, 0.7, 1]} castShadow>
          <sphereGeometry args={[0.2, 10, 8]} />
          <meshStandardMaterial color="#ece6e4" roughness={0.7} />
        </mesh>
        <mesh position={[-0.18, 0.18, 0.04]} rotation={[0, 0, 0.4]}>
          <coneGeometry args={[0.07, 0.16, 5]} />
          <meshStandardMaterial color="#f2eeec" roughness={0.8} />
        </mesh>
        <mesh position={[0.18, 0.18, 0.04]} rotation={[0, 0, -0.4]}>
          <coneGeometry args={[0.07, 0.16, 5]} />
          <meshStandardMaterial color="#f2eeec" roughness={0.8} />
        </mesh>
        <mesh position={[-0.1, 0.06, 0.26]}>
          <sphereGeometry args={[0.035, 8, 6]} />
          <meshStandardMaterial color="#1a0c0c" emissive="#5a1010" emissiveIntensity={0.5} />
        </mesh>
        <mesh position={[0.1, 0.06, 0.26]}>
          <sphereGeometry args={[0.035, 8, 6]} />
          <meshStandardMaterial color="#1a0c0c" emissive="#5a1010" emissiveIntensity={0.5} />
        </mesh>
        <mesh position={[0, -0.06, 0.34]}>
          <boxGeometry args={[0.16, 0.06, 0.08]} />
          <meshStandardMaterial color="#2a1818" />
        </mesh>
        {[-0.045, 0.045].map((x) => (
          <mesh key={x} position={[x, -0.1, 0.38]} rotation={[2.4, 0, 0]}>
            <coneGeometry args={[0.016, 0.09, 4]} />
            <meshStandardMaterial color="#f4f0ea" />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/** Horned marsh ogre with a branch club and shoulder spikes. */
function OgreMesh() {
  return (
    <group>
      <mesh position={[0, 1.55, 0.12]} rotation={[0.18, 0, 0]} castShadow>
        <capsuleGeometry args={[0.48, 0.85, 6, 12]} />
        <meshStandardMaterial color="#c2b0a4" roughness={0.88} />
      </mesh>
      <mesh position={[0, 1.05, 0.05]} castShadow>
        <sphereGeometry args={[0.42, 12, 10]} />
        <meshStandardMaterial color="#a89888" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.82, 0.08]}>
        <torusGeometry args={[0.28, 0.035, 6, 14]} />
        <meshStandardMaterial color="#4a3a28" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.62, 0.1]}>
        <boxGeometry args={[0.55, 0.28, 0.2]} />
        <meshStandardMaterial color="#3a2e22" roughness={0.95} />
      </mesh>
      <group position={[0, 2.15, 0.28]}>
        <mesh castShadow>
          <sphereGeometry args={[0.32, 14, 12]} />
          <meshStandardMaterial color="#d2c2b4" roughness={0.7} />
        </mesh>
        <mesh position={[0, 0.28, -0.02]}>
          <coneGeometry args={[0.05, 0.22, 6]} />
          <meshStandardMaterial color="#c8b8a8" />
        </mesh>
        {[-0.1, 0.1].map((x) => (
          <mesh key={x} position={[x, 0.06, 0.26]}>
            <sphereGeometry args={[0.035, 8, 6]} />
            <meshStandardMaterial color="#2a1810" emissive="#5a2010" emissiveIntensity={0.4} />
          </mesh>
        ))}
        <mesh position={[0, -0.06, 0.28]}>
          <boxGeometry args={[0.16, 0.05, 0.06]} />
          <meshStandardMaterial color="#4a2018" />
        </mesh>
      </group>
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh position={[side * 0.42, 1.95, 0]} castShadow>
            <sphereGeometry args={[0.16, 8, 6]} />
            <meshStandardMaterial color="#b8a898" />
          </mesh>
          {[0.15, 0.28, 0.4].map((h, i) => (
            <mesh key={i} position={[side * (0.5 + i * 0.02), 2.05 + h * 0.35, -0.05]} rotation={[0.3, 0, side * 0.4]}>
              <coneGeometry args={[0.04, 0.16, 4]} />
              <meshStandardMaterial color="#c8b8ac" />
            </mesh>
          ))}
          <mesh position={[side * 0.55, 1.25, 0.15]} rotation={[0.3, 0, side * 0.25]} castShadow>
            <capsuleGeometry args={[0.11, 0.7, 4, 8]} />
            <meshStandardMaterial color="#c2b0a4" />
          </mesh>
        </group>
      ))}
      <group position={[0.7, 1.15, 0.35]} rotation={[0.2, 0, -0.4]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.07, 0.1, 1.35, 7]} />
          <meshStandardMaterial color="#5a4030" roughness={0.95} />
        </mesh>
        <mesh position={[0, 0.75, 0]}>
          <sphereGeometry args={[0.18, 7, 6]} />
          <meshStandardMaterial color="#6a4a36" />
        </mesh>
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[Math.sin(i) * 0.12, 0.85, Math.cos(i) * 0.12]} rotation={[0.6, i, 0]}>
            <coneGeometry args={[0.03, 0.28, 4]} />
            <meshStandardMaterial color="#4a3828" />
          </mesh>
        ))}
      </group>
      {[-1, 1].map((side) => (
        <group key={`leg-${side}`} position={[side * 0.22, 0.7, 0]}>
          <mesh position={[0, -0.15, 0]} castShadow>
            <capsuleGeometry args={[0.14, 0.55, 4, 8]} />
            <meshStandardMaterial color="#b8a898" />
          </mesh>
          <mesh position={[0, -0.55, 0.1]} rotation={[0.2, 0, 0]} castShadow>
            <boxGeometry args={[0.22, 0.12, 0.34]} />
            <meshStandardMaterial color="#c8b8a8" />
          </mesh>
        </group>
      ))}
    </group>
  );
}
