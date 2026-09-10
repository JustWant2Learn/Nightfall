"use client";

import { useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useGameStore } from "@/lib/store";
import { Fireflies } from "@/components/game/Fireflies";
import { Houses } from "@/components/game/Houses";
import { Streetlights } from "@/components/game/Streetlights";
import { Trees } from "@/components/game/Trees";
import {
  BIOME_INFO,
  GATE_POSITION,
  GRASS,
  PUDDLES,
  ROCKS,
  TOMBSTONES,
  WORLD_HALF,
  biomeAt,
  type Placement,
} from "@/lib/world-data";
import { useGroundTexture, useStoneTexture } from "@/lib/proc-textures";

function useInstances(
  ref: RefObject<THREE.InstancedMesh | null>,
  placements: Placement[],
  configure: (dummy: THREE.Object3D, p: Placement) => void,
  colorize?: (p: Placement, out: THREE.Color) => void
) {
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    placements.forEach((p, i) => {
      dummy.position.set(p.x, 0, p.z);
      dummy.rotation.set(0, p.rot, 0);
      dummy.scale.setScalar(1);
      configure(dummy, p);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      if (colorize) {
        colorize(p, color);
        mesh.setColorAt(i, color);
      }
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [ref, placements, configure, colorize]);
}

const GRASS_TINT: Record<ReturnType<typeof biomeAt>, THREE.Color> = {
  forest: new THREE.Color("#2c4a32"),
  swamp: new THREE.Color("#3d5a30"),
  graveyard: new THREE.Color("#4a4a42"),
};

const colorizeGrass = (p: Placement, out: THREE.Color) => {
  out.copy(GRASS_TINT[biomeAt(p.x, p.z)]);
  out.multiplyScalar(0.85 + ((p.rot * 7.31) % 1) * 0.3);
};

const GROUND_SEGMENTS = 120;

/**
 * One big plane whose vertex colours follow the biome map, so the soil
 * turns murky in the marsh and ash-grey around the crypts.
 */
function buildGround(): THREE.PlaneGeometry {
  const size = WORLD_HALF * 2 + 40;
  const geometry = new THREE.PlaneGeometry(size, size, GROUND_SEGMENTS, GROUND_SEGMENTS);
  const pos = geometry.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const tints = {
    forest: new THREE.Color(BIOME_INFO.forest.ground),
    swamp: new THREE.Color(BIOME_INFO.swamp.ground),
    graveyard: new THREE.Color(BIOME_INFO.graveyard.ground),
  };
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    // The plane is rotated -90° about X, so local +Y becomes world -Z.
    const x = pos.getX(i);
    const z = -pos.getY(i);
    c.copy(tints[biomeAt(x, z)]);
    const n = Math.sin(x * 0.37) * Math.cos(z * 0.29) * 0.5 + Math.sin(x * 1.3 + z * 0.9) * 0.2;
    c.multiplyScalar(0.9 + n * 0.14);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geometry;
}

const configureRock = (dummy: THREE.Object3D, p: Placement) => {
  dummy.position.y = 0.18 * p.scale;
  dummy.scale.set(p.scale, p.scale * 0.7, p.scale);
};

const configureTombstone = (dummy: THREE.Object3D, p: Placement) => {
  dummy.position.y = 0.4 * p.scale;
  dummy.rotation.z = p.rot * 0.35;
  dummy.scale.setScalar(p.scale);
};

const configureGrass = (dummy: THREE.Object3D, p: Placement) => {
  dummy.position.y = 0.16 * p.scale;
  dummy.scale.setScalar(p.scale);
};

const configurePuddle = (dummy: THREE.Object3D, p: Placement) => {
  dummy.position.y = 0.03;
  dummy.scale.set(p.scale, 1, p.scale * 0.7);
};

export function World() {
  const rocks = useRef<THREE.InstancedMesh>(null);
  const tombstones = useRef<THREE.InstancedMesh>(null);
  const grass = useRef<THREE.InstancedMesh>(null);
  const puddles = useRef<THREE.InstancedMesh>(null);
  const ground = useGroundTexture();
  const stone = useStoneTexture();
  const groundGeometry = useMemo(() => buildGround(), []);
  const puddleGeometry = useMemo(() => new THREE.CircleGeometry(1, 18).rotateX(-Math.PI / 2), []);

  useInstances(rocks, ROCKS, configureRock);
  useInstances(tombstones, TOMBSTONES, configureTombstone);
  useInstances(grass, GRASS, configureGrass, colorizeGrass);
  useInstances(puddles, PUDDLES, configurePuddle);

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} geometry={groundGeometry} receiveShadow>
        <meshStandardMaterial
          map={ground}
          vertexColors
          roughness={0.95}
          metalness={0}
          envMapIntensity={0.15}
        />
      </mesh>

      <instancedMesh ref={puddles} args={[puddleGeometry, undefined, PUDDLES.length]} receiveShadow>
        <meshStandardMaterial color="#0a1412" roughness={0.12} metalness={0.55} envMapIntensity={0.6} />
      </instancedMesh>

      <Trees />
      <Fireflies />

      <instancedMesh ref={rocks} args={[undefined, undefined, ROCKS.length]} receiveShadow>
        <dodecahedronGeometry args={[0.5, 0]} />
        <meshStandardMaterial
          map={stone}
          color="#9aa0a8"
          roughness={0.88}
          metalness={0.08}
          envMapIntensity={0.3}
        />
      </instancedMesh>

      <instancedMesh ref={tombstones} args={[undefined, undefined, TOMBSTONES.length]} receiveShadow>
        <boxGeometry args={[0.55, 0.8, 0.12]} />
        <meshStandardMaterial
          map={stone}
          color="#8b9098"
          roughness={0.86}
          metalness={0.05}
          envMapIntensity={0.25}
        />
      </instancedMesh>

      <instancedMesh ref={grass} args={[undefined, undefined, GRASS.length]}>
        <coneGeometry args={[0.14, 0.36, 4]} />
        <meshStandardMaterial color="#ffffff" roughness={0.95} metalness={0} />
      </instancedMesh>

      <mesh position={[90, 70, -140]}>
        <sphereGeometry args={[8, 24, 18]} />
        <meshBasicMaterial color="#d8deeb" />
      </mesh>
      <mesh position={[90, 70, -140]}>
        <sphereGeometry args={[10, 24, 18]} />
        <meshBasicMaterial color="#aab6d4" transparent opacity={0.15} />
      </mesh>

      <Houses />
      <Streetlights />
      <EscapeGate />
    </group>
  );
}

function EscapeGate() {
  const gateOpen = useGameStore((s) => s.gateOpen);
  const portal = useRef<THREE.Mesh>(null);
  const stone = useStoneTexture();

  useFrame((state) => {
    const mesh = portal.current;
    if (!mesh) return;
    const mat = mesh.material;
    if (mat instanceof THREE.MeshStandardMaterial) {
      const pulse = 0.6 + Math.sin(state.clock.elapsedTime * 2.4) * 0.35;
      mat.emissiveIntensity = gateOpen ? 1.6 + pulse : 0.12;
      mat.opacity = gateOpen ? 0.85 : 0.25;
    }
  });

  return (
    <group position={[GATE_POSITION.x, 0, GATE_POSITION.z]}>
      <mesh position={[-1.6, 1.9, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.8, 3.8, 0.8]} />
        <meshStandardMaterial map={stone} color="#8d9198" roughness={0.86} metalness={0.08} />
      </mesh>
      <mesh position={[1.6, 1.9, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.8, 3.8, 0.8]} />
        <meshStandardMaterial map={stone} color="#8d9198" roughness={0.86} metalness={0.08} />
      </mesh>
      <mesh position={[0, 3.9, 0]} castShadow receiveShadow>
        <boxGeometry args={[4.4, 0.7, 0.9]} />
        <meshStandardMaterial map={stone} color="#7e838c" roughness={0.86} metalness={0.08} />
      </mesh>
      <mesh ref={portal} position={[0, 1.8, 0]}>
        <planeGeometry args={[2.4, 3.5]} />
        <meshStandardMaterial
          color="#7fd4ff"
          emissive="#4db8ff"
          emissiveIntensity={0.12}
          transparent
          opacity={0.25}
          side={THREE.DoubleSide}
          roughness={0.2}
          metalness={0.3}
          envMapIntensity={0.8}
        />
      </mesh>
      {gateOpen && (
        <pointLight position={[0, 2.2, 1]} color="#66c4ff" intensity={8} distance={16} decay={2} />
      )}
    </group>
  );
}
