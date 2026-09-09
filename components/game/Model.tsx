"use client";

import { Suspense, useMemo, type ComponentProps } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";

type Vec3 = [number, number, number];

interface ModelProps {
  path: string;
  scale?: number | Vec3;
  position?: Vec3;
  rotation?: Vec3;
  /** Multiplier for HDRI reflections on the imported materials. */
  envMapIntensity?: number;
}

/**
 * Reusable GLB/GLTF loader. Clones the scene so the same asset can be
 * placed more than once, turns on shadows, and nudges plastic-looking
 * default roughness so dreis Environment HDRI actually reads.
 */
export function Model({
  path,
  scale = 1,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  envMapIntensity = 0.4,
}: ModelProps) {
  return (
    <Suspense fallback={<ModelFallback scale={typeof scale === "number" ? scale : 1} />}>
      <GltfMesh
        path={path}
        scale={scale}
        position={position}
        rotation={rotation}
        envMapIntensity={envMapIntensity}
      />
    </Suspense>
  );
}

function GltfMesh({
  path,
  scale,
  position,
  rotation,
  envMapIntensity,
}: Required<ModelProps>) {
  const gltf = useGLTF(path);
  const scene = useMemo(() => {
    const cloned = gltf.scene.clone(true);
    cloned.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.castShadow = true;
      child.receiveShadow = true;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        if (!material || typeof material !== "object") continue;
        const std = material as THREE.MeshStandardMaterial;
        if ("envMapIntensity" in std) std.envMapIntensity = envMapIntensity;
        if ("roughness" in std && std.metalness < 0.15 && std.roughness < 0.35) {
          std.roughness = 0.62;
        }
      }
    });
    return cloned;
  }, [gltf.scene, envMapIntensity]);

  return <primitive object={scene} scale={scale} position={position} rotation={rotation} />;
}

function ModelFallback({ scale }: { scale: number }) {
  return (
    <mesh castShadow position={[0, 0.5 * scale, 0]} scale={scale}>
      <capsuleGeometry args={[0.25, 0.7, 4, 8]} />
      <meshStandardMaterial color="#4a4038" roughness={0.85} />
    </mesh>
  );
}

export function preloadModel(path: string): void {
  useGLTF.preload(path);
}

export type { ModelProps };
export type GroupProps = ComponentProps<"group">;
