"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import {
  BIOME_INFO,
  DOOR_HALF,
  DOOR_HEIGHT,
  HOUSES,
  PORCH_DEPTH,
  WALL_THICKNESS,
  hasPorch,
  type HousePlacement,
} from "@/lib/world-data";
import { useStoneTexture, useWoodTexture } from "@/lib/proc-textures";
import { useLightEmitter } from "@/lib/light-pool";

const LOG_ROWS = 10;
const ROOF_PITCH = 0.62;
const ROOF_OVERHANG = 0.75;
const LOG_TINTS = ["#b3906a", "#caa67c", "#6f655c"] as const;

type Vec3 = [number, number, number];

const LOG_R = WALL_THICKNESS / 2;
const WALL_TOP = LOG_ROWS * WALL_THICKNESS;
/** Wall heights of the marsh shack and the graveyard crypt. */
const SHACK_WALL = 2.85;
const CRYPT_WALL = 3.0;
const CRYPT_PITCH = 0.42;

interface CabinMaterials {
  logSide: THREE.MeshStandardMaterial;
  logCap: THREE.MeshStandardMaterial;
  foundation: THREE.MeshStandardMaterial;
  floor: THREE.MeshStandardMaterial;
  gable: THREE.MeshStandardMaterial;
  roof: THREE.MeshStandardMaterial;
  darkWood: THREE.MeshStandardMaterial;
  trim: THREE.MeshStandardMaterial;
  rail: THREE.MeshStandardMaterial;
  door: THREE.MeshStandardMaterial;
  chimney: THREE.MeshStandardMaterial;
  glassDark: THREE.MeshStandardMaterial;
  iron: THREE.MeshStandardMaterial;
  /** Marsh shack: weathered grey-green planks and rusted tin. */
  plank: THREE.MeshStandardMaterial;
  plankDark: THREE.MeshStandardMaterial;
  tin: THREE.MeshStandardMaterial;
  /** Graveyard crypt: pale masonry, dark slate, and marble. */
  masonry: THREE.MeshStandardMaterial;
  masonryDark: THREE.MeshStandardMaterial;
  slate: THREE.MeshStandardMaterial;
  marble: THREE.MeshStandardMaterial;
}

function useCabinMaterials(): CabinMaterials {
  const wood = useWoodTexture();
  const stone = useStoneTexture();
  const mats = useMemo<CabinMaterials>(
    () => ({
      // White base so per-instance tints control the log colour.
      logSide: new THREE.MeshStandardMaterial({ map: wood, color: "#ffffff", roughness: 0.9 }),
      logCap: new THREE.MeshStandardMaterial({ color: "#f2d6a6", roughness: 0.85 }),
      foundation: new THREE.MeshStandardMaterial({ map: stone, color: "#77706a", roughness: 0.97 }),
      floor: new THREE.MeshStandardMaterial({ map: wood, color: "#5b432c", roughness: 0.92 }),
      gable: new THREE.MeshStandardMaterial({ map: wood, color: "#7a5a3c", roughness: 0.9 }),
      roof: new THREE.MeshStandardMaterial({ map: stone, color: "#3d3836", roughness: 0.96 }),
      darkWood: new THREE.MeshStandardMaterial({ map: wood, color: "#3c2a1a", roughness: 0.9 }),
      trim: new THREE.MeshStandardMaterial({ map: wood, color: "#8c6a48", roughness: 0.88 }),
      rail: new THREE.MeshStandardMaterial({ map: wood, color: "#a8865e", roughness: 0.88 }),
      door: new THREE.MeshStandardMaterial({ map: wood, color: "#6b4a2e", roughness: 0.86 }),
      chimney: new THREE.MeshStandardMaterial({ map: stone, color: "#58534f", roughness: 0.98 }),
      glassDark: new THREE.MeshStandardMaterial({
        color: "#141b22",
        emissive: "#2a3a48",
        emissiveIntensity: 0.25,
        roughness: 0.3,
        metalness: 0.2,
      }),
      iron: new THREE.MeshStandardMaterial({ color: "#1d1a18", roughness: 0.6, metalness: 0.6 }),
      plank: new THREE.MeshStandardMaterial({ map: wood, color: "#7d8a6c", roughness: 0.94 }),
      plankDark: new THREE.MeshStandardMaterial({ map: wood, color: "#4a5442", roughness: 0.95 }),
      tin: new THREE.MeshStandardMaterial({ map: stone, color: "#5c625c", roughness: 0.55, metalness: 0.5 }),
      masonry: new THREE.MeshStandardMaterial({ map: stone, color: "#9a9ca4", roughness: 0.9 }),
      masonryDark: new THREE.MeshStandardMaterial({ map: stone, color: "#6a6c74", roughness: 0.92 }),
      slate: new THREE.MeshStandardMaterial({ map: stone, color: "#2e3038", roughness: 0.85 }),
      marble: new THREE.MeshStandardMaterial({ color: "#c9cbd2", roughness: 0.35, metalness: 0.05 }),
    }),
    [wood, stone]
  );
  useEffect(() => {
    return () => {
      Object.values(mats).forEach((m) => m.dispose());
    };
  }, [mats]);
  return mats;
}

export function Houses() {
  const mats = useCabinMaterials();
  return (
    <group>
      <LogWalls mats={mats} />
      {HOUSES.map((house, i) => {
        if (house.kind === "shack") return <ShackDetails key={i} house={house} mats={mats} />;
        if (house.kind === "crypt") return <CryptDetails key={i} house={house} mats={mats} />;
        return <CabinDetails key={i} house={house} mats={mats} />;
      })}
    </group>
  );
}

/** Triangular gable end, extruded to the wall thickness and centred on it. */
function useGableGeometry(roofHalf: number, peak: number, thickness: number): THREE.ExtrudeGeometry {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-roofHalf + 0.05, 0);
    shape.lineTo(roofHalf - 0.05, 0);
    shape.lineTo(0, peak);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
    geo.translate(0, 0, -thickness / 2);
    return geo;
  }, [roofHalf, peak, thickness]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return geometry;
}

/** Distance-gated flickering lamp by the door; colour follows the biome. */
function DoorLantern({
  house,
  position,
  mats,
  dim = false,
}: {
  house: HousePlacement;
  position: Vec3;
  mats: CabinMaterials;
  dim?: boolean;
}) {
  const anchor = useRef<THREE.Object3D>(null);
  const glass = useRef<THREE.MeshStandardMaterial>(null);
  const color = BIOME_INFO[house.biome].lamp;
  const seed = house.x * 0.13;
  const setLamp = useLightEmitter(anchor, dim ? "#8aa0b8" : color, 14, 6);

  useFrame((state) => {
    const flicker = lampFlicker(state.clock.elapsedTime, seed);
    if (glass.current) glass.current.emissiveIntensity = dim ? 0.3 : 1.2 + flicker;
    setLamp(dim ? 2.2 : 6 + flicker * 2.6);
  });

  return (
    <group position={position}>
      <mesh position={[0, 0.3, -0.12]} material={mats.iron}>
        <boxGeometry args={[0.06, 0.06, 0.32]} />
      </mesh>
      <mesh>
        <boxGeometry args={[0.24, 0.32, 0.24]} />
        <meshStandardMaterial
          ref={glass}
          color={dim ? "#141b22" : color}
          emissive={dim ? "#2a3a48" : color}
          emissiveIntensity={dim ? 0.3 : 1.4}
          roughness={0.25}
          transparent
          opacity={0.92}
        />
      </mesh>
      <mesh position={[0, 0.19, 0]} material={mats.iron}>
        <boxGeometry args={[0.28, 0.06, 0.28]} />
      </mesh>
      <mesh position={[0, -0.19, 0]} material={mats.iron}>
        <boxGeometry args={[0.28, 0.05, 0.28]} />
      </mesh>
      <object3D ref={anchor} position={[0, -0.1, 0.15]} />
    </group>
  );
}

/** The five wall slabs that match `houseSolids` in world-data (door gap in front). */
function WallBoxes({
  house,
  height,
  floorY,
  material,
}: {
  house: HousePlacement;
  height: number;
  floorY: number;
  material: THREE.Material;
}) {
  const hw = house.halfW;
  const hd = house.halfD;
  const t = WALL_THICKNESS;
  const y = floorY + height / 2;
  const frontSeg = hw - DOOR_HALF;
  return (
    <group>
      <mesh position={[-hw + t / 2, y, 0]} material={material} castShadow receiveShadow>
        <boxGeometry args={[t, height, hd * 2]} />
      </mesh>
      <mesh position={[hw - t / 2, y, 0]} material={material} castShadow receiveShadow>
        <boxGeometry args={[t, height, hd * 2]} />
      </mesh>
      <mesh position={[0, y, -hd + t / 2]} material={material} castShadow receiveShadow>
        <boxGeometry args={[hw * 2, height, t]} />
      </mesh>
      <mesh position={[-(DOOR_HALF + frontSeg / 2), y, hd - t / 2]} material={material} castShadow receiveShadow>
        <boxGeometry args={[frontSeg, height, t]} />
      </mesh>
      <mesh position={[DOOR_HALF + frontSeg / 2, y, hd - t / 2]} material={material} castShadow receiveShadow>
        <boxGeometry args={[frontSeg, height, t]} />
      </mesh>
      {/* Lintel over the door */}
      <mesh position={[0, floorY + DOOR_HEIGHT + (height - DOOR_HEIGHT) / 2, hd - t / 2]} material={material} castShadow>
        <boxGeometry args={[DOOR_HALF * 2 + 0.02, height - DOOR_HEIGHT, t]} />
      </mesh>
    </group>
  );
}

/* ---------------------------------------------------------------------- */
/* Log walls: every log of every cabin in one instanced draw call.         */
/* ---------------------------------------------------------------------- */

interface LogInstance {
  house: HousePlacement;
  lx: number;
  ly: number;
  lz: number;
  rotY: number;
  length: number;
  radius: number;
  color: string;
}

function buildLogs(): LogInstance[] {
  const list: LogInstance[] = [];
  const base = new THREE.Color();
  HOUSES.forEach((house, hi) => {
    if (house.kind !== "cabin") return;
    const r = LOG_R;
    const d = r * 2;
    const hw = house.halfW;
    const hd = house.halfD;
    base.set(LOG_TINTS[house.variant]);
    for (let i = 0; i < LOG_ROWS; i++) {
      const shade = 0.86 + ((i * 37 + hi * 11) % 9) / 45;
      const color = `#${base.clone().multiplyScalar(shade).getHexString()}`;
      const yX = r + i * d;
      // Side rows sit half a log higher so the corners interlock.
      const yZ = d + i * d;
      const push = (lx: number, ly: number, lz: number, rotY: number, length: number) => {
        list.push({ house, lx, ly, lz, rotY, length, radius: r, color });
      };
      push(-hw + r, yZ, 0, Math.PI / 2, hd * 2 + d * 2);
      push(hw - r, yZ, 0, Math.PI / 2, hd * 2 + d * 2);
      push(0, yX, -hd + r, 0, hw * 2 + d * 2);
      if (yX + r < DOOR_HEIGHT + 0.12) {
        const segLen = hw + d - DOOR_HALF;
        push(-(DOOR_HALF + segLen / 2), yX, hd - r, 0, segLen);
        push(DOOR_HALF + segLen / 2, yX, hd - r, 0, segLen);
      } else {
        push(0, yX, hd - r, 0, hw * 2 + d * 2);
      }
    }
  });
  return list;
}

function LogWalls({ mats }: { mats: CabinMaterials }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const logs = useMemo(() => buildLogs(), []);
  const geometry = useMemo(() => {
    const g = new THREE.CylinderGeometry(1, 1, 1, 12);
    g.rotateZ(Math.PI / 2);
    return g;
  }, []);
  const materials = useMemo(
    () => [mats.logSide, mats.logCap, mats.logCap],
    [mats.logSide, mats.logCap]
  );

  useEffect(() => () => geometry.dispose(), [geometry]);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const houseMat = new THREE.Matrix4();
    const local = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const color = new THREE.Color();
    logs.forEach((log, i) => {
      houseMat.compose(
        pos.set(log.house.x, 0, log.house.z),
        q.setFromAxisAngle(up, log.house.rot),
        scl.set(1, 1, 1)
      );
      local.compose(
        pos.set(log.lx, log.ly, log.lz),
        q.setFromAxisAngle(up, log.rotY),
        scl.set(log.length, log.radius, log.radius)
      );
      houseMat.multiply(local);
      mesh.setMatrixAt(i, houseMat);
      mesh.setColorAt(i, color.set(log.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [logs]);

  return (
    <instancedMesh
      ref={ref}
      args={[geometry, materials, logs.length]}
      castShadow
      receiveShadow
      frustumCulled={false}
    />
  );
}

/* ---------------------------------------------------------------------- */
/* Per-cabin details: roof, porch, door, windows, chimney, lantern.        */
/* ---------------------------------------------------------------------- */

function CabinDetails({ house, mats }: { house: HousePlacement; mats: CabinMaterials }) {
  const { x, z, rot, variant } = house;
  const hw = house.halfW;
  const hd = house.halfD;
  const t = WALL_THICKNESS;
  const top = WALL_TOP;
  const roofHalf = hw + ROOF_OVERHANG;
  const peak = roofHalf * Math.tan(ROOF_PITCH);
  const slabLen = roofHalf / Math.cos(ROOF_PITCH) + 0.25;
  const roofDepth = hd * 2 + 1.3;
  const porch = hasPorch(house);
  const ruined = variant === 2;
  const floorY = house.floorY;
  const seed = x * 0.13;

  const gableGeometry = useGableGeometry(roofHalf, peak, t);

  const frontWindows = hw - DOOR_HALF > 2.1;
  const frontWindowX = (DOOR_HALF + hw) / 2 + 0.05;

  return (
    <group position={[x, 0, z]} rotation={[0, rot, 0]}>
      {/* Stone foundation + plank floor */}
      <mesh position={[0, 0.1, 0]} material={mats.foundation} receiveShadow>
        <boxGeometry args={[hw * 2 + 0.3, 0.2, hd * 2 + 0.3]} />
      </mesh>
      <mesh position={[0, floorY - 0.03, 0]} material={mats.floor} receiveShadow>
        <boxGeometry args={[hw * 2 - 0.2, 0.06, hd * 2 - 0.2]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, floorY + 0.01, 0]}>
        <ringGeometry args={[Math.min(hw, hd) * 0.18, Math.min(hw, hd) * 0.26, 28]} />
        <meshBasicMaterial color="#d4b06a" transparent opacity={0.3} />
      </mesh>

      {/* Gable ends */}
      <mesh geometry={gableGeometry} material={mats.gable} position={[0, top, hd - t / 2]} castShadow />
      <mesh geometry={gableGeometry} material={mats.gable} position={[0, top, -hd + t / 2]} castShadow />

      {/* Roof slabs + ridge */}
      <mesh
        position={[-roofHalf / 2, top + peak / 2 + 0.06, 0]}
        rotation={[0, 0, ROOF_PITCH]}
        material={mats.roof}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[ruined ? slabLen * 0.72 : slabLen, 0.14, roofDepth]} />
      </mesh>
      <mesh
        position={[roofHalf / 2, top + peak / 2 + 0.06, 0]}
        rotation={[0, 0, -ROOF_PITCH]}
        material={mats.roof}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[slabLen, 0.14, roofDepth]} />
      </mesh>
      <mesh position={[0, top + peak + 0.1, 0]} material={mats.darkWood} castShadow>
        <boxGeometry args={[0.26, 0.2, roofDepth + 0.1]} />
      </mesh>

      {/* Chimney */}
      {!ruined && (
        <group position={[hw * 0.55, top + 0.7, -hd * 0.3]}>
          <mesh material={mats.chimney} castShadow>
            <boxGeometry args={[0.7, 3.4, 0.7]} />
          </mesh>
          <mesh position={[0, 1.78, 0]} material={mats.chimney}>
            <boxGeometry args={[0.86, 0.16, 0.86]} />
          </mesh>
        </group>
      )}

      {/* Door frame */}
      <mesh position={[-(DOOR_HALF + 0.09), DOOR_HEIGHT / 2 + 0.05, hd - t / 2]} material={mats.darkWood} castShadow>
        <boxGeometry args={[0.18, DOOR_HEIGHT + 0.1, t + 0.16]} />
      </mesh>
      <mesh position={[DOOR_HALF + 0.09, DOOR_HEIGHT / 2 + 0.05, hd - t / 2]} material={mats.darkWood} castShadow>
        <boxGeometry args={[0.18, DOOR_HEIGHT + 0.1, t + 0.16]} />
      </mesh>
      <mesh position={[0, DOOR_HEIGHT + 0.16, hd - t / 2]} material={mats.darkWood} castShadow>
        <boxGeometry args={[DOOR_HALF * 2 + 0.4, 0.22, t + 0.16]} />
      </mesh>

      {/* Doors, swung open into the cabin so the way in is obvious */}
      {!ruined && (
        <DoorPanel
          hinge={[-DOOR_HALF, floorY, hd - t / 2 - 0.06]}
          swing={1.95}
          width={DOOR_HALF - 0.04}
          mats={mats}
          withWindow={variant === 0}
        />
      )}
      <DoorPanel
        hinge={[DOOR_HALF, floorY, hd - t / 2 - 0.06]}
        swing={ruined ? -2.4 : -1.75}
        width={DOOR_HALF - 0.04}
        mirrored
        mats={mats}
        withWindow={variant === 0}
        tilt={ruined ? 0.1 : 0}
      />

      {/* Windows */}
      <CabinWindow
        position={[-hw - 0.02, 1.9, 0]}
        rotation={[0, -Math.PI / 2, 0]}
        seed={seed}
        ruined={ruined}
        mats={mats}
        boarded={variant !== 0}
      />
      <CabinWindow
        position={[hw + 0.02, 1.9, 0]}
        rotation={[0, Math.PI / 2, 0]}
        seed={seed}
        ruined={ruined}
        mats={mats}
        boarded={variant !== 0}
      />
      {frontWindows && (
        <>
          <CabinWindow
            position={[-frontWindowX, 1.85, hd + 0.02]}
            seed={seed}
            ruined={ruined}
            mats={mats}
            boarded={variant !== 0}
          />
          <CabinWindow
            position={[frontWindowX, 1.85, hd + 0.02]}
            seed={seed}
            ruined={ruined}
            mats={mats}
            boarded={variant !== 0}
          />
        </>
      )}

      {/* Porch */}
      {porch && <Porch house={house} mats={mats} withRoof={variant === 1} />}

      {/* Lantern beside the door */}
      <DoorLantern house={house} position={[DOOR_HALF + 0.55, 2.15, hd + 0.2]} mats={mats} dim={ruined} />

      {/* A little clutter inside */}
      <mesh position={[-hw + 1.1, floorY + 0.35, -hd + 1.1]} material={mats.trim} castShadow>
        <boxGeometry args={[0.7, 0.7, 0.7]} />
      </mesh>
      <mesh position={[hw - 1.4, floorY + 0.72, -hd + 1.3]} material={mats.darkWood} castShadow>
        <boxGeometry args={[1.5, 0.08, 0.8]} />
      </mesh>
      <mesh position={[hw - 1.4, floorY + 0.36, -hd + 1.3]} material={mats.darkWood}>
        <boxGeometry args={[1.3, 0.64, 0.12]} />
      </mesh>
    </group>
  );
}

/* ---------------------------------------------------------------------- */
/* Drowned Marsh: plank shack on stilts with a tin roof and a ramp.        */
/* ---------------------------------------------------------------------- */

function ShackDetails({ house, mats }: { house: HousePlacement; mats: CabinMaterials }) {
  const { x, z, rot, variant } = house;
  const hw = house.halfW;
  const hd = house.halfD;
  const t = WALL_THICKNESS;
  const floorY = house.floorY;
  const top = floorY + SHACK_WALL;
  const seed = x * 0.13;
  // Single-pitch tin roof: high at the door, sloping to the back.
  const roofRise = 0.7;
  const roofLen = hd * 2 + 1.6;
  const roofTilt = Math.atan(roofRise / roofLen);

  const stilts = useMemo(() => {
    const list: Vec3[] = [];
    const cols = [-hw + 0.3, 0, hw - 0.3];
    const rows = [-hd + 0.3, 0, hd - 0.3];
    for (const sx of cols) for (const sz of rows) list.push([sx, floorY / 2, sz]);
    list.push([-hw + 0.3, floorY / 2, hd + PORCH_DEPTH - 0.3]);
    list.push([hw - 0.3, floorY / 2, hd + PORCH_DEPTH - 0.3]);
    return list;
  }, [hw, hd, floorY]);

  const battens = useMemo(() => {
    const list: { pos: Vec3; rot: number }[] = [];
    const count = Math.max(3, Math.round(hd * 2 / 0.75));
    for (let i = 0; i <= count; i++) {
      const lz = -hd + (i / count) * hd * 2;
      list.push({ pos: [-hw - 0.03, floorY + SHACK_WALL / 2, lz], rot: 0 });
      list.push({ pos: [hw + 0.03, floorY + SHACK_WALL / 2, lz], rot: 0 });
    }
    const back = Math.max(3, Math.round(hw * 2 / 0.75));
    for (let i = 0; i <= back; i++) {
      const lx = -hw + (i / back) * hw * 2;
      list.push({ pos: [lx, floorY + SHACK_WALL / 2, -hd - 0.03], rot: Math.PI / 2 });
    }
    return list;
  }, [hw, hd, floorY]);

  return (
    <group position={[x, 0, z]} rotation={[0, rot, 0]}>
      {/* Stilts and floor */}
      {stilts.map((p, i) => (
        <mesh key={i} position={p} material={mats.plankDark} castShadow>
          <cylinderGeometry args={[0.11, 0.14, floorY, 7]} />
        </mesh>
      ))}
      <mesh position={[0, floorY - 0.06, 0]} material={mats.floor} receiveShadow castShadow>
        <boxGeometry args={[hw * 2 + 0.1, 0.12, hd * 2 + 0.1]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, floorY + 0.01, 0]}>
        <ringGeometry args={[Math.min(hw, hd) * 0.18, Math.min(hw, hd) * 0.26, 28]} />
        <meshBasicMaterial color="#8fd08a" transparent opacity={0.3} />
      </mesh>

      <WallBoxes house={house} height={SHACK_WALL} floorY={floorY} material={mats.plank} />
      {battens.map((b, i) => (
        <mesh key={i} position={b.pos} rotation={[0, b.rot, 0]} material={mats.plankDark}>
          <boxGeometry args={[0.07, SHACK_WALL - 0.05, 0.12]} />
        </mesh>
      ))}

      {/* Tin roof, slanted toward the back, with a rusted pipe */}
      <mesh
        position={[0, top + roofRise / 2 + 0.05, -0.2]}
        rotation={[roofTilt, 0, 0]}
        material={mats.tin}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[hw * 2 + 1.1, 0.1, roofLen]} />
      </mesh>
      {[-0.6, -0.2, 0.2, 0.6].map((f) => (
        <mesh
          key={f}
          position={[f * hw, top + roofRise / 2 + 0.12, -0.2]}
          rotation={[roofTilt, 0, 0]}
          material={mats.plankDark}
        >
          <boxGeometry args={[0.06, 0.05, roofLen]} />
        </mesh>
      ))}
      <mesh position={[hw * 0.5, top + 0.95, -hd * 0.4]} material={mats.iron} castShadow>
        <cylinderGeometry args={[0.11, 0.11, 1.3, 8]} />
      </mesh>
      {/* Front fascia closes the gap under the raised roof edge */}
      <mesh position={[0, top + roofRise * 0.5, hd - t / 2]} material={mats.plankDark} castShadow>
        <boxGeometry args={[hw * 2, roofRise + 0.1, t]} />
      </mesh>

      {/* Door frame + single door swung inward */}
      <mesh position={[-(DOOR_HALF + 0.09), floorY + DOOR_HEIGHT / 2 + 0.05, hd - t / 2]} material={mats.plankDark} castShadow>
        <boxGeometry args={[0.18, DOOR_HEIGHT + 0.1, t + 0.14]} />
      </mesh>
      <mesh position={[DOOR_HALF + 0.09, floorY + DOOR_HEIGHT / 2 + 0.05, hd - t / 2]} material={mats.plankDark} castShadow>
        <boxGeometry args={[0.18, DOOR_HEIGHT + 0.1, t + 0.14]} />
      </mesh>
      <DoorPanel
        hinge={[-DOOR_HALF, floorY, hd - t / 2 - 0.06]}
        swing={2.1}
        width={DOOR_HALF * 2 - 0.1}
        mats={mats}
        withWindow={false}
        planks
      />

      {/* Boarded windows */}
      <CabinWindow
        position={[-hw - 0.02, floorY + 1.7, 0]}
        rotation={[0, -Math.PI / 2, 0]}
        seed={seed}
        ruined={false}
        mats={mats}
        boarded
        glow={BIOME_INFO.swamp.lamp}
      />
      <CabinWindow
        position={[hw + 0.02, floorY + 1.7, 0]}
        rotation={[0, Math.PI / 2, 0]}
        seed={seed}
        ruined={false}
        mats={mats}
        boarded
        glow={BIOME_INFO.swamp.lamp}
      />

      <Porch house={house} mats={mats} withRoof={false} />

      <DoorLantern house={house} position={[DOOR_HALF + 0.55, floorY + 1.95, hd + 0.2]} mats={mats} />

      {/* Deck clutter: a barrel and a coil of rope */}
      <mesh position={[-hw + 0.7, floorY + 0.42, hd + PORCH_DEPTH - 0.7]} material={mats.plankDark} castShadow>
        <cylinderGeometry args={[0.32, 0.3, 0.84, 10]} />
      </mesh>
      <mesh position={[hw - 0.8, floorY + 0.05, hd + 0.7]} rotation={[-Math.PI / 2, 0, 0]} material={mats.rail}>
        <torusGeometry args={[0.24, 0.07, 6, 14]} />
      </mesh>
      {/* Cot and crate inside */}
      <mesh position={[-hw + 1.2, floorY + 0.28, -hd + 1.2]} material={mats.plankDark} castShadow>
        <boxGeometry args={[0.9, 0.36, 1.9]} />
      </mesh>
      <mesh position={[hw - 1.1, floorY + 0.35, -hd + 1.0]} material={mats.trim} castShadow>
        <boxGeometry args={[0.7, 0.7, 0.7]} />
      </mesh>
      {variant === 1 && (
        <mesh position={[hw - 1.2, floorY + 0.75, hd - 1.4]} material={mats.plankDark} castShadow>
          <boxGeometry args={[1.4, 0.08, 0.7]} />
        </mesh>
      )}
    </group>
  );
}

/* ---------------------------------------------------------------------- */
/* Ashen Graveyard: stone crypt with pediment, iron gates, and candles.    */
/* ---------------------------------------------------------------------- */

function CryptDetails({ house, mats }: { house: HousePlacement; mats: CabinMaterials }) {
  const { x, z, rot, variant } = house;
  const hw = house.halfW;
  const hd = house.halfD;
  const t = WALL_THICKNESS;
  const floorY = house.floorY;
  const top = floorY + CRYPT_WALL;
  const roofHalf = hw + 0.45;
  const peak = roofHalf * Math.tan(CRYPT_PITCH);
  const slabLen = roofHalf / Math.cos(CRYPT_PITCH) + 0.2;
  const roofDepth = hd * 2 + 0.9;
  const gable = useGableGeometry(roofHalf, peak, t + 0.1);
  const pedimentHalf = DOOR_HALF + 0.95;
  const pediment = useGableGeometry(pedimentHalf, 0.75, 0.3);
  const candle = useRef<THREE.Object3D>(null);
  const seed = x * 0.13;
  const setCandle = useLightEmitter(candle, BIOME_INFO.graveyard.lamp, 9, 2.4);

  useFrame((state) => {
    setCandle(2.4 + lampFlicker(state.clock.elapsedTime, seed + 3) * 1.6);
  });

  return (
    <group position={[x, 0, z]} rotation={[0, rot, 0]}>
      {/* Plinth (its top is the floor) and the entrance step */}
      <mesh position={[0, floorY / 2, 0]} material={mats.masonryDark} receiveShadow castShadow>
        <boxGeometry args={[hw * 2 + 0.1, floorY, hd * 2 + 0.1]} />
      </mesh>
      <mesh position={[0, floorY / 4, hd + 0.3 + 0.3]} material={mats.masonryDark} receiveShadow>
        <boxGeometry args={[DOOR_HALF * 2 + 2.4, floorY / 2, 0.6]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, floorY + 0.01, 0]}>
        <ringGeometry args={[Math.min(hw, hd) * 0.18, Math.min(hw, hd) * 0.26, 28]} />
        <meshBasicMaterial color="#9ab6ff" transparent opacity={0.3} />
      </mesh>

      <WallBoxes house={house} height={CRYPT_WALL} floorY={floorY} material={mats.masonry} />

      {/* Corner pilasters and cornice */}
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <mesh
            key={`${sx}${sz}`}
            position={[sx * (hw - 0.05), floorY + CRYPT_WALL / 2, sz * (hd - 0.05)]}
            material={mats.masonryDark}
            castShadow
          >
            <boxGeometry args={[0.55, CRYPT_WALL + 0.1, 0.55]} />
          </mesh>
        ))
      )}
      <mesh position={[0, top + 0.12, 0]} material={mats.masonryDark} castShadow>
        <boxGeometry args={[hw * 2 + 0.5, 0.26, hd * 2 + 0.5]} />
      </mesh>

      {/* Low slate gable roof */}
      <mesh geometry={gable} material={mats.masonry} position={[0, top + 0.25, hd - t / 2]} castShadow />
      <mesh geometry={gable} material={mats.masonry} position={[0, top + 0.25, -hd + t / 2]} castShadow />
      <mesh
        position={[-roofHalf / 2, top + 0.25 + peak / 2 + 0.05, 0]}
        rotation={[0, 0, CRYPT_PITCH]}
        material={mats.slate}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[slabLen, 0.14, roofDepth]} />
      </mesh>
      <mesh
        position={[roofHalf / 2, top + 0.25 + peak / 2 + 0.05, 0]}
        rotation={[0, 0, -CRYPT_PITCH]}
        material={mats.slate}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[slabLen, 0.14, roofDepth]} />
      </mesh>
      {/* Cross on the ridge */}
      <group position={[0, top + 0.25 + peak + 0.55, hd - 0.6]}>
        <mesh material={mats.marble} castShadow>
          <boxGeometry args={[0.12, 1.1, 0.12]} />
        </mesh>
        <mesh position={[0, 0.2, 0]} material={mats.marble} castShadow>
          <boxGeometry args={[0.6, 0.12, 0.12]} />
        </mesh>
      </group>

      {/* Entrance: columns and pediment */}
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh position={[side * (DOOR_HALF + 0.55), floorY + (DOOR_HEIGHT + 0.3) / 2, hd + 0.5]} material={mats.masonry} castShadow>
            <cylinderGeometry args={[0.17, 0.2, DOOR_HEIGHT + 0.3, 10]} />
          </mesh>
          <mesh position={[side * (DOOR_HALF + 0.55), floorY + 0.1, hd + 0.5]} material={mats.masonryDark}>
            <boxGeometry args={[0.5, 0.2, 0.5]} />
          </mesh>
          {/* Urns at the front corners of the plinth */}
          <mesh position={[side * (hw + 0.05), floorY + 0.35, hd + 0.05]} material={mats.masonryDark} castShadow>
            <cylinderGeometry args={[0.2, 0.13, 0.7, 8]} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, floorY + DOOR_HEIGHT + 0.42, hd + 0.5]} material={mats.masonry} castShadow>
        <boxGeometry args={[pedimentHalf * 2 + 0.2, 0.24, 0.6]} />
      </mesh>
      <mesh geometry={pediment} material={mats.masonryDark} position={[0, floorY + DOOR_HEIGHT + 0.54, hd + 0.5]} castShadow />

      {/* Iron gates swung open */}
      <GatePanel hinge={[-DOOR_HALF, floorY, hd - t / 2]} swing={2.0} mats={mats} />
      <GatePanel hinge={[DOOR_HALF, floorY, hd - t / 2]} swing={-2.0} mats={mats} mirrored />

      {/* Sarcophagus with candles */}
      <group position={[0, floorY, -hd * 0.35]}>
        <mesh position={[0, 0.42, 0]} material={mats.masonryDark} castShadow receiveShadow>
          <boxGeometry args={[1.1, 0.84, 2.2]} />
        </mesh>
        <mesh position={[0, 0.9, 0]} material={mats.marble} castShadow>
          <boxGeometry args={[1.2, 0.12, 2.3]} />
        </mesh>
        {[-0.38, 0.38].map((cx) => (
          <group key={cx} position={[cx, 0.96, variant === 1 ? -0.8 : -0.6]}>
            <mesh position={[0, 0.12, 0]} material={mats.marble}>
              <cylinderGeometry args={[0.045, 0.05, 0.24, 6]} />
            </mesh>
            <mesh position={[0, 0.29, 0]}>
              <sphereGeometry args={[0.045, 6, 6]} />
              <meshBasicMaterial color={BIOME_INFO.graveyard.lamp} />
            </mesh>
          </group>
        ))}
        <object3D ref={candle} position={[0, 1.4, -0.6]} />
      </group>
      {variant === 1 && (
        <mesh position={[-hw + 0.9, floorY + 1.1, -hd + 0.5]} material={mats.masonry} castShadow>
          <boxGeometry args={[1.2, 2.2, 0.5]} />
        </mesh>
      )}

      <DoorLantern house={house} position={[DOOR_HALF + 1.15, floorY + 1.95, hd + 0.75]} mats={mats} />
    </group>
  );
}

function GatePanel({
  hinge,
  swing,
  mats,
  mirrored = false,
}: {
  hinge: Vec3;
  swing: number;
  mats: CabinMaterials;
  mirrored?: boolean;
}) {
  const dir = mirrored ? -1 : 1;
  const width = DOOR_HALF - 0.05;
  const h = DOOR_HEIGHT - 0.12;
  const cx = (dir * width) / 2;
  const bars = 5;
  return (
    <group position={hinge} rotation={[0, swing, 0]}>
      <mesh position={[cx, h - 0.04, 0]} material={mats.iron}>
        <boxGeometry args={[width, 0.08, 0.06]} />
      </mesh>
      <mesh position={[cx, 0.08, 0]} material={mats.iron}>
        <boxGeometry args={[width, 0.08, 0.06]} />
      </mesh>
      <mesh position={[cx, h * 0.55, 0]} material={mats.iron}>
        <boxGeometry args={[width, 0.05, 0.05]} />
      </mesh>
      {Array.from({ length: bars }, (_, i) => (
        <mesh key={i} position={[dir * ((i + 0.5) / bars) * width, h / 2, 0]} material={mats.iron}>
          <cylinderGeometry args={[0.025, 0.025, h, 6]} />
        </mesh>
      ))}
      <mesh position={[dir * (width - 0.06), h / 2, 0]} material={mats.iron} castShadow>
        <boxGeometry args={[0.07, h, 0.07]} />
      </mesh>
    </group>
  );
}

function DoorPanel({
  hinge,
  swing,
  width,
  mats,
  mirrored = false,
  withWindow,
  tilt = 0,
  planks = false,
}: {
  hinge: Vec3;
  swing: number;
  width: number;
  mats: CabinMaterials;
  mirrored?: boolean;
  withWindow: boolean;
  tilt?: number;
  /** Weathered marsh finish instead of cabin oak. */
  planks?: boolean;
}) {
  const dir = mirrored ? -1 : 1;
  const h = DOOR_HEIGHT - 0.1;
  const cx = (dir * width) / 2;
  const face = planks ? mats.plank : mats.door;
  const strap = planks ? mats.plankDark : mats.darkWood;
  return (
    <group position={hinge} rotation={[0, swing, tilt]}>
      <mesh position={[cx, h / 2, 0]} material={face} castShadow>
        <boxGeometry args={[width, h, 0.07]} />
      </mesh>
      {[0.25, 0.5, 0.78].map((f) => (
        <mesh key={f} position={[cx, h * f, 0.05]} material={strap}>
          <boxGeometry args={[width - 0.08, 0.12, 0.04]} />
        </mesh>
      ))}
      <mesh position={[cx, h * 0.39, 0.05]} rotation={[0, 0, dir * 0.55]} material={strap}>
        <boxGeometry args={[width * 0.95, 0.09, 0.035]} />
      </mesh>
      {withWindow && (
        <mesh position={[cx, h * 0.72, 0.045]} material={mats.glassDark}>
          <boxGeometry args={[width * 0.42, 0.34, 0.02]} />
        </mesh>
      )}
      <mesh position={[dir * (width - 0.14), h * 0.48, 0.07]} material={mats.iron}>
        <boxGeometry args={[0.07, 0.16, 0.06]} />
      </mesh>
    </group>
  );
}

function lampFlicker(time: number, seed: number): number {
  const t = time + seed;
  return 0.55 + Math.sin(t * 7.4) * 0.18 + Math.sin(t * 19.1) * 0.1;
}

function CabinWindow({
  position,
  rotation,
  seed,
  ruined,
  mats,
  boarded,
  glow = "#ff9a3a",
}: {
  position: Vec3;
  rotation?: Vec3;
  seed: number;
  ruined: boolean;
  mats: CabinMaterials;
  boarded: boolean;
  /** Emissive colour of the lit pane (defaults to cabin firelight). */
  glow?: string;
}) {
  const glass = useRef<THREE.MeshStandardMaterial>(null);

  useFrame((state) => {
    if (!glass.current || ruined) return;
    glass.current.emissiveIntensity = lampFlicker(state.clock.elapsedTime, seed);
  });

  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0, 0, 0.04]} material={mats.darkWood} castShadow>
        <boxGeometry args={[1.34, 1.28, 0.14]} />
      </mesh>
      <mesh position={[0, 0, 0.1]}>
        <planeGeometry args={[1.1, 1.05]} />
        <meshStandardMaterial
          ref={glass}
          color={ruined ? "#141b22" : "#ffd089"}
          emissive={ruined ? "#2a3a48" : glow}
          emissiveIntensity={ruined ? 0.25 : 0.9}
          roughness={0.25}
          metalness={0.1}
        />
      </mesh>
      <mesh position={[0, -0.7, 0.16]} material={mats.trim}>
        <boxGeometry args={[1.5, 0.1, 0.22]} />
      </mesh>
      {boarded ? (
        <>
          <mesh position={[0, 0.18, 0.15]} rotation={[0, 0, 0.32]} material={mats.trim}>
            <boxGeometry args={[1.5, 0.2, 0.05]} />
          </mesh>
          <mesh position={[0, -0.22, 0.17]} rotation={[0, 0, -0.26]} material={mats.trim}>
            <boxGeometry args={[1.5, 0.2, 0.05]} />
          </mesh>
        </>
      ) : (
        <>
          <mesh position={[0, 0, 0.12]} material={mats.darkWood}>
            <boxGeometry args={[0.06, 1.05, 0.04]} />
          </mesh>
          <mesh position={[0, 0.05, 0.12]} material={mats.darkWood}>
            <boxGeometry args={[1.1, 0.06, 0.04]} />
          </mesh>
        </>
      )}
    </group>
  );
}

function Porch({
  house,
  mats,
  withRoof,
}: {
  house: HousePlacement;
  mats: CabinMaterials;
  withRoof: boolean;
}) {
  const hw = house.halfW;
  const hd = house.halfD;
  const top = WALL_TOP;
  const floorY = house.floorY;
  const railZ = hd + PORCH_DEPTH - 0.12;
  const railLen = hw - DOOR_HALF - 0.45;
  const railX = DOOR_HALF + 0.45 + railLen / 2;
  const postH = top - 0.55 - floorY;
  const weathered = house.kind === "shack";
  const rail = weathered ? mats.plank : mats.rail;
  const post = weathered ? mats.plankDark : mats.darkWood;
  const deck = weathered ? mats.plankDark : mats.floor;
  // Tall decks get a ramp; low ones a single step.
  const rampLen = 2.4;
  const rampTilt = Math.atan(floorY / rampLen);

  return (
    <group>
      <mesh position={[0, floorY - 0.07, hd + PORCH_DEPTH / 2]} material={deck} receiveShadow>
        <boxGeometry args={[hw * 2 + 0.3, 0.14, PORCH_DEPTH]} />
      </mesh>
      {floorY > 0.3 ? (
        <mesh
          position={[0, floorY / 2 - 0.04, hd + PORCH_DEPTH + rampLen / 2]}
          rotation={[rampTilt, 0, 0]}
          material={deck}
          receiveShadow
        >
          <boxGeometry args={[2.8, 0.1, Math.hypot(rampLen, floorY) + 0.1]} />
        </mesh>
      ) : (
        <mesh position={[0, 0.055, hd + PORCH_DEPTH + 0.3]} material={rail} receiveShadow>
          <boxGeometry args={[2.8, 0.11, 0.6]} />
        </mesh>
      )}

      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh position={[side * railX, floorY + 0.98, railZ]} material={rail} castShadow>
            <boxGeometry args={[railLen, 0.1, 0.12]} />
          </mesh>
          <mesh position={[side * railX, floorY + 0.42, railZ]} material={rail}>
            <boxGeometry args={[railLen, 0.08, 0.08]} />
          </mesh>
          <mesh position={[side * (DOOR_HALF + 0.45), floorY + 0.55, railZ]} material={post} castShadow>
            <boxGeometry args={[0.14, 1.1, 0.14]} />
          </mesh>
          {[0.33, 0.66].map((f) => (
            <mesh
              key={f}
              position={[side * (DOOR_HALF + 0.45 + railLen * f), floorY + 0.7, railZ]}
              material={rail}
            >
              <boxGeometry args={[0.06, 0.56, 0.06]} />
            </mesh>
          ))}
          {withRoof ? (
            <mesh position={[side * (hw - 0.2), floorY + postH / 2, railZ]} material={rail} castShadow>
              <boxGeometry args={[0.16, postH, 0.16]} />
            </mesh>
          ) : (
            <mesh position={[side * (hw - 0.05), floorY + 0.55, railZ]} material={post} castShadow>
              <boxGeometry args={[0.14, 1.1, 0.14]} />
            </mesh>
          )}
        </group>
      ))}

      {withRoof && (
        <mesh
          position={[0, top - 0.32, hd + PORCH_DEPTH / 2 + 0.1]}
          rotation={[0.3, 0, 0]}
          material={mats.roof}
          castShadow
        >
          <boxGeometry args={[hw * 2 + 0.5, 0.1, PORCH_DEPTH + 0.6]} />
        </mesh>
      )}
    </group>
  );
}
