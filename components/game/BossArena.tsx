"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { BOSSES, type BossId } from "@/lib/gameData";
import { canPassArena, useGameStore } from "@/lib/store";
import { BOSS_ARENAS } from "@/lib/world-data";

const STONE = "#6a6280";
const STONE_DARK = "#4a4460";
const STONE_LIT = "#8a8498";
const VINE = "#3a8a3a";
const LEAF = "#5cb85c";
const PORTAL_GREEN = "#7CFF3A";
const PORTAL_CORE = "#c8ff6a";

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
      {bossId === "bear" ? (
        <ForestBossPortal open={open} spent={entered} z={radius - 0.35} />
      ) : (
        <>
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
        </>
      )}
    </group>
  );
}

/** Low-poly stone arch + lime vortex for the Rotting Bear gate. */
function ForestBossPortal({ open, spent, z }: { open: boolean; spent: boolean; z: number }) {
  const vortex = useRef<THREE.Group>(null);
  const glow = useRef<THREE.PointLight>(null);
  const face = useRef<THREE.MeshBasicMaterial>(null);

  const stones = useMemo(
    () => [
      // Left pillar
      { p: [-1.55, 0.55, 0] as const, s: [0.85, 1.1, 0.75] as const, c: STONE },
      { p: [-1.62, 1.55, 0.05] as const, s: [0.78, 0.95, 0.7] as const, c: STONE_DARK },
      { p: [-1.48, 2.45, -0.04] as const, s: [0.9, 0.85, 0.72] as const, c: STONE_LIT },
      { p: [-1.35, 3.2, 0.02] as const, s: [0.7, 0.7, 0.65] as const, c: STONE },
      // Right pillar
      { p: [1.55, 0.5, 0.04] as const, s: [0.88, 1.0, 0.78] as const, c: STONE_DARK },
      { p: [1.6, 1.45, -0.02] as const, s: [0.8, 0.9, 0.7] as const, c: STONE },
      { p: [1.45, 2.4, 0.06] as const, s: [0.85, 0.95, 0.74] as const, c: STONE_LIT },
      { p: [1.32, 3.15, 0] as const, s: [0.72, 0.65, 0.68] as const, c: STONE },
      // Arch crown
      { p: [-0.85, 3.55, 0] as const, s: [0.95, 0.55, 0.7] as const, c: STONE },
      { p: [0, 3.75, 0.04] as const, s: [1.1, 0.6, 0.75] as const, c: STONE_LIT },
      { p: [0.85, 3.55, -0.02] as const, s: [0.95, 0.55, 0.7] as const, c: STONE_DARK },
      { p: [-0.35, 4.05, 0.02] as const, s: [0.7, 0.4, 0.55] as const, c: STONE },
      { p: [0.4, 4.0, 0] as const, s: [0.65, 0.38, 0.55] as const, c: STONE_DARK },
    ],
    []
  );

  const steps = useMemo(
    () => [
      { p: [0, 0.12, 1.15] as const, s: [4.4, 0.24, 2.4] as const, c: STONE_DARK },
      { p: [0, 0.32, 0.55] as const, s: [3.6, 0.22, 1.7] as const, c: STONE },
      { p: [0, 0.52, 0.05] as const, s: [3.1, 0.22, 1.35] as const, c: STONE_LIT },
    ],
    []
  );

  const rubble = useMemo(
    () => [
      { p: [-1.9, 0.18, 1.85] as const, s: [0.55, 0.28, 0.4] as const, r: 0.4 },
      { p: [1.7, 0.14, 2.05] as const, s: [0.45, 0.22, 0.55] as const, r: -0.55 },
      { p: [0.35, 0.12, 2.25] as const, s: [0.5, 0.2, 0.35] as const, r: 0.25 },
    ],
    []
  );

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const spin = open ? 0.55 : 0.12;
    if (vortex.current) vortex.current.rotation.z = -t * spin;
    if (glow.current) {
      glow.current.intensity = open ? 18 + Math.sin(t * 2.8) * 4 : 3;
      glow.current.color.set(open ? (spent ? "#6aa8ff" : PORTAL_GREEN) : "#3a1020");
    }
    if (face.current) {
      face.current.opacity = open ? 0.92 : 0.45;
    }
  });

  const portalColor = open ? (spent ? "#5ad0ff" : PORTAL_GREEN) : "#4a1820";
  const coreColor = open ? (spent ? "#b8ecff" : PORTAL_CORE) : "#2a0c10";

  return (
    <group position={[0, 0, z]}>
      {steps.map((b, i) => (
        <mesh key={`step-${i}`} position={b.p} castShadow receiveShadow>
          <boxGeometry args={[...b.s]} />
          <meshStandardMaterial color={b.c} roughness={0.92} />
        </mesh>
      ))}

      {stones.map((b, i) => (
        <mesh key={`stone-${i}`} position={b.p} castShadow receiveShadow>
          <boxGeometry args={[...b.s]} />
          <meshStandardMaterial color={b.c} roughness={0.9} />
        </mesh>
      ))}

      {rubble.map((b, i) => (
        <mesh key={`rubble-${i}`} position={b.p} rotation={[0, b.r, 0.08]} castShadow>
          <boxGeometry args={[...b.s]} />
          <meshStandardMaterial color={STONE_DARK} roughness={0.95} />
        </mesh>
      ))}

      {/* Locked slab sits in front of the vortex until the gate opens. */}
      {!open && (
        <mesh position={[0, 1.85, 0.12]} castShadow>
          <boxGeometry args={[2.35, 2.7, 0.28]} />
          <meshStandardMaterial color="#5a2030" roughness={0.85} emissive="#3a0008" emissiveIntensity={0.35} />
        </mesh>
      )}

      {/* Green vortex disc */}
      <group position={[0, 1.95, -0.02]}>
        <mesh>
          <circleGeometry args={[1.28, 28]} />
          <meshBasicMaterial
            ref={face}
            color={open ? "#0a1808" : "#120408"}
            transparent
            opacity={open ? 0.92 : 0.45}
            side={THREE.DoubleSide}
          />
        </mesh>
        <group ref={vortex}>
          {[1.18, 0.92, 0.68, 0.46, 0.28].map((r, i) => (
            <mesh key={r} position={[0, 0, 0.01 + i * 0.008]}>
              <ringGeometry args={[r - 0.07, r, 28]} />
              <meshBasicMaterial
                color={i % 2 === 0 ? portalColor : coreColor}
                transparent
                opacity={open ? 0.85 - i * 0.08 : 0.2}
                side={THREE.DoubleSide}
                depthWrite={false}
              />
            </mesh>
          ))}
          <mesh position={[0, 0, 0.05]}>
            <circleGeometry args={[0.2, 16]} />
            <meshBasicMaterial
              color={coreColor}
              transparent
              opacity={open ? 0.95 : 0.15}
              side={THREE.DoubleSide}
            />
          </mesh>
        </group>
        <pointLight
          ref={glow}
          position={[0, 0, 0.55]}
          color={portalColor}
          intensity={open ? 18 : 3}
          distance={12}
          decay={2}
        />
      </group>

      <VineCluster position={[-1.15, 3.55, 0.35]} />
      <VineCluster position={[1.05, 3.4, 0.3]} scale={0.85} />
      <VineCluster position={[-1.7, 1.1, 0.45]} scale={0.7} />
      <Bush position={[-1.85, 0.55, 0.95]} />
      <Bush position={[1.75, 0.55, 0.85]} />
      <Bush position={[-0.9, 0.55, 1.35]} scale={0.75} />
      <Bush position={[1.1, 0.55, 1.4]} scale={0.65} />
    </group>
  );
}

function VineCluster({
  position,
  scale = 1,
}: {
  position: [number, number, number];
  scale?: number;
}) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, -0.35, 0]} rotation={[0.2, 0.3, 0.15]}>
        <cylinderGeometry args={[0.03, 0.04, 0.9, 5]} />
        <meshStandardMaterial color={VINE} roughness={0.85} />
      </mesh>
      <mesh position={[0.12, -0.55, 0.08]} rotation={[-0.3, -0.4, -0.4]}>
        <cylinderGeometry args={[0.025, 0.03, 0.7, 5]} />
        <meshStandardMaterial color={VINE} roughness={0.85} />
      </mesh>
      {[
        [0.08, 0.05, 0.12],
        [-0.1, -0.1, 0.08],
        [0.16, -0.25, 0.02],
        [-0.05, -0.4, 0.14],
      ].map((p, i) => (
        <mesh key={i} position={p as [number, number, number]} rotation={[0.4, i, 0.2]}>
          <coneGeometry args={[0.09, 0.22, 5]} />
          <meshStandardMaterial color={LEAF} roughness={0.7} />
        </mesh>
      ))}
    </group>
  );
}

function Bush({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      {[0, 1, 2, 3, 4].map((i) => {
        const a = (i / 5) * Math.PI * 2;
        return (
          <mesh
            key={i}
            position={[Math.cos(a) * 0.12, 0.18 + (i % 2) * 0.08, Math.sin(a) * 0.12]}
            rotation={[0.3, a, 0]}
          >
            <coneGeometry args={[0.11, 0.35, 5]} />
            <meshStandardMaterial color={i % 2 ? LEAF : VINE} roughness={0.75} />
          </mesh>
        );
      })}
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
