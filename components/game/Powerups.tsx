"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useLightEmitter } from "@/lib/light-pool";
import { POWERUP_INFO, useGameStore } from "@/lib/store";
import type { PowerupPlacement, PowerupType } from "@/lib/world-data";

/**
 * Stat powerups scattered across the map. Positions come from the store
 * (re-rolled each run); pickup happens in the Player loop, and this only
 * hides collected ones via `visible` so the scene never re-mounts.
 */
export function Powerups() {
  const powerups = useGameStore((s) => s.powerups);
  return (
    <group>
      {powerups.map((p, i) => (
        <Powerup key={`${i}-${p.x.toFixed(1)}`} index={i} placement={p} />
      ))}
    </group>
  );
}

function Powerup({ index, placement }: { index: number; placement: PowerupPlacement }) {
  const root = useRef<THREE.Group>(null);
  const bob = useRef<THREE.Group>(null);
  const anchor = useRef<THREE.Object3D>(null);
  const info = POWERUP_INFO[placement.type];
  const phase = (placement.x * 0.31 + placement.z * 0.17) % 6.28;
  const setGlow = useLightEmitter(anchor, info.glow, 8, 4);

  useFrame((state) => {
    const taken = useGameStore.getState().powerupsTaken.includes(index);
    if (root.current) root.current.visible = !taken;
    if (taken) {
      setGlow(0);
      return;
    }
    const t = state.clock.elapsedTime + phase;
    if (bob.current) {
      bob.current.position.y = 0.95 + Math.sin(t * 2.1) * 0.14;
      bob.current.rotation.y = t * 1.1;
    }
    setGlow(4 + Math.sin(t * 3.3) * 1.2);
  });

  return (
    <group ref={root} position={[placement.x, 0, placement.z]}>
      <group ref={bob}>
        <Icon type={placement.type} color={info.color} glow={info.glow} />
        {/* Halo */}
        <mesh>
          <sphereGeometry args={[0.5, 14, 10]} />
          <meshBasicMaterial color={info.glow} transparent opacity={0.1} depthWrite={false} />
        </mesh>
      </group>
      <object3D ref={anchor} position={[0, 1.2, 0]} />
      {/* Ground marker */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[0.38, 0.5, 24]} />
        <meshBasicMaterial color={info.glow} transparent opacity={0.4} />
      </mesh>
      {/* Pedestal */}
      <mesh position={[0, 0.12, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.28, 0.36, 0.24, 8]} />
        <meshStandardMaterial color="#3a3d46" roughness={0.9} />
      </mesh>
    </group>
  );
}

function Icon({ type, color, glow }: { type: PowerupType; color: string; glow: string }) {
  const material = (
    <meshStandardMaterial color={color} emissive={glow} emissiveIntensity={1.6} roughness={0.3} metalness={0.2} />
  );
  switch (type) {
    case "health":
      // Medical cross
      return (
        <group>
          <mesh castShadow>
            <boxGeometry args={[0.52, 0.17, 0.17]} />
            {material}
          </mesh>
          <mesh castShadow>
            <boxGeometry args={[0.17, 0.52, 0.17]} />
            {material}
          </mesh>
        </group>
      );
    case "speed":
      // Lightning bolt: two slanted bars joined at the middle
      return (
        <group rotation={[0, 0, -0.35]}>
          <mesh position={[0.07, 0.17, 0]} rotation={[0, 0, 0.55]} castShadow>
            <boxGeometry args={[0.15, 0.4, 0.13]} />
            {material}
          </mesh>
          <mesh position={[-0.07, -0.17, 0]} rotation={[0, 0, 0.55]} castShadow>
            <boxGeometry args={[0.15, 0.4, 0.13]} />
            {material}
          </mesh>
          <mesh rotation={[0, 0, -0.9]} castShadow>
            <boxGeometry args={[0.13, 0.32, 0.13]} />
            {material}
          </mesh>
        </group>
      );
    case "stamina":
      // Vial of green energy
      return (
        <group>
          <mesh castShadow>
            <capsuleGeometry args={[0.14, 0.34, 4, 10]} />
            {material}
          </mesh>
          <mesh position={[0, 0.3, 0]}>
            <cylinderGeometry args={[0.09, 0.09, 0.1, 8]} />
            <meshStandardMaterial color="#2a2a2a" roughness={0.6} />
          </mesh>
        </group>
      );
    case "armor":
      // Hexagonal shield plate with a rim
      return (
        <group rotation={[0.2, 0, 0]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.32, 0.32, 0.08, 6]} />
            {material}
          </mesh>
          <mesh position={[0, 0, 0.05]}>
            <cylinderGeometry args={[0.2, 0.2, 0.02, 6]} />
            <meshStandardMaterial color="#e8f0ff" emissive="#8fb8ff" emissiveIntensity={0.8} roughness={0.3} metalness={0.5} />
          </mesh>
        </group>
      );
  }
}
