"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { BOSSES, type BossId } from "@/lib/gameData";
import { canPassArena, useGameStore } from "@/lib/store";
import { BOSS_ARENAS } from "@/lib/world-data";

export function BossArenas() {
  return (
    <group>
      {BOSS_ARENAS.map((arena) => (
        <Ring key={arena.bossId} bossId={arena.bossId} x={arena.x} z={arena.z} radius={arena.radius} rot={arena.rot} />
      ))}
    </group>
  );
}

function Ring({
  bossId,
  x,
  z,
  radius,
  rot,
}: {
  bossId: BossId;
  x: number;
  z: number;
  radius: number;
  rot: number;
}) {
  const open = useGameStore((s) => canPassArena(s, bossId));
  const entered = useGameStore((s) => s.arenasOpened.includes(bossId) || s.bossesDefeated.includes(bossId));
  const color = open ? "#c9a06a" : "#6a2030";

  return (
    <group position={[x, 0, z]} rotation={[0, rot, 0]}>
      {Array.from({ length: 18 }, (_, i) => {
        const a = (i / 18) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(a) * radius, 0.28, Math.sin(a) * radius]} castShadow>
            <boxGeometry args={[0.55, 0.56, 0.38]} />
            <meshStandardMaterial color="#4a453c" roughness={0.96} />
          </mesh>
        );
      })}
      <mesh position={[-1.5, 2.9, radius - 0.2]}>
        <boxGeometry args={[0.35, 1.4, 0.35]} />
        <meshStandardMaterial color="#3a342c" />
      </mesh>
      <mesh position={[1.5, 2.9, radius - 0.2]}>
        <boxGeometry args={[0.35, 1.4, 0.35]} />
        <meshStandardMaterial color="#3a342c" />
      </mesh>
      <mesh position={[0, 3.55, radius - 0.2]}>
        <boxGeometry args={[3.6, 0.28, 0.5]} />
        <meshStandardMaterial color="#2c2822" />
      </mesh>
      {!open && (
        <mesh position={[0, 1.35, radius - 0.2]} castShadow>
          <boxGeometry args={[3.4, 2.7, 0.4]} />
          <meshStandardMaterial color={color} roughness={0.85} emissive="#3a0008" emissiveIntensity={0.4} />
        </mesh>
      )}
      <Portal open={open} spent={entered} z={radius - 0.15} />
    </group>
  );
}

function Portal({ open, spent, z }: { open: boolean; spent: boolean; z: number }) {
  const ring = useRef<THREE.Mesh>(null);
  const swirl = useRef<THREE.MeshStandardMaterial>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (ring.current) ring.current.rotation.z = t * (open ? 1.4 : 0.25);
    if (swirl.current) {
      swirl.current.emissiveIntensity = open ? 0.85 + Math.sin(t * 3.2) * 0.35 : 0.12;
    }
  });

  const glow = open ? (spent ? "#6aa8ff" : "#7affd0") : "#5a1020";

  return (
    <group position={[0, 1.45, z]}>
      <mesh ref={ring}>
        <torusGeometry args={[1.15, 0.08, 10, 28]} />
        <meshStandardMaterial
          ref={swirl}
          color={glow}
          emissive={glow}
          emissiveIntensity={open ? 1 : 0.12}
          roughness={0.35}
        />
      </mesh>
      <mesh>
        <circleGeometry args={[1.05, 24]} />
        <meshBasicMaterial
          color={open ? "#081018" : "#120408"}
          transparent
          opacity={open ? 0.92 : 0.55}
          side={THREE.DoubleSide}
        />
      </mesh>
      {open && (
        <mesh>
          <circleGeometry args={[0.55, 20]} />
          <meshBasicMaterial color={glow} transparent opacity={0.35} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  );
}

export function bossTitle(id: BossId): string {
  return BOSSES[id].name;
}
