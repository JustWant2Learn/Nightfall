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
const LOOK_SENS = 0.0032;
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

function uiBlocksPointer(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest("[data-ui-block]"));
}

export function GameCanvas({ character }: { character: Character }) {
  const wrapper = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = wrapper.current;
    if (!el) return;

    const syncCursor = (clientX: number, clientY: number) => {
      const rect = el.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      runtime.cursorX = x;
      runtime.cursorY = y;
      const w = Math.max(1, rect.width);
      const h = Math.max(1, rect.height);
      runtime.aimNdcX = (x / w) * 2 - 1;
      runtime.aimNdcY = -((y / h) * 2 - 1);
    };

    const onMouseMove = (e: MouseEvent) => {
      if (runtime.looking && !runtime.paused) {
        runtime.camYaw -= e.movementX * LOOK_SENS;
        runtime.camPitch = Math.min(
          PITCH_MAX,
          Math.max(PITCH_MIN, runtime.camPitch + e.movementY * LOOK_SENS * 0.85)
        );
        return;
      }
      syncCursor(e.clientX, e.clientY);
    };

    const onMouseDown = (e: MouseEvent) => {
      if (uiBlocksPointer(e.target) || useGameStore.getState().skillMenuOpen) return;
      if (runtime.paused) {
        if (e.button === 0) {
          runtime.paused = false;
          runtime.hadFocus = true;
        }
        return;
      }
      if (e.button === 2) {
        e.preventDefault();
        runtime.looking = true;
        return;
      }
      if (e.button === 0) {
        runtime.fireHeld = true;
        runtime.fireClicked = true;
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 2) runtime.looking = false;
      if (e.button === 0) runtime.fireHeld = false;
    };

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    const onBlur = () => {
      runtime.looking = false;
      runtime.fireHeld = false;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Escape") return;
      if (useGameStore.getState().skillMenuOpen) return;
      if (!runtime.paused && runtime.hadFocus) {
        runtime.paused = true;
        runtime.looking = false;
        runtime.fireHeld = false;
      }
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("blur", onBlur);
    window.addEventListener("keydown", onKeyDown);
    el.addEventListener("contextmenu", onContextMenu);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("keydown", onKeyDown);
      el.removeEventListener("contextmenu", onContextMenu);
    };
  }, []);

  return (
    <div
      ref={wrapper}
      className="absolute inset-0 bg-[#0a101c]"
      style={{ cursor: "none" }}
    >
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
