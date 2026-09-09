"use client";

import { useMemo } from "react";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";

function noise(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function valueNoise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  return lerp(
    lerp(noise(xi, yi), noise(xi + 1, yi), u),
    lerp(noise(xi, yi + 1), noise(xi + 1, yi + 1), u),
    v
  );
}

function fbm(x: number, y: number): number {
  return (
    valueNoise(x, y) * 0.5 +
    valueNoise(x * 2.1, y * 2.1) * 0.25 +
    valueNoise(x * 4.3, y * 4.3) * 0.125
  );
}

function paintNoise(
  size: number,
  sample: (x: number, y: number) => [number, number, number]
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, g, b] = sample(x, y);
      const i = (y * size + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

function canvasTexture(
  paint: () => HTMLCanvasElement,
  repeat: number
): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(paint());
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

const TEX_SIZE = 128;

/** Module-level cache so every cabin, streetlight, and tree shares one upload per texture. */
function cached(build: () => THREE.CanvasTexture): () => THREE.CanvasTexture {
  let texture: THREE.CanvasTexture | null = null;
  return () => {
    if (!texture) texture = build();
    return texture;
  };
}

const getGroundTexture = cached(() =>
  canvasTexture(
    () =>
      paintNoise(TEX_SIZE, (x, y) => {
        const n = fbm(x / 28, y / 28);
        const speckle = noise(x * 0.7, y * 0.9);
        return [28 + n * 38 + speckle * 10, 36 + n * 42 + speckle * 8, 22 + n * 18];
      }),
    48
  )
);

const getWoodTexture = cached(() =>
  canvasTexture(
    () =>
      paintNoise(TEX_SIZE, (x, y) => {
        const grain = fbm(x / 10, y / 90);
        const ring = Math.sin(x / 18 + grain * 4) * 0.5 + 0.5;
        return [72 + ring * 50 + grain * 20, 48 + ring * 28 + grain * 12, 28 + ring * 10];
      }),
    2.5
  )
);

const getBarkTexture = cached(() =>
  canvasTexture(
    () =>
      paintNoise(TEX_SIZE, (x, y) => {
        const n = fbm(x / 14, y / 40);
        const crack = Math.abs(Math.sin(x / 6 + n * 6));
        return [38 + n * 28 + crack * 16, 28 + n * 18, 18 + n * 10];
      }),
    2
  )
);

const getStoneTexture = cached(() =>
  canvasTexture(
    () =>
      paintNoise(TEX_SIZE, (x, y) => {
        const n = fbm(x / 22, y / 22);
        return [48 + n * 36, 50 + n * 34, 54 + n * 32];
      }),
    2
  )
);

const getFoliageTexture = cached(() =>
  canvasTexture(
    () =>
      paintNoise(TEX_SIZE, (x, y) => {
        const n = fbm(x / 9, y / 9);
        const leaf = noise(x * 1.3, y * 0.7);
        const dark = leaf > 0.78 ? 0.55 : 1;
        return [(34 + n * 52 + leaf * 26) * dark, (66 + n * 84 + leaf * 38) * dark, (26 + n * 34) * dark];
      }),
    3
  )
);

export function useGroundTexture(): THREE.Texture {
  return useMemo(() => getGroundTexture(), []);
}

export function useFoliageTexture(): THREE.Texture {
  return useMemo(() => getFoliageTexture(), []);
}

export function useWoodTexture(): THREE.Texture {
  return useMemo(() => getWoodTexture(), []);
}

export function useBarkTexture(): THREE.Texture {
  return useMemo(() => getBarkTexture(), []);
}

export function useStoneTexture(): THREE.Texture {
  return useMemo(() => getStoneTexture(), []);
}

/**
 * Use this once you drop Kenney / Polyhaven PBR maps into /public/textures.
 *
 * Example:
 *   const maps = useFilePbrTextures("/textures/ground");
 *   <meshStandardMaterial {...maps} roughness={1} metalness={0} />
 *
 * Expected files: `${base}_diff.jpg`, `${base}_nrm.jpg`, `${base}_rough.jpg`
 */
export function useFilePbrTextures(base: string) {
  return useTexture({
    map: `${base}_diff.jpg`,
    normalMap: `${base}_nrm.jpg`,
    roughnessMap: `${base}_rough.jpg`,
  });
}
