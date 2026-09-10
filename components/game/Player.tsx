"use client";

import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { CharacterModel } from "@/components/game/CharacterModel";
import { audio } from "@/lib/audio";
import { MODIFIERS, SKILLS, keyBiomeUnlocked, modifierFits, type ModifierId, type SkillId } from "@/lib/gameData";
import { runtime, useGameStore, canOpenBoss, canPassArena, type Character } from "@/lib/store";
import {
  GATE_POSITION,
  TALISMANS,
  WORLD_HALF,
  arenaAt,
  biomeAt,
  nearAltar,
  resolveLockedArenas,
  resolveWorldCollision,
  safeHouseAt,
} from "@/lib/world-data";

const WALK_SPEED = 4.1;
const SPRINT_SPEED = 7.2;
const CAMERA_DISTANCE = 4.3;
const GRAVITY = 24;
const JUMP_VELOCITY = 8.2;

function cycleModifier(skill: SkillId): void {
  const store = useGameStore.getState();
  const def = SKILLS[skill];
  if (!def) return;
  const fitted = store.ownedModifiers.filter((id) => modifierFits(MODIFIERS[id], def));
  if (fitted.length === 0) return;
  const current = store.loadout[skill] ?? [];
  const last = current[current.length - 1];
  const idx = last ? fitted.indexOf(last) : -1;
  const next = fitted[(idx + 1) % fitted.length] as ModifierId;
  store.slotModifier(skill, next);
}

function lerpAngle(from: number, to: number, t: number): number {
  let diff = (to - from) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return from + diff * t;
}

export function Player({ character }: { character: Character }) {
  const root = useRef<THREE.Group>(null);
  const model = useRef<THREE.Group>(null);
  const speedRef = useRef(0);
  const heading = useRef(Math.PI);
  const keys = useRef<Set<string>>(new Set());
  const flashlight = useRef<THREE.SpotLight>(null);
  const flashTarget = useRef<THREE.Object3D>(null);
  const velocityY = useRef(0);
  const grounded = useRef(true);
  const camDist = useRef(CAMERA_DISTANCE);
  const picked = useRef<Set<number>>(new Set());
  const grabbed = useRef<Set<number>>(new Set());
  const looted = useRef<Set<string>>(new Set());
  const fused = useRef<Set<string>>(new Set());
  const enteredArena = useRef<Set<string>>(new Set());

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "Tab") e.preventDefault();
      const store = useGameStore.getState();
      if (e.code === "Tab") {
        const next = !store.skillMenuOpen;
        store.setSkillMenuOpen(next);
        keys.current.clear();
        if (next && document.pointerLockElement) document.exitPointerLock();
        return;
      }
      if (e.code === "Escape" && store.skillMenuOpen) {
        store.setSkillMenuOpen(false);
        return;
      }
      if (store.skillMenuOpen) return;
      keys.current.add(e.code);
      const skillKeys: Record<string, number> = {
        Digit1: 0,
        Digit2: 1,
        Digit3: 2,
        Digit4: 3,
        Digit5: 4,
        Digit6: 5,
      };
      if (e.code in skillKeys) {
        const skill = store.unlockedSkills[skillKeys[e.code]];
        if (skill) store.setActiveSkill(skill);
      }
      if (e.code === "KeyE") runtime.fireClicked = true;
      if (e.code === "KeyR") store.levelSkill(store.activeSkill);
      if (e.code === "KeyT") cycleModifier(store.activeSkill);
      if (e.code === "KeyF") {
        const altar = nearAltar(runtime.playerX, runtime.playerZ);
        if (altar && !fused.current.has(altar.id) && store.fuseAtAltar()) {
          fused.current.add(altar.id);
          audio.powerup();
        }
      }
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.code);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  useEffect(() => {
    if (flashlight.current && flashTarget.current) {
      flashlight.current.target = flashTarget.current;
    }
  }, []);

  useFrame((state, delta) => {
    const group = root.current;
    if (!group) return;
    const store = useGameStore.getState();
    if (store.phase !== "playing") return;
    const paused = runtime.paused;

    const dt = Math.min(delta, 0.05);
    const k = keys.current;

    let move = new THREE.Vector2(0, 0);
    if (!paused) {
      const forwardInput =
        (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0) -
        (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0);
      const rightInput =
        (k.has("KeyD") || k.has("ArrowRight") ? 1 : 0) -
        (k.has("KeyA") || k.has("ArrowLeft") ? 1 : 0);

      const yaw = runtime.camYaw;
      const forward = new THREE.Vector2(-Math.sin(yaw), -Math.cos(yaw));
      const right = new THREE.Vector2(Math.cos(yaw), -Math.sin(yaw));
      move = forward.multiplyScalar(forwardInput).add(right.multiplyScalar(rightInput));
    }

    const { stats } = store;
    const moving = move.lengthSq() > 0.001;
    const wantsSprint = k.has("ShiftLeft") || k.has("ShiftRight");
    const sprinting = moving && wantsSprint && runtime.stamina > 1 && grounded.current;

    // Bigger stamina pools also refill a little faster.
    const regen = 12 * (0.7 + (stats.maxStamina / 100) * 0.3);
    if (sprinting) {
      runtime.stamina = Math.max(0, runtime.stamina - 20 * dt);
    } else {
      runtime.stamina = Math.min(stats.maxStamina, runtime.stamina + regen * dt);
    }
    runtime.sprinting = sprinting;

    const targetSpeed = moving ? (sprinting ? SPRINT_SPEED : WALK_SPEED) * stats.speed : 0;
    speedRef.current = THREE.MathUtils.lerp(speedRef.current, targetSpeed, 1 - Math.exp(-10 * dt));

    if (!paused && grounded.current && k.has("Space")) {
      velocityY.current = JUMP_VELOCITY;
      grounded.current = false;
    }

    let nx = group.position.x;
    let nz = group.position.z;
    if (moving) {
      move.normalize();
      const air = grounded.current ? 1 : 0.85;
      const resolved = resolveWorldCollision(
        nx + move.x * speedRef.current * air * dt,
        nz + move.y * speedRef.current * air * dt,
        0.35
      );
      const unlocked = {
        bear: canPassArena(store, "bear"),
        ogre: canPassArena(store, "ogre"),
        hollow: canPassArena(store, "hollow"),
      };
      const gated = resolveLockedArenas(resolved.x, resolved.z, 0.35, unlocked);
      nx = THREE.MathUtils.clamp(gated.x, -(WORLD_HALF - 2), WORLD_HALF - 2);
      nz = THREE.MathUtils.clamp(gated.z, -(WORLD_HALF - 2), WORLD_HALF - 2);

      const targetHeading = Math.atan2(move.x, move.y);
      heading.current = lerpAngle(heading.current, targetHeading, 1 - Math.exp(-12 * dt));
      if (model.current) model.current.rotation.y = heading.current;
    }

    // House floors and porches are raised, so the "ground" follows them.
    const shelter = safeHouseAt(nx, nz);
    const safe = shelter !== null;
    const floorY = shelter ? shelter.floorY : 0;
    velocityY.current -= GRAVITY * dt;
    let nextY = group.position.y + velocityY.current * dt;
    if (nextY <= floorY) {
      nextY = floorY;
      velocityY.current = 0;
      grounded.current = true;
    }
    group.position.set(nx, nextY, nz);

    runtime.playerX = nx;
    runtime.playerZ = nz;
    runtime.playerSafe = safe;
    runtime.biome = biomeAt(nx, nz);

    // Health: quick recovery in shelter, a trickle outside.
    if (!paused && runtime.health > 0) {
      const heal = safe ? 5 : 0.5;
      runtime.health = Math.min(stats.maxHealth, runtime.health + heal * dt);
    }
    if (!paused && safe && runtime.corruption > 0) {
      runtime.corruption = Math.max(0, runtime.corruption - 8 * dt);
    }
    const shrine = nearAltar(nx, nz);
    runtime.nearAltarId = shrine?.id ?? null;
    runtime.hitFlash = Math.max(0, runtime.hitFlash - dt * 1.8);

    const inside = arenaAt(nx, nz);
    if (
      inside &&
      canOpenBoss(store, inside.bossId) &&
      !store.arenasOpened.includes(inside.bossId) &&
      !enteredArena.current.has(inside.bossId)
    ) {
      enteredArena.current.add(inside.bossId);
      audio.powerup();
      queueMicrotask(() => useGameStore.getState().enterArena(inside.bossId));
    }

    // Powerup pickup — deferred like talismans so React never reconciles mid-frame.
    const powerups = store.powerups;
    for (let i = 0; i < powerups.length; i++) {
      if (grabbed.current.has(i) || store.powerupsTaken.includes(i)) continue;
      const dx = nx - powerups[i].x;
      const dz = nz - powerups[i].z;
      if (dx * dx + dz * dz < 1.6 * 1.6) {
        grabbed.current.add(i);
        audio.powerup();
        queueMicrotask(() => useGameStore.getState().takePowerup(i));
      }
    }

    const loot = store.powerLoot;
    for (let i = 0; i < loot.length; i++) {
      const item = loot[i];
      if (looted.current.has(item.id) || store.lootTaken.includes(item.id)) continue;
      if (item.kind === "keyPiece" && !keyBiomeUnlocked(item.biome, store.bossesDefeated)) continue;
      const dx = nx - item.x;
      const dz = nz - item.z;
      if (dx * dx + dz * dz < 1.5 * 1.5) {
        looted.current.add(item.id);
        audio.powerup();
        queueMicrotask(() => useGameStore.getState().takeLoot(item.id));
      }
    }

    // Talisman pickup — defer zustand so React never reconciles mid-frame.
    for (let i = 0; i < TALISMANS.length; i++) {
      if (picked.current.has(i) || store.collected.includes(i)) continue;
      const dx = group.position.x - TALISMANS[i].x;
      const dz = group.position.z - TALISMANS[i].z;
      if (dx * dx + dz * dz < 1.8 * 1.8) {
        picked.current.add(i);
        audio.collect();
        queueMicrotask(() => useGameStore.getState().collect(i));
      }
    }

    // Escape through the gate once it is open.
    if (store.gateOpen) {
      const dx = group.position.x - GATE_POSITION.x;
      const dz = group.position.z - GATE_POSITION.z;
      if (dx * dx + dz * dz < 2.6 * 2.6) {
        store.win();
        audio.win();
        if (document.pointerLockElement) document.exitPointerLock();
      }
    }

    // Third-person camera rig.
    const yaw = runtime.camYaw;
    const pitch = runtime.camPitch;
    const indoors = runtime.playerSafe;
    const targetDist = indoors ? 2.2 : CAMERA_DISTANCE;
    camDist.current = THREE.MathUtils.lerp(camDist.current, targetDist, 1 - Math.exp(-4.5 * dt));
    const dist = camDist.current;
    const pitchScale = indoors ? 0.28 : 1;
    const cosPitch = Math.cos(pitch * pitchScale);
    const camX = group.position.x + Math.sin(yaw) * dist * cosPitch;
    // Child-height framing: camera sits just above the survivor's head.
    const camY = group.position.y + (indoors ? 1.15 : 1.1) + Math.sin(pitch * pitchScale) * dist;
    const camZ = group.position.z + Math.cos(yaw) * dist * cosPitch;
    state.camera.position.set(camX, camY, camZ);
    state.camera.lookAt(group.position.x, group.position.y + (indoors ? 0.95 : 1.05), group.position.z);
  });

  return (
    <group ref={root}>
      <group ref={model} rotation={[0, Math.PI, 0]}>
        <CharacterModel character={character} speedRef={speedRef} />
        {/* Flashlight held at the child's hand height, with a visible volume cone. */}
        <spotLight
          ref={flashlight}
          position={[0.17, 0.62, 0.22]}
          angle={0.78}
          penumbra={0.28}
          intensity={360}
          distance={38}
          decay={1.1}
          color="#fff1c4"
        />
        <object3D ref={flashTarget} position={[0, 0.45, 14]} />
        <mesh position={[0.17, 0.6, 0.16]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.03, 0.026, 0.16, 10]} />
          <meshStandardMaterial color="#2a2a2e" roughness={0.5} metalness={0.5} />
        </mesh>
        <mesh position={[0.17, 0.58, 5.1]} rotation={[Math.PI / 2 - 0.02, 0, 0]}>
          <coneGeometry args={[3.6, 10.5, 18, 1, true]} />
          <meshBasicMaterial
            color="#ffe7b0"
            transparent
            opacity={0.11}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
        <pointLight
          position={[0, 1.0, 2.4]}
          intensity={18}
          distance={14}
          decay={1.4}
          color="#ffe6b0"
        />
      </group>
      {/* Faint personal glow so the survivor is always readable. */}
      <pointLight position={[0, 1.4, 0]} intensity={4.5} distance={8} decay={2} color="#c8d4ea" />
    </group>
  );
}
