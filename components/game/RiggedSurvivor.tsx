"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useAnimations, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { SkeletonUtils } from "three-stdlib";
import type { Character } from "@/lib/store";

export const RIGGED_MODEL_URLS: Record<Character, string> = {
  girl: "/models/survivor-girl.glb",
  boy: "/models/survivor-boy.glb",
};

/**
 * Child-height survivor. Cabins have a 2.35 m door and ~3.4 m walls; 1.18 m
 * reads as a kid standing in the doorway instead of filling the porch.
 */
const TARGET_HEIGHT = 1.18;
/** Mixamo adults land around this after the file's own cm→m scale. */
const MIXAMO_ADULT_HEIGHT = 1.85;
/** Ground speed (m/s) Mixamo authored these clips at, on an adult-height rig. */
const CLIP_SPEEDS = { walk: 1.5, run: 4.2 };
const FADE = 0.25;

function isMesh(obj: THREE.Object3D): obj is THREE.Mesh {
  return "isMesh" in obj && (obj as THREE.Mesh).isMesh;
}

function isSkinnedMesh(obj: THREE.Object3D): obj is THREE.SkinnedMesh {
  return "isSkinnedMesh" in obj && (obj as THREE.SkinnedMesh).isSkinnedMesh;
}

function isMixamoRoot(obj: THREE.Object3D): boolean {
  return obj.children.some((child) => /mixamorigHips/i.test(child.name));
}

function findMixamoRoot(root: THREE.Object3D): THREE.Object3D | null {
  let found: THREE.Object3D | null = null;
  root.traverse((obj) => {
    if (!found && isMixamoRoot(obj)) found = obj;
  });
  return found;
}

function isDebugJoints(obj: THREE.Object3D): boolean {
  return obj.name === "Beta_Joints" || /^Beta_Joints$/i.test(obj.name);
}

/** Convert a Y value that is still in Mixamo centimetres into metres. */
function toMeters(y: number, rootScale: number): number {
  if (!Number.isFinite(y) || y <= 0) return 0;
  if (y > 8) return y * (rootScale > 0 && rootScale < 0.05 ? rootScale : 0.01);
  return y;
}

/**
 * Height from Mixamo bones, not the skinned-mesh AABB. Bind-pose boxes are
 * often ~0.5 m, which made the loader *enlarge* an already 1.9 m character
 * until it was taller than the cabin.
 */
function measureHeight(root: THREE.Object3D): number {
  const mixamo = findMixamoRoot(root);
  const sx = mixamo?.scale.x ?? 1;
  root.updateWorldMatrix(true, true);

  let headY = 0;
  root.traverse((obj) => {
    if (!/HeadTop_End/i.test(obj.name)) return;
    const world = new THREE.Vector3();
    obj.getWorldPosition(world);
    if (world.y > headY) headY = world.y;
  });
  headY = toMeters(headY, sx);
  if (headY >= 1.2 && headY <= 3.2) return headY;

  const hips = root.getObjectByName("mixamorigHips");
  if (hips) {
    const hipWorld = new THREE.Vector3();
    hips.getWorldPosition(hipWorld);
    const hipY = toMeters(Math.abs(hipWorld.y) || Math.abs(hips.position.y), sx);
    // Mixamo hips sit at about 55% of standing height.
    if (hipY >= 0.5) return hipY / 0.55;
  }

  return MIXAMO_ADULT_HEIGHT;
}

function prepareMeshes(root: THREE.Object3D): void {
  const helpers: THREE.Object3D[] = [];
  root.traverse((obj) => {
    if (isDebugJoints(obj)) {
      helpers.push(obj);
      return;
    }
    if (!isMesh(obj)) return;
    obj.frustumCulled = false;
    obj.castShadow = true;
    obj.receiveShadow = true;
    obj.visible = true;

    const source = Array.isArray(obj.material) ? obj.material : [obj.material];
    const cloned = source.map((mat) => {
      const next = mat.clone();
      next.visible = true;
      next.side = THREE.FrontSide;
      if ("metalness" in next && typeof next.metalness === "number") next.metalness = 0;
      if ("envMapIntensity" in next && typeof next.envMapIntensity === "number") {
        next.envMapIntensity = 0.25;
      }
      // Hair / lashes ship as alpha-blend and can swallow the body if depth is wrong.
      if (next.transparent || next.alphaTest > 0 || /hair|lash/i.test(obj.name)) {
        next.transparent = false;
        next.alphaTest = 0.4;
        next.depthWrite = true;
      }
      next.needsUpdate = true;
      return next;
    });
    obj.material = cloned.length === 1 ? cloned[0] : cloned;

    if (isSkinnedMesh(obj)) {
      obj.bind(obj.skeleton, obj.bindMatrix);
      obj.normalizeSkinWeights();
    }
  });
  for (const helper of helpers) helper.removeFromParent();
}

/**
 * Fit Mixamo's own armature scale (often ~0.005–0.011 cm→m). Never scale a
 * React parent of the skinned meshes — Three.js then skins into nothing and
 * the character disappears. Never overwrite the armature scale with a constant
 * from a different Mixamo export.
 */
function fitToChildHeight(root: THREE.Object3D): number {
  const mixamo = findMixamoRoot(root) ?? root;
  const height = measureHeight(root);
  // Already in metres (cm→m baked on the armature). Never scale up — a short
  // skinned AABB would otherwise turn a 1.9 m adult into a 5 m giant.
  const authored = Math.max(height, mixamo.scale.x < 0.05 ? MIXAMO_ADULT_HEIGHT : 0);
  const factor = TARGET_HEIGHT / authored;
  mixamo.scale.multiplyScalar(factor);
  return factor;
}

type Locomotion = "idle" | "walk" | "run";

const CLIP_PATTERNS: Record<Locomotion, RegExp> = {
  idle: /idle|breath|stand/i,
  walk: /walk/i,
  run: /run|sprint|jog/i,
};

function uniqueClips(animations: THREE.AnimationClip[]): THREE.AnimationClip[] {
  const best = new Map<string, THREE.AnimationClip>();
  for (const clip of animations) {
    if (clip.tracks.length === 0) continue;
    const prev = best.get(clip.name);
    if (!prev || clip.tracks.length > prev.tracks.length) best.set(clip.name, clip);
  }
  return [...best.values()];
}

function pickClip(clips: THREE.AnimationClip[], state: Locomotion): THREE.AnimationClip | undefined {
  return clips.find((clip) => CLIP_PATTERNS[state].test(clip.name));
}

export function RiggedSurvivor({ url, speedRef }: { url: string; speedRef: { current: number } }) {
  const gltf = useGLTF(url);
  const root = useRef<THREE.Group>(null);

  const { model, fit } = useMemo(() => {
    const clone = SkeletonUtils.clone(gltf.scene);
    prepareMeshes(clone);
    const s = fitToChildHeight(clone);
    return { model: clone, fit: s };
  }, [gltf.scene]);

  const clips = useMemo(() => uniqueClips(gltf.animations), [gltf.animations]);
  const roles = useMemo(
    () => ({
      idle: pickClip(clips, "idle"),
      walk: pickClip(clips, "walk"),
      run: pickClip(clips, "run"),
    }),
    [clips]
  );
  const { actions, mixer } = useAnimations(clips, root);
  const current = useRef<Locomotion>("idle");

  const actionFor = (state: Locomotion): THREE.AnimationAction | null => {
    const clip = roles[state] ?? roles.walk ?? roles.run ?? roles.idle;
    if (!clip) return null;
    return actions[clip.name] ?? null;
  };

  useEffect(() => {
    Object.values(actions).forEach((action) => {
      if (!action) return;
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.clampWhenFinished = false;
      action.enabled = true;
    });
    const idle = actionFor("idle");
    if (idle) {
      idle.reset().setEffectiveWeight(1).play();
      current.current = "idle";
    }
    return () => {
      mixer.stopAllAction();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actions, mixer]);

  useFrame(() => {
    const speed = speedRef.current;
    let next: Locomotion = current.current;
    if (next === "idle" && speed > 0.6) next = roles.walk ? "walk" : "run";
    else if (next === "walk" && speed < 0.3) next = "idle";
    else if (next === "walk" && speed > 5.2) next = "run";
    else if (next === "run" && speed < 0.3) next = "idle";
    else if (next === "run" && speed < 4.6 && roles.walk) next = "walk";

    if (next !== current.current) {
      const from = actionFor(current.current);
      const to = actionFor(next);
      if (to && to !== from) {
        to.reset().setEffectiveWeight(1).setLoop(THREE.LoopRepeat, Infinity).play();
        if (from) from.crossFadeTo(to, FADE, false);
        else to.fadeIn(FADE);
      }
      current.current = next;
    }

    const active = actionFor(current.current);
    if (!active) return;
    if (current.current === "idle") {
      active.timeScale = 1;
      return;
    }
    const authored =
      (current.current === "run" && roles.run ? CLIP_SPEEDS.run : CLIP_SPEEDS.walk) * fit;
    active.timeScale = THREE.MathUtils.clamp(speed / Math.max(0.2, authored), 0.7, 1.8);
  });

  return (
    <group ref={root}>
      <primitive object={model} />
    </group>
  );
}

useGLTF.preload(RIGGED_MODEL_URLS.boy);
