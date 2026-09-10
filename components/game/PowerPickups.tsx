"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { keyBiomeUnlocked, MODIFIERS, RARITY_COLOR, SKILLS, type ModifierId, type SkillId } from "@/lib/gameData";
import { useLightEmitter } from "@/lib/light-pool";
import { useGameStore } from "@/lib/store";
import type { PowerLootKind, PowerLootPlacement } from "@/lib/world-data";

const KIND_COLOR: Record<PowerLootKind, string> = {
  fragment: "#e8dcc0",
  skillShard: "#7ad0ff",
  modifier: "#c084fc",
  keyPiece: "#ffd34d",
  cursedRelic: "#ff2a2a",
};

export function PowerPickups() {
  const loot = useGameStore((s) => s.powerLoot);
  const defeated = useGameStore((s) => s.bossesDefeated);
  return (
    <group>
      {loot.map((item) => {
        if (item.kind === "keyPiece" && !keyBiomeUnlocked(item.biome, defeated)) return null;
        return <LootMesh key={item.id} item={item} />;
      })}
    </group>
  );
}

function LootMesh({ item }: { item: PowerLootPlacement }) {
  const root = useRef<THREE.Group>(null);
  const bob = useRef<THREE.Group>(null);
  const anchor = useRef<THREE.Object3D>(null);
  const color = lootColor(item);
  const phase = (item.x * 0.27 + item.z * 0.19) % 6.28;
  const setGlow = useLightEmitter(anchor, color, 7, 3.4);

  useFrame((state) => {
    const taken = useGameStore.getState().lootTaken.includes(item.id);
    if (root.current) root.current.visible = !taken;
    if (taken) {
      setGlow(0);
      return;
    }
    const t = state.clock.elapsedTime + phase;
    if (bob.current) {
      bob.current.position.y = 0.72 + Math.sin(t * 2.2) * 0.12;
      bob.current.rotation.y = t * 1.15;
    }
    setGlow(3.2 + Math.sin(t * 3) * 0.9);
  });

  return (
    <group ref={root} position={[item.x, 0, item.z]}>
      <group ref={bob}>
        {item.kind === "keyPiece" ? (
          <BossKeyMesh color={color} />
        ) : (
          <mesh castShadow>
            <octahedronGeometry args={[0.16, 0]} />
            <meshStandardMaterial
              color={color}
              emissive={color}
              emissiveIntensity={item.kind === "cursedRelic" ? 1.4 : 0.7}
              roughness={0.35}
            />
          </mesh>
        )}
        <mesh>
          <sphereGeometry args={[item.kind === "keyPiece" ? 0.5 : 0.42, 12, 8]} />
          <meshBasicMaterial color={color} transparent opacity={0.1} depthWrite={false} />
        </mesh>
      </group>
      <object3D ref={anchor} position={[0, 0.9, 0]} />
    </group>
  );
}

/** Old iron-gold skeleton key: ring bow, shaft, and two teeth. */
function BossKeyMesh({ color }: { color: string }) {
  return (
    <group rotation={[0.15, 0, 0.35]} scale={1.15}>
      <mesh position={[-0.16, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <torusGeometry args={[0.11, 0.032, 8, 16]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.85} metalness={0.65} roughness={0.28} />
      </mesh>
      <mesh position={[0.08, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.028, 0.028, 0.34, 8]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.7} metalness={0.6} roughness={0.32} />
      </mesh>
      <mesh position={[0.22, -0.055, 0]} castShadow>
        <boxGeometry args={[0.07, 0.11, 0.04]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.7} metalness={0.6} roughness={0.32} />
      </mesh>
      <mesh position={[0.16, -0.07, 0]} castShadow>
        <boxGeometry args={[0.05, 0.07, 0.04]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.7} metalness={0.6} roughness={0.32} />
      </mesh>
    </group>
  );
}

function lootColor(item: PowerLootPlacement): string {
  if (item.kind === "skillShard" && item.skillId && SKILLS[item.skillId as SkillId]) {
    return SKILLS[item.skillId as SkillId].glow;
  }
  if (item.modifierId && MODIFIERS[item.modifierId as ModifierId]) {
    return RARITY_COLOR[MODIFIERS[item.modifierId as ModifierId].rarity];
  }
  return KIND_COLOR[item.kind];
}
