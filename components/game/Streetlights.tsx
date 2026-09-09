"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { BIOME_INFO, STREETLIGHTS, biomeAt, type Biome, type Placement } from "@/lib/world-data";
import { useWoodTexture } from "@/lib/proc-textures";
import { useLightEmitter } from "@/lib/light-pool";

/** Post finish per biome: fresh timber, weathered marsh wood, or black iron. */
const POST_TINT: Record<Biome, { post: string; arm: string }> = {
  forest: { post: "#c4a07a", arm: "#a07850" },
  swamp: { post: "#8f9078", arm: "#6e7058" },
  graveyard: { post: "#4a4c55", arm: "#3a3c44" },
};

export function Streetlights() {
  const wood = useWoodTexture();
  return (
    <group>
      {STREETLIGHTS.map((light, i) => (
        <WoodenStreetlight key={i} light={light} wood={wood} />
      ))}
    </group>
  );
}

function WoodenStreetlight({ light, wood }: { light: Placement; wood: THREE.Texture }) {
  const anchor = useRef<THREE.Object3D>(null);
  const glass = useRef<THREE.MeshStandardMaterial>(null);
  const biome = biomeAt(light.x, light.z);
  const lampColor = BIOME_INFO[biome].lamp;
  const tint = POST_TINT[biome];
  const setLamp = useLightEmitter(anchor, lampColor, 12, 16);

  useFrame((state) => {
    const t = state.clock.elapsedTime + light.x * 0.17;
    const flicker = 0.82 + Math.sin(t * 8.2) * 0.1 + Math.sin(t * 21) * 0.06;
    setLamp(16 * flicker);
    if (glass.current) glass.current.emissiveIntensity = 1.8 * flicker;
  });

  return (
    <group position={[light.x, 0, light.z]} rotation={[0, light.rot, 0]}>
      {/* Post */}
      <mesh position={[0, 2.35, 0]} castShadow>
        <cylinderGeometry args={[0.11, 0.16, 4.7, 8]} />
        <meshStandardMaterial map={wood} color={tint.post} roughness={0.88} metalness={0.02} envMapIntensity={0.2} />
      </mesh>
      {/* Crossarm */}
      <mesh position={[0.55, 4.55, 0]} castShadow>
        <boxGeometry args={[1.3, 0.12, 0.14]} />
        <meshStandardMaterial map={wood} color={tint.arm} roughness={0.88} metalness={0.02} />
      </mesh>
      {/* Brace */}
      <mesh position={[0.28, 4.25, 0]} rotation={[0, 0, 0.55]} castShadow>
        <boxGeometry args={[0.7, 0.07, 0.07]} />
        <meshStandardMaterial color="#3d2818" roughness={1} />
      </mesh>
      {/* Hanging lantern */}
      <mesh position={[1.05, 4.15, 0]}>
        <boxGeometry args={[0.38, 0.48, 0.38]} />
        <meshStandardMaterial
          ref={glass}
          color={lampColor}
          emissive={lampColor}
          emissiveIntensity={1.6}
          transparent
          opacity={0.92}
        />
      </mesh>
      <mesh position={[1.05, 4.42, 0]}>
        <boxGeometry args={[0.42, 0.08, 0.42]} />
        <meshStandardMaterial color="#2c1c12" roughness={1} />
      </mesh>
      <mesh position={[1.05, 3.88, 0]}>
        <boxGeometry args={[0.42, 0.08, 0.42]} />
        <meshStandardMaterial color="#2c1c12" roughness={1} />
      </mesh>
      <object3D ref={anchor} position={[1.05, 3.7, 0]} />
    </group>
  );
}
