"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { FUSION_ALTARS } from "@/lib/world-data";

export function FusionAltars() {
  return (
    <group>
      {FUSION_ALTARS.map((altar) => (
        <Altar key={altar.id} x={altar.x} z={altar.z} />
      ))}
    </group>
  );
}

function Altar({ x, z }: { x: number; z: number }) {
  const glow = useRef<THREE.MeshStandardMaterial>(null);

  useFrame((state) => {
    if (glow.current) {
      glow.current.emissiveIntensity = 0.45 + Math.sin(state.clock.elapsedTime * 2.2) * 0.25;
    }
  });

  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.22, 0]} castShadow>
        <boxGeometry args={[1.5, 0.44, 1.5]} />
        <meshStandardMaterial color="#3a342c" roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.5, 0]}>
        <cylinderGeometry args={[0.42, 0.5, 0.16, 8]} />
        <meshStandardMaterial ref={glow} color="#2a1830" emissive="#7a3ad0" emissiveIntensity={0.5} />
      </mesh>
      {[0, 1, 2, 3].map((i) => {
        const a = (i / 4) * Math.PI * 2 + 0.4;
        return (
          <mesh key={i} position={[Math.cos(a) * 0.85, 0.55, Math.sin(a) * 0.85]}>
            <boxGeometry args={[0.16, 0.7, 0.16]} />
            <meshStandardMaterial color="#4a4036" roughness={0.9} />
          </mesh>
        );
      })}
    </group>
  );
}
