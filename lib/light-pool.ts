"use client";

import { useCallback, useLayoutEffect, useRef, type RefObject } from "react";
import * as THREE from "three";

/**
 * Three.js evaluates every point light in the scene for every fragment and
 * recompiles shaders whenever the light count changes. With dozens of
 * lanterns, streetlights, and pickups across three biomes that gets slow,
 * so scenery registers a lightweight "emitter" here and `LightPool`
 * drives a fixed handful of real lights to the nearest ones each frame.
 */
export interface LightEmitter {
  position: THREE.Vector3;
  color: THREE.Color;
  distance: number;
  /** Current brightness; owners animate this (flicker, gating, hidden = 0). */
  intensity: number;
}

const emitters = new Set<LightEmitter>();

export function getEmitters(): ReadonlySet<LightEmitter> {
  return emitters;
}

export function addEmitter(emitter: LightEmitter): () => void {
  emitters.add(emitter);
  return () => {
    emitters.delete(emitter);
  };
}

/**
 * Registers an emitter at the world position of `anchor` (resolved once the
 * scene graph exists — scenery is static, so it never needs to move).
 * Returns a stable setter the owner calls per frame to animate brightness.
 */
export function useLightEmitter(
  anchor: RefObject<THREE.Object3D | null>,
  color: string,
  distance: number,
  intensity: number
): (value: number) => void {
  const emitter = useRef<LightEmitter>({
    position: new THREE.Vector3(),
    color: new THREE.Color(color),
    distance,
    intensity,
  });
  const setIntensity = useCallback((value: number) => {
    emitter.current.intensity = value;
  }, []);

  useLayoutEffect(() => {
    const object = anchor.current;
    if (!object) return;
    object.updateWorldMatrix(true, false);
    object.getWorldPosition(emitter.current.position);
    emitter.current.color.set(color);
    emitter.current.distance = distance;
    return addEmitter(emitter.current);
  }, [anchor, color, distance]);

  return setIntensity;
}
