"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { FIREFLY_CLUSTERS, type Biome } from "@/lib/world-data";

interface Fly {
  cx: number;
  cz: number;
  seed: number;
  rate: number;
  radius: number;
  height: number;
  color: THREE.Color;
}

const TINT: Record<Biome, string> = {
  forest: "#d8ff7a",
  swamp: "#9cff88",
  graveyard: "#c8d8ff",
};

function hash(seed: number, k: number): number {
  const h = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453;
  return h - Math.floor(h);
}

function buildFlies(): Fly[] {
  const flies: Fly[] = [];
  for (const cluster of FIREFLY_CLUSTERS) {
    for (let i = 0; i < cluster.count; i++) {
      const seed = cluster.seed + i * 17.13;
      flies.push({
        cx: cluster.x,
        cz: cluster.z,
        seed,
        rate: 0.55 + hash(seed, 1) * 1.1,
        radius: 1.1 + hash(seed, 2) * 1.4,
        height: 0.55 + hash(seed, 3) * 1.15,
        color: new THREE.Color(TINT[cluster.biome]).multiplyScalar(0.85 + hash(seed, 4) * 0.25),
      });
    }
  }
  return flies;
}

function blink(time: number, seed: number, rate: number): number {
  const cycle = (time * rate + seed) % 2.8;
  if (cycle > 0.55) return 0.04;
  return Math.sin((cycle / 0.55) * Math.PI);
}

const dummy = new THREE.Object3D();
const tint = new THREE.Color();

/**
 * A few drifting, blinking glows. Instanced only — no real lights, so they
 * never steal lanterns from the light pool.
 */
export function Fireflies() {
  const cores = useRef<THREE.InstancedMesh>(null);
  const halos = useRef<THREE.InstancedMesh>(null);
  const flies = useMemo(() => buildFlies(), []);

  useLayoutEffect(() => {
    const black = new THREE.Color("#000000");
    for (const mesh of [cores.current, halos.current]) {
      if (!mesh) continue;
      mesh.count = flies.length;
      for (let i = 0; i < flies.length; i++) mesh.setColorAt(i, black);
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }, [flies.length]);

  useFrame((state) => {
    const core = cores.current;
    const halo = halos.current;
    if (!core || !halo) return;
    const t = state.clock.elapsedTime;
    for (let i = 0; i < flies.length; i++) {
      const fly = flies[i];
      const pulse = blink(t, fly.seed, fly.rate);
      const x =
        fly.cx +
        Math.sin(t * 0.33 + fly.seed) * fly.radius +
        Math.sin(t * 0.91 + fly.seed * 2.1) * fly.radius * 0.28;
      const y = fly.height + Math.sin(t * 0.52 + fly.seed * 1.4) * 0.38;
      const z =
        fly.cz +
        Math.cos(t * 0.29 + fly.seed * 0.8) * fly.radius +
        Math.cos(t * 1.05 + fly.seed) * fly.radius * 0.26;
      dummy.position.set(x, y, z);
      dummy.scale.setScalar(0.028 + pulse * 0.038);
      dummy.updateMatrix();
      core.setMatrixAt(i, dummy.matrix);
      dummy.scale.setScalar(0.09 + pulse * 0.16);
      dummy.updateMatrix();
      halo.setMatrixAt(i, dummy.matrix);
      tint.copy(fly.color).multiplyScalar(0.2 + pulse * 1.15);
      core.setColorAt(i, tint);
      tint.copy(fly.color).multiplyScalar(0.08 + pulse * 0.45);
      halo.setColorAt(i, tint);
    }
    core.instanceMatrix.needsUpdate = true;
    halo.instanceMatrix.needsUpdate = true;
    if (core.instanceColor) core.instanceColor.needsUpdate = true;
    if (halo.instanceColor) halo.instanceColor.needsUpdate = true;
  });

  if (flies.length === 0) return null;

  return (
    <group>
      <instancedMesh ref={cores} args={[undefined, undefined, flies.length]} frustumCulled={false}>
        <sphereGeometry args={[1, 6, 5]} />
        <meshBasicMaterial
          toneMapped={false}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </instancedMesh>
      <instancedMesh ref={halos} args={[undefined, undefined, flies.length]} frustumCulled={false}>
        <sphereGeometry args={[1, 6, 5]} />
        <meshBasicMaterial
          toneMapped={false}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </instancedMesh>
    </group>
  );
}
