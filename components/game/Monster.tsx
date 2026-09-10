"use client";

import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { audio } from "@/lib/audio";
import { applyPlayerDamage } from "@/lib/combat";
import { useBarkTexture, useFoliageTexture } from "@/lib/proc-textures";
import { runtime, useGameStore } from "@/lib/store";
import { MONSTER_SPAWN, WORLD_HALF, excludeFromHouses } from "@/lib/world-data";

const GRACE_SECONDS = 8;
/** How long the Hollow One keeps its distance after the survivor takes shelter. */
const RETREAT_SECONDS = 22;
const RETREAT_MIN = 42;
const RETREAT_MAX = 60;
/** Melee: how close it must be, how often it swings, and raw damage before armor. */
const STRIKE_RANGE = 1.9;
const STRIKE_INTERVAL = 1.15;
const STRIKE_DAMAGE = 34;

function pickFarPoint(px: number, pz: number, fromX: number, fromZ: number): { x: number; z: number } {
  // Bias the retreat away from the player, with some randomness so it wanders.
  const away = Math.atan2(fromZ - pz, fromX - px) + (Math.random() - 0.5) * 1.4;
  const distAway = RETREAT_MIN + Math.random() * (RETREAT_MAX - RETREAT_MIN);
  const limit = WORLD_HALF - 4;
  return {
    x: THREE.MathUtils.clamp(px + Math.cos(away) * distAway, -limit, limit),
    z: THREE.MathUtils.clamp(pz + Math.sin(away) * distAway, -limit, limit),
  };
}

/**
 * "The Hollow One" — a tall wraith that stalks the forest edge,
 * then hunts when it senses the survivor. It grows faster and more
 * perceptive with every talisman taken.
 */
export function Monster() {
  const root = useRef<THREE.Group>(null);
  const bodyGroup = useRef<THREE.Group>(null);
  const leftEye = useRef<THREE.Mesh>(null);
  const rightEye = useRef<THREE.Mesh>(null);
  const huntLight = useRef<THREE.PointLight>(null);
  const mood = useRef<"stalk" | "hunt">("stalk");
  const stalkAngle = useRef(Math.PI * 0.75);
  const relocateAt = useRef(14);
  const startedAt = useRef<number | null>(null);
  const wander = useRef({ x: MONSTER_SPAWN.x, z: MONSTER_SPAWN.z });
  const wasSafe = useRef(false);
  const retreatUntil = useRef(0);
  const nextWanderAt = useRef(0);
  const facing = useRef(0);
  const leftArm = useRef<THREE.Group>(null);
  const rightArm = useRef<THREE.Group>(null);
  const leftLeg = useRef<THREE.Group>(null);
  const rightLeg = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const lastPos = useRef({ x: MONSTER_SPAWN.x, z: MONSTER_SPAWN.z });
  const gait = useRef(0);
  const stride = useRef(0);
  const nextStrikeAt = useRef(0);

  useFrame((state, delta) => {
    const group = root.current;
    if (!group) return;
    const store = useGameStore.getState();
    if (store.phase !== "playing") return;
    const paused = runtime.paused;
    const dt = Math.min(delta, 0.05);
    const t = state.clock.elapsedTime;
    if (startedAt.current === null) startedAt.current = t;
    const elapsed = t - startedAt.current;

    const px = runtime.playerX;
    const pz = runtime.playerZ;
    const dx = px - group.position.x;
    const dz = pz - group.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    runtime.monsterDistance = dist;

    const talismans = store.collected.length;

    let faceTarget: { x: number; z: number } | null = null;

    if (!paused) {
      // --- Decide mood ---
      const detectRadius =
        14 + talismans * 1.6 + (runtime.sprinting ? 7 : 0);
      const graceOver = elapsed > GRACE_SECONDS;
      const safe = runtime.playerSafe;

      if (safe && !wasSafe.current) {
        // Survivor just reached shelter: give up the chase and leave.
        if (mood.current === "hunt") {
          audio.stopHuntPresence();
        }
        mood.current = "stalk";
        runtime.monsterMood = "stalk";
        retreatUntil.current = t + RETREAT_SECONDS;
        wander.current = pickFarPoint(px, pz, group.position.x, group.position.z);
        nextWanderAt.current = t + 6;
      }
      wasSafe.current = safe;

      // Leaving early and walking straight into it ends the truce.
      if (!safe && dist < 7 && retreatUntil.current > t) {
        retreatUntil.current = 0;
      }
      const retreating = safe || t < retreatUntil.current;

      if (retreating) {
        const tx = wander.current.x - group.position.x;
        const tz = wander.current.z - group.position.z;
        const td = Math.sqrt(tx * tx + tz * tz);
        if (td > 1.5) {
          // Hurry while close to the shelter, amble once far away.
          const speed = dist < 24 ? 4.6 : 2.4;
          group.position.x += (tx / td) * speed * dt;
          group.position.z += (tz / td) * speed * dt;
          faceTarget = wander.current;
        } else if (t > nextWanderAt.current) {
          wander.current = pickFarPoint(px, pz, group.position.x, group.position.z);
          nextWanderAt.current = t + 5 + Math.random() * 6;
        }
      } else {
        if (mood.current === "stalk" && graceOver && dist < detectRadius) {
          mood.current = "hunt";
          runtime.monsterMood = "hunt";
          audio.huntSting();
        } else if (mood.current === "hunt" && dist > 42) {
          mood.current = "stalk";
          runtime.monsterMood = "stalk";
          stalkAngle.current = Math.random() * Math.PI * 2;
          audio.stopHuntPresence();
        }

        if (mood.current === "hunt") {
          const speed = 4.7 + talismans * 0.22;
          const inv = dist > 0.001 ? 1 / dist : 0;
          // Stop just short so it claws at you instead of standing inside you.
          if (dist > 1.1) {
            group.position.x += dx * inv * speed * dt;
            group.position.z += dz * inv * speed * dt;
          }

          if (dist < STRIKE_RANGE && t > nextStrikeAt.current) {
            nextStrikeAt.current = t + STRIKE_INTERVAL;
            applyPlayerDamage(STRIKE_DAMAGE);
            if (runtime.health <= 0) {
              store.die();
              audio.death();
              runtime.paused = true;
            } else {
              audio.hurt();
            }
          }
        } else {
          stalkAngle.current += dt * 0.14;
          const orbit = 26;
          const targetX = px + Math.cos(stalkAngle.current) * orbit;
          const targetZ = pz + Math.sin(stalkAngle.current) * orbit;
          const tx = targetX - group.position.x;
          const tz = targetZ - group.position.z;
          const td = Math.sqrt(tx * tx + tz * tz);
          if (td > 0.5) {
            const speed = 2.4;
            group.position.x += (tx / td) * speed * dt;
            group.position.z += (tz / td) * speed * dt;
          }
          if (t > relocateAt.current) {
            relocateAt.current = t + 11 + Math.random() * 9;
            if (dist > 30) {
              const angle = Math.random() * Math.PI * 2;
              group.position.x = px + Math.cos(angle) * 27;
              group.position.z = pz + Math.sin(angle) * 27;
            }
          }
        }
      }

      const keptOut = excludeFromHouses(group.position.x, group.position.z, 1.35);
      group.position.x = keptOut.x;
      group.position.z = keptOut.z;

      const half = WORLD_HALF - 1;
      group.position.x = THREE.MathUtils.clamp(group.position.x, -half, half);
      group.position.z = THREE.MathUtils.clamp(group.position.z, -half, half);
    }

    // --- Fear: proximity + hunting bonus, smoothed ---
    const proximityFear = THREE.MathUtils.clamp(1 - dist / 32, 0, 1);
    const targetFear = runtime.playerSafe
      ? 0.08
      : THREE.MathUtils.clamp(
          proximityFear * 0.75 + (mood.current === "hunt" ? 0.45 : 0),
          0,
          1
        );
    runtime.fear = THREE.MathUtils.lerp(runtime.fear, targetFear, 1 - Math.exp(-2 * dt));
    audio.setFear(runtime.fear);

    // --- Presentation ---
    const moved = Math.hypot(group.position.x - lastPos.current.x, group.position.z - lastPos.current.z);
    lastPos.current.x = group.position.x;
    lastPos.current.z = group.position.z;
    const speedNow = dt > 0 ? moved / dt : 0;
    gait.current = THREE.MathUtils.lerp(gait.current, Math.min(1, speedNow / 4.5), 1 - Math.exp(-5 * dt));
    stride.current += dt * (1.6 + speedNow * 0.9);
    const swing = Math.sin(stride.current) * gait.current;

    if (bodyGroup.current) {
      bodyGroup.current.position.y = Math.sin(t * 1.7) * 0.06 + Math.abs(Math.sin(stride.current)) * gait.current * 0.1;
      bodyGroup.current.rotation.z = Math.sin(t * 1.1) * 0.04 + swing * 0.05;
    }
    if (leftLeg.current) leftLeg.current.rotation.x = swing * 0.5;
    if (rightLeg.current) rightLeg.current.rotation.x = -swing * 0.5;
    // Arms drag behind the stride; when hunting they rake forward.
    const reach = mood.current === "hunt" ? -0.35 : 0;
    if (leftArm.current) leftArm.current.rotation.x = -swing * 0.32 + reach + Math.sin(t * 1.3) * 0.04;
    if (rightArm.current) rightArm.current.rotation.x = swing * 0.32 + reach + Math.cos(t * 1.1) * 0.04;
    if (head.current) {
      head.current.rotation.z = Math.sin(t * 0.9) * 0.12;
      head.current.rotation.x = mood.current === "hunt" ? -0.25 : 0.12 + Math.sin(t * 0.6) * 0.08;
    }
    const lookX = faceTarget ? faceTarget.x - group.position.x : dx;
    const lookZ = faceTarget ? faceTarget.z - group.position.z : dz;
    if (lookX * lookX + lookZ * lookZ > 0.0001) {
      const desired = Math.atan2(lookX, lookZ);
      let diff = (desired - facing.current) % (Math.PI * 2);
      if (diff > Math.PI) diff -= Math.PI * 2;
      if (diff < -Math.PI) diff += Math.PI * 2;
      facing.current += diff * (1 - Math.exp(-6 * dt));
      group.rotation.y = facing.current;
    }
    const eyePulse = 1.6 + Math.sin(t * (mood.current === "hunt" ? 14 : 3)) * 0.8;
    const eyeMatL = leftEye.current?.material;
    const eyeMatR = rightEye.current?.material;
    if (eyeMatL instanceof THREE.MeshStandardMaterial) eyeMatL.emissiveIntensity = eyePulse;
    if (eyeMatR instanceof THREE.MeshStandardMaterial) eyeMatR.emissiveIntensity = eyePulse;
    if (huntLight.current) {
      huntLight.current.intensity = mood.current === "hunt" ? 4 + Math.sin(t * 10) * 1.5 : 0.6;
    }
  });

  return (
    <group ref={root} position={[MONSTER_SPAWN.x, 0, MONSTER_SPAWN.z]}>
      <group ref={bodyGroup}>
        <TreantMesh
          leftEye={leftEye}
          rightEye={rightEye}
          leftArm={leftArm}
          rightArm={rightArm}
          leftLeg={leftLeg}
          rightLeg={rightLeg}
          head={head}
        />
        <pointLight ref={huntLight} position={[0, 3.3, 0.7]} color="#ff5a1a" distance={9} decay={2} intensity={0.6} />
      </group>
    </group>
  );
}

type Vec3 = [number, number, number];

/** Tapered limb segment between two points (cylinder aligned to the segment). */
function Limb({
  from,
  to,
  r0,
  r1,
  material,
}: {
  from: Vec3;
  to: Vec3;
  r0: number;
  r1: number;
  material: THREE.Material;
}) {
  const { position, quaternion, length } = useMemo(() => {
    const a = new THREE.Vector3(...from);
    const b = new THREE.Vector3(...to);
    const dir = b.clone().sub(a);
    const len = dir.length();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    return { position: a.add(b).multiplyScalar(0.5), quaternion: q, length: len };
  }, [from, to]);
  return (
    <mesh position={position} quaternion={quaternion} material={material} castShadow>
      <cylinderGeometry args={[r1, r0, length, 7]} />
    </mesh>
  );
}

/** Splayed root tendrils used for hands, feet, and the antler crown. */
function Roots({
  position,
  count,
  length,
  radius,
  pitch,
  spread,
  material,
  phase = 0,
}: {
  position: Vec3;
  count: number;
  length: number;
  radius: number;
  /** Angle from vertical: ~1.75 lays them flat on the ground, ~0.4 points them upward. */
  pitch: number;
  spread: number;
  material: THREE.Material;
  phase?: number;
}) {
  return (
    <group position={position}>
      {Array.from({ length: count }, (_, i) => {
        const a = phase + (i / count) * spread - spread / 2;
        return (
          <group key={i} rotation={[0, a, 0]}>
            <mesh
              position={[0, Math.cos(pitch) * length * 0.5, Math.sin(pitch) * length * 0.5]}
              rotation={[pitch, 0, 0]}
              material={material}
              castShadow
            >
              <coneGeometry args={[radius, length, 5]} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

/**
 * The Hollow One: a gaunt tree-spirit. Hunched trunk-like torso, arms so
 * long the root-hands drag on the ground, spindly legs ending in roots,
 * a crown of antler branches, and moss clumps sprouting from its back.
 */
export function TreantMesh({
  leftEye,
  rightEye,
  leftArm,
  rightArm,
  leftLeg,
  rightLeg,
  head,
}: {
  leftEye: RefObject<THREE.Mesh | null>;
  rightEye: RefObject<THREE.Mesh | null>;
  leftArm: RefObject<THREE.Group | null>;
  rightArm: RefObject<THREE.Group | null>;
  leftLeg: RefObject<THREE.Group | null>;
  rightLeg: RefObject<THREE.Group | null>;
  head: RefObject<THREE.Group | null>;
}) {
  const barkTex = useBarkTexture();
  const foliageTex = useFoliageTexture();
  const mats = useMemo(
    () => ({
      bark: new THREE.MeshStandardMaterial({ map: barkTex, color: "#9a7a58", roughness: 0.96 }),
      darkBark: new THREE.MeshStandardMaterial({ map: barkTex, color: "#5a4632", roughness: 0.98 }),
      moss: new THREE.MeshStandardMaterial({
        map: foliageTex,
        color: "#4f7a3a",
        roughness: 0.92,
        flatShading: true,
      }),
      mouth: new THREE.MeshStandardMaterial({ color: "#120806", roughness: 1 }),
    }),
    [barkTex, foliageTex]
  );
  useEffect(() => {
    return () => {
      Object.values(mats).forEach((m) => m.dispose());
    };
  }, [mats]);

  const hip: Vec3 = [0, 2.05, 0];
  const shoulderL: Vec3 = [-0.55, 3.0, 0.32];
  const shoulderR: Vec3 = [0.55, 3.0, 0.32];

  return (
    <group>
      {/* Torso: hunched trunk leaning forward */}
      <mesh position={[0, 2.55, 0.14]} rotation={[-0.42, 0, 0]} material={mats.bark} castShadow>
        <capsuleGeometry args={[0.34, 0.95, 6, 14]} />
      </mesh>
      <mesh position={[0, 2.05, 0]} material={mats.darkBark} castShadow>
        <sphereGeometry args={[0.3, 14, 10]} />
      </mesh>
      {/* Rib ridges */}
      {[0.2, 0.42, 0.64].map((f) => (
        <mesh
          key={f}
          position={[0, 2.25 + f, 0.16 + f * 0.42]}
          rotation={[-0.42, 0, 0]}
          material={mats.darkBark}
        >
          <torusGeometry args={[0.36 - f * 0.05, 0.035, 6, 14, Math.PI]} />
        </mesh>
      ))}

      {/* Moss clumps sprouting from shoulders and back */}
      <mesh position={[-0.5, 3.25, -0.12]} material={mats.moss} castShadow>
        <icosahedronGeometry args={[0.46, 1]} />
      </mesh>
      <mesh position={[0.42, 3.4, -0.2]} material={mats.moss} castShadow>
        <icosahedronGeometry args={[0.4, 1]} />
      </mesh>
      <mesh position={[0, 2.9, -0.5]} material={mats.moss} castShadow>
        <icosahedronGeometry args={[0.52, 1]} />
      </mesh>
      <mesh position={[0.1, 3.55, 0.05]} material={mats.moss}>
        <icosahedronGeometry args={[0.3, 1]} />
      </mesh>

      {/* Head + antler crown */}
      <group ref={head} position={[0, 3.3, 0.55]}>
        <mesh position={[0, 0.1, 0]} scale={[0.85, 1.15, 1]} material={mats.bark} castShadow>
          <sphereGeometry args={[0.3, 16, 12]} />
        </mesh>
        <mesh position={[0, -0.14, 0.14]} rotation={[0.5, 0, 0]} material={mats.darkBark} castShadow>
          <boxGeometry args={[0.3, 0.22, 0.28]} />
        </mesh>
        <mesh position={[0, -0.02, 0.27]} material={mats.mouth}>
          <boxGeometry args={[0.2, 0.09, 0.08]} />
        </mesh>
        {[-0.07, -0.02, 0.03, 0.08].map((tx) => (
          <mesh key={tx} position={[tx, -0.06, 0.31]} rotation={[Math.PI, 0, 0]} material={mats.bark}>
            <coneGeometry args={[0.014, 0.07, 4]} />
          </mesh>
        ))}
        <mesh ref={leftEye} position={[-0.11, 0.14, 0.26]}>
          <sphereGeometry args={[0.045, 12, 10]} />
          <meshStandardMaterial color="#ffe0a0" emissive="#ff6a1a" emissiveIntensity={2.4} roughness={0.25} />
        </mesh>
        <mesh ref={rightEye} position={[0.11, 0.14, 0.26]}>
          <sphereGeometry args={[0.045, 12, 10]} />
          <meshStandardMaterial color="#ffe0a0" emissive="#ff6a1a" emissiveIntensity={2.4} roughness={0.25} />
        </mesh>
        <Roots position={[-0.12, 0.36, -0.05]} count={3} length={0.75} radius={0.035} pitch={0.55} spread={1.1} phase={-1.2} material={mats.darkBark} />
        <Roots position={[0.12, 0.36, -0.05]} count={3} length={0.75} radius={0.035} pitch={0.55} spread={1.1} phase={1.2} material={mats.darkBark} />
        <Roots position={[0, 0.42, -0.1]} count={2} length={0.55} radius={0.03} pitch={0.35} spread={0.8} phase={Math.PI} material={mats.darkBark} />
      </group>

      {/* Arms: pivot at shoulders, root-hands rest on the ground */}
      <group ref={leftArm} position={shoulderL}>
        <mesh material={mats.bark} castShadow>
          <sphereGeometry args={[0.15, 10, 8]} />
        </mesh>
        <Limb from={[0, 0, 0]} to={[-0.35, -1.35, 0.4]} r0={0.13} r1={0.09} material={mats.bark} />
        <Limb from={[-0.35, -1.35, 0.4]} to={[-0.32, -2.7, 0.75]} r0={0.09} r1={0.07} material={mats.bark} />
        <Roots position={[-0.32, -2.72, 0.75]} count={4} length={0.55} radius={0.04} pitch={1.7} spread={2.4} phase={0.3} material={mats.darkBark} />
      </group>
      <group ref={rightArm} position={shoulderR}>
        <mesh material={mats.bark} castShadow>
          <sphereGeometry args={[0.15, 10, 8]} />
        </mesh>
        <Limb from={[0, 0, 0]} to={[0.35, -1.35, 0.4]} r0={0.13} r1={0.09} material={mats.bark} />
        <Limb from={[0.35, -1.35, 0.4]} to={[0.32, -2.7, 0.75]} r0={0.09} r1={0.07} material={mats.bark} />
        <Roots position={[0.32, -2.72, 0.75]} count={4} length={0.55} radius={0.04} pitch={1.7} spread={2.4} phase={-0.3} material={mats.darkBark} />
      </group>

      {/* Legs: pivot at hip, splayed root feet */}
      <group ref={leftLeg} position={hip}>
        <Limb from={[-0.18, 0, 0]} to={[-0.36, -1.05, 0.12]} r0={0.14} r1={0.1} material={mats.bark} />
        <Limb from={[-0.36, -1.05, 0.12]} to={[-0.38, -2.02, -0.05]} r0={0.1} r1={0.12} material={mats.bark} />
        <Roots position={[-0.38, -2.02, -0.05]} count={5} length={0.6} radius={0.05} pitch={1.72} spread={5.2} phase={0.2} material={mats.darkBark} />
      </group>
      <group ref={rightLeg} position={hip}>
        <Limb from={[0.18, 0, 0]} to={[0.36, -1.05, 0.12]} r0={0.14} r1={0.1} material={mats.bark} />
        <Limb from={[0.36, -1.05, 0.12]} to={[0.38, -2.02, -0.05]} r0={0.1} r1={0.12} material={mats.bark} />
        <Roots position={[0.38, -2.02, -0.05]} count={5} length={0.6} radius={0.05} pitch={1.72} spread={5.2} phase={-0.2} material={mats.darkBark} />
      </group>
    </group>
  );
}
