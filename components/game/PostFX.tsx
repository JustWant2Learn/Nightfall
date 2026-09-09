"use client";

import { Bloom, EffectComposer, SSAO, Vignette } from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";

/**
 * Subtle polish pass. SSAO grounds meshes, bloom lifts lanterns / eyes,
 * vignette keeps the horror frame. Intensities stay low on purpose.
 */
export function PostFX() {
  return (
    <EffectComposer multisampling={0} enableNormalPass>
      <SSAO
        blendFunction={BlendFunction.MULTIPLY}
        samples={8}
        rings={4}
        radius={0.12}
        intensity={12}
        bias={0.025}
        luminanceInfluence={0.5}
        worldDistanceThreshold={80}
        worldDistanceFalloff={12}
        worldProximityThreshold={0.4}
        worldProximityFalloff={0.2}
      />
      <Bloom luminanceThreshold={0.88} luminanceSmoothing={0.2} intensity={0.22} mipmapBlur />
      <Vignette offset={0.28} darkness={0.42} />
    </EffectComposer>
  );
}
