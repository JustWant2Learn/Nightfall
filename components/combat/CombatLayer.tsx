"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { audio } from "@/lib/audio";
import { createArrowGeometry, isSpearBolt } from "@/lib/arrow-geometry";
import { combat, stepCombat, tryFireSkill } from "@/lib/combat";
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
  const bursts = useRef<THREE.InstancedMesh>(null);
  const sparks = useRef<THREE.InstancedMesh>(null);
  const rings = useRef<THREE.InstancedMesh>(null);
  const arrowGeo = useMemo(() => createArrowGeometry(), []);

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

    const heading = runtime.camYaw;
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
      FORWARD.set(b.vx, 0, b.vz);
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
      FORWARD.set(b.vx, 0, b.vz);
      if (FORWARD.lengthSq() > 0.001) {
        obj.quaternion.setFromUnitVectors(CAPSULE_AXIS, FORWARD.normalize());
      }
      obj.scale.set(1.4, 1.4, 1.4);
      color.set(b.color);
    });
    writeInstances(traps.current, combat.traps.length, (i, obj, color) => {
      const t = combat.traps[i];
      obj.position.set(t.x, 0.05, t.z);
      obj.scale.setScalar(t.armIn > 0 ? 0.7 : 1);
      obj.rotation.set(-Math.PI / 2, 0, 0);
      color.set(t.color);
    });
    writeInstances(bursts.current, combat.bursts.length, (i, obj, color) => {
      const b = combat.bursts[i];
      obj.position.set(b.x, b.y, b.z);
      obj.scale.setScalar(1 + b.age * 6);
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
    writeInstances(rings.current, combat.bursts.length, (i, obj, color) => {
      const b = combat.bursts[i];
      obj.position.set(b.x, b.y, b.z);
      obj.scale.setScalar(0.4 + b.age * 8);
      obj.rotation.set(-Math.PI / 2, 0, 0);
      color.set(b.color);
    });
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
      <instancedMesh ref={bolts} args={[undefined, undefined, 64]} frustumCulled={false}>
        <capsuleGeometry args={[0.09, 0.55, 4, 8]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={traps} args={[undefined, undefined, 12]} frustumCulled={false}>
        <ringGeometry args={[0.32, 0.7, 18]} />
        <meshBasicMaterial toneMapped={false} side={THREE.DoubleSide} transparent opacity={0.75} />
      </instancedMesh>
      <instancedMesh ref={bursts} args={[undefined, undefined, 16]} frustumCulled={false}>
        <sphereGeometry args={[0.45, 10, 8]} />
        <meshBasicMaterial toneMapped={false} transparent opacity={0.55} depthWrite={false} />
      </instancedMesh>
      <instancedMesh ref={sparks} args={[undefined, undefined, 80]} frustumCulled={false}>
        <octahedronGeometry args={[0.07, 0]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={rings} args={[undefined, undefined, 16]} frustumCulled={false}>
        <ringGeometry args={[0.55, 0.72, 20]} />
        <meshBasicMaterial toneMapped={false} side={THREE.DoubleSide} transparent opacity={0.7} depthWrite={false} />
      </instancedMesh>
    </group>
  );
}
