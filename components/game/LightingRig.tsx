"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { runtime } from "@/lib/store";

/**
 * Night lighting only — no remote HDRI. Environment presets fetch from a
 * CDN and will leave the canvas blank if that request hangs.
 */
export function LightingRig() {
  const light = useRef<THREE.DirectionalLight>(null);

  useFrame(() => {
    const moon = light.current;
    if (!moon) return;
    const x = runtime.playerX;
    const z = runtime.playerZ;
    moon.position.set(x + 38, 52, z - 46);
    moon.target.position.set(x, 0, z);
    moon.target.updateMatrixWorld();
  });

  return (
    <>
      <ambientLight intensity={0.28} color="#3d4c66" />
      <hemisphereLight args={["#4a5c7a", "#14160f", 0.32]} />
      <directionalLight
        ref={light}
        intensity={1.2}
        color="#c5d2ee"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
        shadow-camera-near={1}
        shadow-camera-far={140}
        shadow-camera-left={-42}
        shadow-camera-right={42}
        shadow-camera-top={42}
        shadow-camera-bottom={-42}
      />
    </>
  );
}
