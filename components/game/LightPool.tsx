"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { getEmitters, type LightEmitter } from "@/lib/light-pool";
import { runtime } from "@/lib/store";

const POOL_SIZE = 12;

/** A fixed set of point lights handed to the nearest lit emitters every frame. */
export function LightPool() {
  const lights = useRef<(THREE.PointLight | null)[]>([]);
  const scratchRef = useRef<{ e: LightEmitter; score: number }[]>([]);

  useFrame(() => {
    const px = runtime.playerX;
    const pz = runtime.playerZ;
    const scratch = scratchRef.current;
    scratch.length = 0;
    for (const e of getEmitters()) {
      if (e.intensity <= 0.001) continue;
      const dx = e.position.x - px;
      const dz = e.position.z - pz;
      const d = Math.sqrt(dx * dx + dz * dz);
      // Skip anything whose falloff cannot reach the survivor's surroundings.
      if (d > e.distance + 10) continue;
      scratch.push({ e, score: d - e.distance * 0.35 });
    }
    scratch.sort((a, b) => a.score - b.score);

    for (let i = 0; i < POOL_SIZE; i++) {
      const light = lights.current[i];
      if (!light) continue;
      const pick = scratch[i];
      if (!pick) {
        light.intensity = 0;
        continue;
      }
      light.position.copy(pick.e.position);
      light.color.copy(pick.e.color);
      light.distance = pick.e.distance;
      light.intensity = pick.e.intensity;
    }
  });

  return (
    <group>
      {Array.from({ length: POOL_SIZE }, (_, i) => (
        <pointLight
          key={i}
          ref={(el) => {
            lights.current[i] = el;
          }}
          intensity={0}
          distance={10}
          decay={2}
        />
      ))}
    </group>
  );
}
