"use client";

import { Component, useEffect, useRef, type ErrorInfo, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Stars } from "@react-three/drei";
import * as THREE from "three";
import { CombatLayer } from "@/components/combat/CombatLayer";
import { BossArenas } from "@/components/game/BossArena";
import { Bosses } from "@/components/game/Bosses";
import { FusionAltars } from "@/components/game/FusionAltar";
import { LightingRig } from "@/components/game/LightingRig";
import { LightPool } from "@/components/game/LightPool";
import { Player } from "@/components/game/Player";
import { PowerPickups } from "@/components/game/PowerPickups";
import { Powerups } from "@/components/game/Powerups";
import { Talismans } from "@/components/game/Talismans";
import { World } from "@/components/game/World";
import { runtime, useGameStore, type Character } from "@/lib/store";
import { BIOME_INFO } from "@/lib/world-data";

const PITCH_MIN = 0.08;
const PITCH_MAX = 1.15;
const CANVAS_GL = {
  antialias: true,
  alpha: false,
  powerPreference: "high-performance" as const,
  toneMappingExposure: 1.28,
};
const CANVAS_CAMERA = {
  fov: 60,
  near: 0.1,
  far: 420,
  position: [0, 3.2, 6] as [number, number, number],
};

class SceneErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Nightfall scene error", error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.failed) {
      return (
        <mesh position={[0, 1.2, 0]}>
          <boxGeometry args={[2.2, 2.2, 2.2]} />
          <meshBasicMaterial color="#4a6288" />
        </mesh>
      );
    }
    return this.props.children;
  }
}

/** Eases fog and sky toward the colour of whichever biome the survivor is in. */
function BiomeAtmosphere() {
  const scene = useThree((s) => s.scene);
  const target = useRef(new THREE.Color(BIOME_INFO.forest.fog));

  useFrame((_, delta) => {
    target.current.set(BIOME_INFO[runtime.biome].fog);
    const k = 1 - Math.exp(-0.9 * Math.min(delta, 0.1));
    if (scene.fog instanceof THREE.Fog) scene.fog.color.lerp(target.current, k);
    if (scene.background instanceof THREE.Color) scene.background.lerp(target.current, k);
  });
  return null;
}

export function GameCanvas({ character }: { character: Character }) {
  const wrapper = useRef<HTMLDivElement>(null);
  const unlockedAt = useRef(0);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!document.pointerLockElement) return;
      runtime.camYaw -= e.movementX * 0.0026;
      runtime.camPitch = Math.min(
        PITCH_MAX,
        Math.max(PITCH_MIN, runtime.camPitch + e.movementY * 0.002)
      );
    };
    const onLockChange = () => {
      if (document.pointerLockElement) {
        runtime.hadPointerLock = true;
        runtime.paused = false;
        return;
      }
      if (useGameStore.getState().skillMenuOpen) {
        runtime.paused = true;
        unlockedAt.current = 0;
        return;
      }
      unlockedAt.current = performance.now();
      if (runtime.hadPointerLock) {
        runtime.paused = true;
      }
    };
    const onLockError = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
    };
    const onMouseDown = (e: MouseEvent) => {
      if (!document.pointerLockElement || e.button !== 0) return;
      runtime.fireHeld = true;
      runtime.fireClicked = true;
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button !== 0) return;
      runtime.fireHeld = false;
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("pointerlockchange", onLockChange);
    document.addEventListener("pointerlockerror", onLockError);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("pointerlockchange", onLockChange);
      document.removeEventListener("pointerlockerror", onLockError);
    };
  }, []);

  const enterForest = () => {
    if (useGameStore.getState().skillMenuOpen) return;
    runtime.paused = false;
    if (document.pointerLockElement) return;
    if (performance.now() - unlockedAt.current < 1300) return;
    const canvas = wrapper.current?.querySelector("canvas");
    if (!canvas) return;
    try {
      const pending = canvas.requestPointerLock();
      if (pending && typeof pending.catch === "function") {
        pending.catch(() => {
          unlockedAt.current = performance.now();
        });
      }
    } catch {
      unlockedAt.current = performance.now();
    }
  };

  return (
    <div ref={wrapper} className="absolute inset-0 bg-[#0a101c]" onClick={enterForest}>
      <Canvas
        shadows
        dpr={[1, 1.25]}
        gl={CANVAS_GL}
        camera={CANVAS_CAMERA}
        className="h-full w-full"
        onCreated={({ gl }) => {
          gl.setClearColor("#0a101c", 1);
          gl.shadowMap.type = THREE.PCFShadowMap;
        }}
      >
        <color attach="background" args={["#0a101c"]} />
        <fog attach="fog" args={["#0a101c", 18, 92]} />

        <LightingRig />
        <BiomeAtmosphere />
        <LightPool />
        <Stars radius={300} depth={40} count={500} factor={4} saturation={0} speed={0.4} />

        <SceneErrorBoundary>
          <World />
          <Talismans />
          <Powerups />
          <PowerPickups />
          <FusionAltars />
          <BossArenas />
          <Player character={character} />
          <CombatLayer />
          <Bosses />
        </SceneErrorBoundary>
      </Canvas>
    </div>
  );
}
