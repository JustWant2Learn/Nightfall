"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useLightEmitter } from "@/lib/light-pool";
import { useGameStore } from "@/lib/store";
import { TALISMANS } from "@/lib/world-data";

export function Talismans() {
  return (
    <group>
      {TALISMANS.map((p, i) => (
        <Talisman key={i} index={i} x={p.x} z={p.z} phase={p.rot} />
      ))}
    </group>
  );
}

function Talisman({
  index,
  x,
  z,
  phase,
}: {
  index: number;
  x: number;
  z: number;
  phase: number;
}) {
  const root = useRef<THREE.Group>(null);
  const spin = useRef<THREE.Group>(null);
  const anchor = useRef<THREE.Object3D>(null);
  const setGlow = useLightEmitter(anchor, "#a45dff", 9, 5);

  useFrame((state) => {
    const taken = useGameStore.getState().collected.includes(index);
    if (root.current) root.current.visible = !taken;
    if (taken) {
      setGlow(0);
      return;
    }
    const g = spin.current;
    if (!g) return;
    const t = state.clock.elapsedTime + phase;
    g.position.y = 1.1 + Math.sin(t * 1.8) * 0.18;
    g.rotation.y = t * 1.4;
    setGlow(5);
  });

  return (
    <group ref={root} position={[x, 0, z]}>
      <group ref={spin}>
        <mesh castShadow>
          <octahedronGeometry args={[0.28, 0]} />
          <meshStandardMaterial
            color="#c48aff"
            emissive="#9b4dff"
            emissiveIntensity={2.4}
            roughness={0.25}
          />
        </mesh>
        <mesh>
          <octahedronGeometry args={[0.42, 0]} />
          <meshBasicMaterial color="#b06aff" transparent opacity={0.14} />
        </mesh>
      </group>
      <object3D ref={anchor} position={[0, 1.4, 0]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[0.4, 0.55, 24]} />
        <meshBasicMaterial color="#8a3dff" transparent opacity={0.45} />
      </mesh>
    </group>
  );
}
