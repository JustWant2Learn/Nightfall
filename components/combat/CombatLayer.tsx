"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { audio } from "@/lib/audio";
import { createArrowGeometry, isSpearBolt } from "@/lib/arrow-geometry";
import { createFireballGeometry, createFireballTexture } from "@/lib/fireball-geometry";
import { combat, stepCombat, tryFireSkill, type SlashKind } from "@/lib/combat";
import {
  createHexGlyphTexture,
  createHookSlashTexture,
  createLoopSlashTexture,
  createRingSlashTexture,
} from "@/lib/skill-fx";
import { runtime, useGameStore } from "@/lib/store";

const dummy = new THREE.Object3D();
const tint = new THREE.Color();
const FORWARD = new THREE.Vector3();
const CAPSULE_AXIS = new THREE.Vector3(0, 1, 0);
const BLADE_ROLL = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
const WHITE = new THREE.Color("#ffffff");

function spearAt(index: number) {
  let n = 0;
  for (let i = 0; i < combat.bolts.length; i++) {
    if (!isSpearBolt(combat.bolts[i].skill)) continue;
    if (n === index) return combat.bolts[i];
    n += 1;
  }
  return combat.bolts[0];
}

function emberAt(index: number) {
  let n = 0;
  for (let i = 0; i < combat.bolts.length; i++) {
    if (isSpearBolt(combat.bolts[i].skill)) continue;
    if (n === index) return combat.bolts[i];
    n += 1;
  }
  return combat.bolts[0];
}

function slashAt(kind: SlashKind, index: number) {
  let n = 0;
  for (let i = 0; i < combat.slashes.length; i++) {
    const s = combat.slashes[i];
    if (s.kind !== kind || s.age < 0) continue;
    if (n === index) return s;
    n += 1;
  }
  return combat.slashes[0];
}

function countSlashes(kind: SlashKind): number {
  let n = 0;
  for (let i = 0; i < combat.slashes.length; i++) {
    if (combat.slashes[i].kind === kind && combat.slashes[i].age >= 0) n += 1;
  }
  return n;
}

function ringAt(index: number) {
  let n = 0;
  for (let i = 0; i < combat.bursts.length; i++) {
    if (!combat.bursts[i].ring) continue;
    if (n === index) return combat.bursts[i];
    n += 1;
  }
  return combat.bursts[0];
}

function instanceCapacity(mesh: THREE.InstancedMesh): number {
  return mesh.instanceMatrix.array.length / 16;
}

function writeInstances(
  mesh: THREE.InstancedMesh | null,
  count: number,
  place: (i: number, obj: THREE.Object3D, color: THREE.Color) => void
): void {
  if (!mesh) return;
  const n = Math.min(count, instanceCapacity(mesh));
  for (let i = 0; i < n; i++) {
    place(i, dummy, tint);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    mesh.setColorAt(i, tint);
  }
  mesh.count = n;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

/**
 * Fires the equipped skill and draws bolts / traps / bursts. Combat state
 * lives outside React so spawning a bolt never remounts the scene.
 */
export function CombatLayer() {
  const arrows = useRef<THREE.InstancedMesh>(null);
  const bolts = useRef<THREE.InstancedMesh>(null);
  const traps = useRef<THREE.InstancedMesh>(null);
  const trapGlow = useRef<THREE.InstancedMesh>(null);
  const hookSlashes = useRef<THREE.InstancedMesh>(null);
  const loopSlashes = useRef<THREE.InstancedMesh>(null);
  const ringSlashes = useRef<THREE.InstancedMesh>(null);
  const bursts = useRef<THREE.InstancedMesh>(null);
  const sparks = useRef<THREE.InstancedMesh>(null);
  const rings = useRef<THREE.InstancedMesh>(null);
  const ward = useRef<THREE.Group>(null);
  const arrowGeo = useMemo(() => createArrowGeometry(), []);
  const fireballGeo = useMemo(() => createFireballGeometry(), []);
  const fireballTex = useMemo(() => createFireballTexture(), []);
  const hookTex = useMemo(() => createHookSlashTexture(), []);
  const loopTex = useMemo(() => createLoopSlashTexture(), []);
  const ringSlashTex = useMemo(() => createRingSlashTexture(), []);
  const hexTex = useMemo(() => createHexGlyphTexture(), []);

  useEffect(() => {
    return () => {
      fireballGeo.dispose();
      fireballTex.dispose();
      hookTex.dispose();
      loopTex.dispose();
      ringSlashTex.dispose();
      hexTex.dispose();
    };
  }, [fireballGeo, fireballTex, hookTex, loopTex, ringSlashTex, hexTex]);

  useFrame((state, delta) => {
    const store = useGameStore.getState();
    if (store.phase !== "playing" || runtime.paused) {
      runtime.charge = 0;
      return;
    }
    const dt = Math.min(delta, 0.05);
    const now = state.clock.elapsedTime;
    const skill = store.activeSkill;
    const mods = store.loadout[skill] ?? [];
    const canCharge =
      mods.includes("supershot") || mods.includes("volleyBurst") || mods.includes("cursedSupershot");

    if (runtime.fireHeld && canCharge) {
      runtime.charge = Math.min(1, runtime.charge + dt / 1.05);
    }

    const heading = runtime.aimYaw;
    let fired = false;
    if (canCharge) {
      if (!runtime.fireHeld && runtime.charge > 0.12) {
        fired = tryFireSkill(now, heading, runtime.playerX, 0, runtime.playerZ);
      }
    } else if (runtime.fireClicked) {
      fired = tryFireSkill(now, heading, runtime.playerX, 0, runtime.playerZ);
    }
    runtime.fireClicked = false;
    if (fired) audio.cast();

    stepCombat(dt);

    let arrowN = 0;
    let boltN = 0;
    for (let i = 0; i < combat.bolts.length; i++) {
      if (isSpearBolt(combat.bolts[i].skill)) arrowN += 1;
      else boltN += 1;
    }
    writeInstances(arrows.current, arrowN, (i, obj, color) => {
      const b = spearAt(i);
      obj.position.set(b.x, b.y, b.z);
      FORWARD.set(b.vx, b.vy, b.vz);
      if (FORWARD.lengthSq() > 0.001) {
        obj.quaternion.setFromUnitVectors(CAPSULE_AXIS, FORWARD.normalize());
        obj.quaternion.multiply(BLADE_ROLL);
      }
      obj.scale.setScalar(1.35);
      if (b.skill === "shadowArrow") color.set(b.color).lerp(WHITE, 0.4);
      else color.setRGB(1, 1, 1);
    });
    writeInstances(bolts.current, boltN, (i, obj, color) => {
      const b = emberAt(i);
      obj.position.set(b.x, b.y, b.z);
      FORWARD.set(b.vx, b.vy, b.vz);
      if (FORWARD.lengthSq() > 0.001) {
        obj.quaternion.setFromUnitVectors(CAPSULE_AXIS, FORWARD.normalize());
        obj.rotateOnAxis(CAPSULE_AXIS, now * 2.6 + b.id * 1.7);
      }
      const pulse = 0.92 + Math.sin(now * 18 + b.id) * 0.08;
      obj.scale.setScalar(1.15 * pulse);
      if (b.color === "#ff2a2a") color.set("#ff5533");
      else color.set("#ffffff");
    });
    writeInstances(traps.current, combat.traps.length, (i, obj, color) => {
      const t = combat.traps[i];
      const armed = t.armIn <= 0;
      const pulse = 0.88 + Math.sin(now * (armed ? 5.2 : 2.4) + t.id) * 0.12;
      obj.position.set(t.x, 0.12, t.z);
      obj.scale.setScalar((armed ? 2.15 : 1.7) * pulse);
      obj.rotation.set(-Math.PI / 2, 0, now * 0.35);
      color.set(armed ? "#c8ff6a" : "#6aaa32");
    });
    writeInstances(trapGlow.current, combat.traps.length, (i, obj, color) => {
      const t = combat.traps[i];
      obj.position.set(t.x, 0.7, t.z);
      obj.scale.set(0.22, 1.3, 0.22);
      obj.rotation.set(0, 0, 0);
      color.set("#86d04a");
    });
    writeInstances(hookSlashes.current, countSlashes("hook"), (i, obj, color) => {
      const s = slashAt("hook", i);
      const u = Math.min(1, Math.max(0, s.age / s.life));
      const yaw = s.heading + s.sign * (u - 0.5) * Math.PI;
      const fx = -Math.sin(yaw);
      const fz = -Math.cos(yaw);
      obj.position.set(
        runtime.playerX + fx * s.radius,
        runtime.playerY + s.lift,
        runtime.playerZ + fz * s.radius
      );
      obj.rotation.set(-0.1, yaw, s.sign * 0.16, "YXZ");
      obj.scale.set(s.sign * 1.9, 0.92, 1);
      color.set("#7a4cff").multiplyScalar(0.3 + (1 - u) * 1.1);
    });
    writeInstances(loopSlashes.current, countSlashes("loop"), (i, obj, color) => {
      const s = slashAt("loop", i);
      const u = Math.min(1, Math.max(0, s.age / s.life));
      const spin = s.heading + u * Math.PI * 1.15;
      obj.position.set(runtime.playerX, runtime.playerY + s.lift, runtime.playerZ);
      obj.rotation.set(-0.35, spin, 0.2, "YXZ");
      obj.scale.setScalar(1.55 + u * 0.55);
      color.set("#9a6aff").multiplyScalar(0.35 + (1 - u) * 1.05);
    });
    writeInstances(ringSlashes.current, countSlashes("ring"), (i, obj, color) => {
      const s = slashAt("ring", i);
      const u = Math.min(1, Math.max(0, s.age / s.life));
      obj.position.set(runtime.playerX, runtime.playerY + s.lift, runtime.playerZ);
      obj.rotation.set(-Math.PI / 2, u * 0.8, 0);
      obj.scale.setScalar(s.radius * (0.85 + u * 0.7));
      color.set("#c8b8ff").multiplyScalar(0.4 + (1 - u) * 0.9);
    });
    writeInstances(bursts.current, combat.bursts.length, (i, obj, color) => {
      const b = combat.bursts[i];
      obj.position.set(b.x, b.y, b.z);
      obj.scale.setScalar((b.size ?? 1) * (1 + b.age * 6));
      obj.rotation.set(0, 0, 0);
      color.set(b.color);
    });
    writeInstances(sparks.current, combat.sparks.length, (i, obj, color) => {
      const s = combat.sparks[i];
      obj.position.set(s.x, s.y, s.z);
      obj.scale.setScalar(1.1 - s.age * 2);
      obj.rotation.set(s.age * 12, s.age * 8, 0);
      color.set(s.color);
    });
    let ringN = 0;
    for (let i = 0; i < combat.bursts.length; i++) {
      if (combat.bursts[i].ring) ringN += 1;
    }
    writeInstances(rings.current, ringN, (i, obj, color) => {
      const b = ringAt(i);
      obj.position.set(b.x, 0.06, b.z);
      obj.scale.setScalar((b.size ?? 1) * (0.35 + b.age * 3.2));
      obj.rotation.set(-Math.PI / 2, 0, 0);
      color.set(b.color);
    });

    const shell = ward.current;
    if (shell) {
      const active = runtime.wardLeft > 0;
      shell.visible = active;
      if (active) {
        shell.position.set(runtime.playerX, runtime.playerY + 0.95, runtime.playerZ);
        const t = runtime.wardLeft / Math.max(0.001, runtime.wardMax);
        const shimmer = (0.1 + Math.sin(now * 3.4) * 0.035) * (0.45 + t * 0.55);
        const mat = (shell.children[0] as THREE.Mesh | undefined)?.material;
        if (mat instanceof THREE.MeshBasicMaterial) mat.opacity = shimmer;
      }
    }
  });

  return (
    <group>
      <instancedMesh ref={arrows} args={[arrowGeo, undefined, 64]} frustumCulled={false} castShadow>
        <meshStandardMaterial
          vertexColors
          roughness={0.38}
          metalness={0.42}
          emissive="#3a2a1c"
          emissiveIntensity={0.28}
        />
      </instancedMesh>
      <instancedMesh ref={bolts} args={[fireballGeo, undefined, 64]} frustumCulled={false}>
        <meshBasicMaterial
          map={fireballTex}
          toneMapped={false}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
        />
      </instancedMesh>
      <instancedMesh ref={traps} args={[undefined, undefined, 12]} frustumCulled={false}>
        <planeGeometry args={[1.6, 1.6]} />
        <meshBasicMaterial
          map={hexTex}
          toneMapped={false}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
        />
      </instancedMesh>
      <instancedMesh ref={trapGlow} args={[undefined, undefined, 12]} frustumCulled={false}>
        <cylinderGeometry args={[1, 1, 1, 8, 1, true]} />
        <meshBasicMaterial
          color="#86d04a"
          toneMapped={false}
          transparent
          opacity={0.22}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
        />
      </instancedMesh>
      <instancedMesh ref={hookSlashes} args={[undefined, undefined, 4]} frustumCulled={false}>
        <planeGeometry args={[2.7, 1.15]} />
        <meshBasicMaterial
          map={hookTex}
          toneMapped={false}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
        />
      </instancedMesh>
      <instancedMesh ref={loopSlashes} args={[undefined, undefined, 2]} frustumCulled={false}>
        <planeGeometry args={[2.8, 2.8]} />
        <meshBasicMaterial
          map={loopTex}
          toneMapped={false}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
        />
      </instancedMesh>
      <instancedMesh ref={ringSlashes} args={[undefined, undefined, 2]} frustumCulled={false}>
        <planeGeometry args={[2.2, 2.2]} />
        <meshBasicMaterial
          map={ringSlashTex}
          toneMapped={false}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
        />
      </instancedMesh>
      <group ref={ward} visible={false}>
        <mesh>
          <sphereGeometry args={[1.28, 22, 16]} />
          <meshBasicMaterial
            color="#9be7ff"
            toneMapped={false}
            transparent
            opacity={0.16}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[1.12, 0.018, 8, 36]} />
          <meshBasicMaterial color="#c8f4ff" toneMapped={false} transparent opacity={0.55} depthWrite={false} />
        </mesh>
        <mesh rotation={[0.2, 0, 0.4]}>
          <torusGeometry args={[1.05, 0.012, 6, 28]} />
          <meshBasicMaterial color="#7ad4ff" toneMapped={false} transparent opacity={0.35} depthWrite={false} />
        </mesh>
      </group>
      <instancedMesh ref={bursts} args={[undefined, undefined, 48]} frustumCulled={false}>
        <sphereGeometry args={[0.45, 10, 8]} />
        <meshBasicMaterial toneMapped={false} transparent opacity={0.55} depthWrite={false} />
      </instancedMesh>
      <instancedMesh ref={sparks} args={[undefined, undefined, 220]} frustumCulled={false}>
        <octahedronGeometry args={[0.07, 0]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={rings} args={[undefined, undefined, 48]} frustumCulled={false}>
        <ringGeometry args={[0.55, 0.68, 20]} />
        <meshBasicMaterial toneMapped={false} side={THREE.DoubleSide} transparent opacity={0.28} depthWrite={false} />
      </instancedMesh>
    </group>
  );
}
