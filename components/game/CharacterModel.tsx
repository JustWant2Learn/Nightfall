"use client";

import { Component, Suspense, useRef, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Character } from "@/lib/store";
import { RIGGED_MODEL_URLS, RiggedSurvivor } from "@/components/game/RiggedSurvivor";

interface CharacterModelProps {
  character: Character;
  speedRef: { current: number };
}

type Vec3 = [number, number, number];

const SKIN = "#e6b898";
const SKIN_SHADE = "#d4a385";

/**
 * Survivor model. Always loads the Mixamo GLB; the stylised child is only
 * used while the file is downloading or if loading throws.
 */
export function CharacterModel({ character, speedRef }: CharacterModelProps) {
  const url = RIGGED_MODEL_URLS[character];
  const fallback = <StylizedSurvivor character={character} speedRef={speedRef} />;
  return (
    <ModelErrorBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <RiggedSurvivor url={url} speedRef={speedRef} />
      </Suspense>
    </ModelErrorBoundary>
  );
}

class ModelErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  componentDidCatch(error: Error): void {
    console.error("Rigged survivor failed to load; using the stylised model.", error);
  }
  render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/* ------------------------------------------------------------------------ */
/* Stylised jointed child                                                    */
/* ------------------------------------------------------------------------ */

/** Thigh and shin lengths (hip→knee, knee→ankle). */
const THIGH = 0.255;
const SHIN = 0.255;
const LEG_LENGTH = THIGH + SHIN;
const ARM_UPPER = 0.165;
const ARM_FORE = 0.17;
/** How far a planted foot travels in local Z during one step. */
const STRIDE = 0.42;
const MAX_STEPS_PER_SEC = 5;
const POSE_DAMP = 18;

interface LimbJoints {
  shoulder: THREE.Group | null;
  elbow: THREE.Group | null;
  hip: THREE.Group | null;
  knee: THREE.Group | null;
  ankle: THREE.Group | null;
}

function smoothstep(x: number, a: number, b: number): number {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

function dampAxis(obj: THREE.Group | null, axis: "x" | "y" | "z", target: number, dt: number): void {
  if (!obj) return;
  obj.rotation[axis] = THREE.MathUtils.damp(obj.rotation[axis], target, POSE_DAMP, dt);
}

/**
 * Two-bone IK in the sagittal plane. Bones hang along local −Y; positive
 * rotation.x swings the chain toward −Z, so a target with +Z (forward) needs
 * a negative hip angle. The knee always flexes so the shin folds forward.
 */
function solveChain(
  tz: number,
  ty: number,
  upper: number,
  lower: number
): { hip: number; knee: number } {
  let reach = Math.hypot(tz, ty);
  const maxReach = upper + lower - 0.002;
  const minReach = Math.abs(upper - lower) + 0.002;
  reach = THREE.MathUtils.clamp(reach, minReach, maxReach);
  const kneeInterior = Math.acos(
    THREE.MathUtils.clamp((upper * upper + lower * lower - reach * reach) / (2 * upper * lower), -1, 1)
  );
  const hipOffset = Math.acos(
    THREE.MathUtils.clamp((upper * upper + reach * reach - lower * lower) / (2 * upper * reach), -1, 1)
  );
  // atan2(tz, −ty): 0 when the foot is straight down.
  const toward = -Math.atan2(tz, -ty);
  return { hip: toward - hipOffset, knee: Math.PI - kneeInterior };
}

/**
 * Stylized child survivor: big head, short limbs, t-shirt, shorts, sandals.
 *
 * This is a nested-group puppet, not a skinned mesh — each limb segment is
 * still a rigid capsule. What reads as "joints" is parenting: the shin lives
 * inside the knee group, the forearm inside the elbow group. Two-bone IK
 * aims the feet, and rotations are damped so the pose eases instead of popping.
 * Drop Mixamo GLBs at the URLs in RiggedSurvivor.tsx for a real skeleton.
 */
export function StylizedSurvivor({ character, speedRef }: CharacterModelProps) {
  const phase = useRef(0);
  const body = useRef<THREE.Group>(null);
  const torso = useRef<THREE.Group>(null);
  const pelvis = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const hair = useRef<THREE.Group>(null);
  const left = useRef<LimbJoints>({ shoulder: null, elbow: null, hip: null, knee: null, ankle: null });
  const right = useRef<LimbJoints>({ shoulder: null, elbow: null, hip: null, knee: null, ankle: null });

  const isGirl = character === "girl";
  const shirt = isGirl ? "#c98aa4" : "#c9c3b8";
  const shirtShade = isGirl ? "#a86d86" : "#a8a297";
  const shorts = isGirl ? "#3e4f6b" : "#3f4d3c";
  const hairColor = isGirl ? "#4a2c18" : "#2e1b10";
  const sandal = "#6b4a36";

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);
    const time = state.clock.elapsedTime;
    const speed = speedRef.current;

    const g = smoothstep(speed, 0.15, 2.2);
    const run = THREE.MathUtils.clamp((speed - 4.6) / 2.6, 0, 1);
    const stride = STRIDE * (0.7 + 0.3 * g + 0.35 * run);
    const liftH = (0.12 * g + 0.08 * run);
    const stepsPerSec = Math.min(MAX_STEPS_PER_SEC, Math.max(0, speed) / Math.max(0.28, stride * 2));
    if (g > 0.05) {
      phase.current += stepsPerSec * Math.PI * dt;
    } else {
      const rest = Math.round(phase.current / Math.PI) * Math.PI;
      phase.current = THREE.MathUtils.damp(phase.current, rest, 8, dt);
    }
    const phi = phase.current;
    const lean = 0.05 * g + 0.16 * run;
    const idleSway = Math.sin(time * 1.3) * 0.03 * (1 - g);

    const poseLeg = (j: LimbJoints, p: number) => {
      const swing = Math.max(0, Math.cos(p));
      const tz = Math.sin(p) * stride * g;
      const ty = -LEG_LENGTH + 0.02 * g + swing * liftH;
      const { hip, knee } = solveChain(tz, ty, THIGH, SHIN);
      const ankle = -hip * 0.4 - knee * 0.35 + 0.12 * Math.max(0, -Math.sin(p)) * g;
      dampAxis(j.hip, "x", hip, dt);
      dampAxis(j.knee, "x", knee, dt);
      dampAxis(j.ankle, "x", ankle, dt);
    };
    const poseArm = (j: LimbJoints, p: number, side: number) => {
      // Contralateral: this arm's phase is already offset vs its own leg.
      const tz = -Math.sin(p) * (0.22 * g + 0.18 * run);
      const ty = -(ARM_UPPER + ARM_FORE) + 0.04 + Math.max(0, Math.sin(p)) * 0.06 * g;
      const { hip: shoulder, knee: elbowFlex } = solveChain(tz, ty, ARM_UPPER, ARM_FORE);
      const elbow = -(0.28 + elbowFlex * 0.85 + 0.4 * run);
      dampAxis(j.shoulder, "x", shoulder + idleSway, dt);
      dampAxis(j.shoulder, "z", side * (0.12 + 0.08 * run), dt);
      dampAxis(j.elbow, "x", elbow, dt);
    };
    poseLeg(left.current, phi);
    poseLeg(right.current, phi + Math.PI);
    // Left arm with right leg, right arm with left leg.
    poseArm(left.current, phi + Math.PI, -1);
    poseArm(right.current, phi, 1);

    if (body.current) {
      const breath = Math.sin(time * 2.2) * 0.006;
      const bob = g * 0.028 * (0.5 + 0.5 * Math.cos(2 * phi));
      body.current.position.y = breath + bob;
      body.current.rotation.z = Math.sin(phi) * 0.04 * g;
      body.current.rotation.x = lean;
    }
    if (pelvis.current) {
      pelvis.current.rotation.y = Math.sin(phi) * 0.1 * g;
      pelvis.current.rotation.z = -Math.sin(phi) * 0.06 * g;
    }
    if (torso.current) {
      torso.current.rotation.y = -Math.sin(phi) * 0.14 * g;
      torso.current.rotation.z = Math.sin(phi) * 0.03 * g;
    }
    if (head.current) {
      head.current.rotation.x = -lean * 0.7 + Math.sin(2 * phi) * 0.02 * g;
      head.current.rotation.y = Math.sin(phi) * 0.05 * g;
    }
    if (hair.current) {
      hair.current.rotation.x = Math.sin(phi * 1.05) * (0.08 * g + 0.06 * run);
    }
  });

  return (
    <group ref={body}>
      {/* Upper body pivots at the waist so it can counter-rotate the hips. */}
      <group ref={torso} position={[0, 0.62, 0]}>
        {/* Head */}
        <group ref={head} position={[0, 0.45, 0]}>
          <mesh castShadow>
            <sphereGeometry args={[0.135, 28, 22]} />
            <meshStandardMaterial color={SKIN} roughness={0.6} />
          </mesh>
          {/* Cheeks / chin softening */}
          <mesh position={[0, -0.04, 0.02]} scale={[1, 0.8, 1]}>
            <sphereGeometry args={[0.12, 20, 16]} />
            <meshStandardMaterial color={SKIN} roughness={0.6} />
          </mesh>
          {/* Ears */}
          <mesh position={[-0.13, -0.005, 0]}>
            <sphereGeometry args={[0.028, 10, 8]} />
            <meshStandardMaterial color={SKIN_SHADE} roughness={0.6} />
          </mesh>
          <mesh position={[0.13, -0.005, 0]}>
            <sphereGeometry args={[0.028, 10, 8]} />
            <meshStandardMaterial color={SKIN_SHADE} roughness={0.6} />
          </mesh>
          {/* Eyes: large, kid-like */}
          <Eye position={[-0.048, 0.005, 0.117]} />
          <Eye position={[0.048, 0.005, 0.117]} />
          {/* Brows */}
          <mesh position={[-0.048, 0.055, 0.122]} rotation={[0, 0, 0.12]}>
            <boxGeometry args={[0.05, 0.009, 0.01]} />
            <meshStandardMaterial color={hairColor} roughness={0.9} />
          </mesh>
          <mesh position={[0.048, 0.055, 0.122]} rotation={[0, 0, -0.12]}>
            <boxGeometry args={[0.05, 0.009, 0.01]} />
            <meshStandardMaterial color={hairColor} roughness={0.9} />
          </mesh>
          {/* Nose + mouth */}
          <mesh position={[0, -0.03, 0.13]}>
            <sphereGeometry args={[0.016, 10, 8]} />
            <meshStandardMaterial color={SKIN_SHADE} roughness={0.6} />
          </mesh>
          <mesh position={[0, -0.072, 0.118]}>
            <boxGeometry args={[0.04, 0.01, 0.01]} />
            <meshStandardMaterial color="#9a5a55" roughness={0.6} />
          </mesh>

          {/* Hair */}
          <group ref={hair}>
            <mesh position={[0, 0.035, -0.012]} scale={[1.04, 0.92, 1.04]} castShadow>
              <sphereGeometry args={[0.14, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.58]} />
              <meshStandardMaterial color={hairColor} roughness={0.85} />
            </mesh>
            {/* Fringe swept to one side */}
            <mesh position={[-0.02, 0.085, 0.09]} rotation={[0.55, 0, -0.25]}>
              <boxGeometry args={[0.17, 0.05, 0.09]} />
              <meshStandardMaterial color={hairColor} roughness={0.85} />
            </mesh>
            <mesh position={[0.07, 0.07, 0.075]} rotation={[0.45, 0, 0.35]}>
              <boxGeometry args={[0.1, 0.045, 0.08]} />
              <meshStandardMaterial color={hairColor} roughness={0.85} />
            </mesh>
            {/* Sides */}
            <mesh position={[-0.125, 0.02, -0.02]}>
              <boxGeometry args={[0.035, 0.11, 0.13]} />
              <meshStandardMaterial color={hairColor} roughness={0.85} />
            </mesh>
            <mesh position={[0.125, 0.02, -0.02]}>
              <boxGeometry args={[0.035, 0.11, 0.13]} />
              <meshStandardMaterial color={hairColor} roughness={0.85} />
            </mesh>
            {isGirl && (
              <>
                {/* Hairband + ponytail */}
                <mesh position={[0, 0.07, -0.01]} rotation={[0.2, 0, 0]}>
                  <torusGeometry args={[0.135, 0.012, 8, 24, Math.PI]} />
                  <meshStandardMaterial color="#e8d7a0" roughness={0.5} />
                </mesh>
                <mesh position={[0, 0.04, -0.15]} rotation={[0.35, 0, 0]}>
                  <capsuleGeometry args={[0.035, 0.22, 6, 12]} />
                  <meshStandardMaterial color={hairColor} roughness={0.85} />
                </mesh>
                <mesh position={[0, 0.08, -0.13]}>
                  <sphereGeometry args={[0.035, 10, 8]} />
                  <meshStandardMaterial color="#e8d7a0" roughness={0.5} />
                </mesh>
              </>
            )}
          </group>
        </group>

        {/* Neck */}
        <mesh position={[0, 0.315, 0]}>
          <cylinderGeometry args={[0.035, 0.04, 0.06, 10]} />
          <meshStandardMaterial color={SKIN_SHADE} roughness={0.6} />
        </mesh>

        {/* T-shirt torso */}
        <mesh position={[0, 0.17, 0]} castShadow>
          <capsuleGeometry args={[0.125, 0.17, 6, 16]} />
          <meshStandardMaterial color={shirt} roughness={0.85} />
        </mesh>
        {/* Collar */}
        <mesh position={[0, 0.28, 0]}>
          <torusGeometry args={[0.055, 0.012, 8, 20]} />
          <meshStandardMaterial color={shirtShade} roughness={0.85} />
        </mesh>
        {/* Hem */}
        <mesh position={[0, 0.035, 0]}>
          <cylinderGeometry args={[0.135, 0.14, 0.05, 16]} />
          <meshStandardMaterial color={shirtShade} roughness={0.85} />
        </mesh>

        <Arm jointsRef={left} side={-1} shirt={shirt} shoulderY={0.26} />
        <Arm jointsRef={right} side={1} shirt={shirt} shoulderY={0.26} />
      </group>

      {/* Pelvis carries the shorts so they yaw with the hips instead of
          sitting still while the thighs swing through a rigid box. */}
      <group ref={pelvis} position={[0, 0.56, 0]}>
        <mesh position={[0, 0.025, 0]} castShadow>
          <boxGeometry args={[0.27, 0.13, 0.17]} />
          <meshStandardMaterial color={shorts} roughness={0.9} />
        </mesh>
        <mesh position={[0, 0.075, 0.085]}>
          <boxGeometry args={[0.05, 0.012, 0.01]} />
          <meshStandardMaterial color="#d8d2c4" roughness={0.9} />
        </mesh>
        <Leg jointsRef={left} side={-1} shorts={shorts} sandal={sandal} />
        <Leg jointsRef={right} side={1} shorts={shorts} sandal={sandal} />
      </group>
    </group>
  );
}

/** Shoulder → upper arm → elbow → forearm + hand. Capsules overlap the
 *  joint spheres so the bend reads as a continuous limb, not two rods. */
function Arm({
  jointsRef,
  side,
  shirt,
  shoulderY,
}: {
  jointsRef: React.RefObject<LimbJoints>;
  side: -1 | 1;
  shirt: string;
  shoulderY: number;
}) {
  return (
    <group
      ref={(el) => {
        jointsRef.current.shoulder = el;
      }}
      position={[side * 0.155, shoulderY, 0]}
    >
      <mesh>
        <sphereGeometry args={[0.05, 10, 8]} />
        <meshStandardMaterial color={shirt} roughness={0.85} />
      </mesh>
      {/* Sleeve */}
      <mesh position={[0, -0.05, 0]} castShadow>
        <cylinderGeometry args={[0.048, 0.044, 0.12, 12]} />
        <meshStandardMaterial color={shirt} roughness={0.85} />
      </mesh>
      {/* Upper arm — overlaps the elbow sphere */}
      <mesh position={[0, -0.09, 0]} castShadow>
        <capsuleGeometry args={[0.034, 0.08, 6, 10]} />
        <meshStandardMaterial color={SKIN} roughness={0.6} />
      </mesh>
      <group
        ref={(el) => {
          jointsRef.current.elbow = el;
        }}
        position={[0, -ARM_UPPER, 0]}
      >
        <mesh>
          <sphereGeometry args={[0.038, 10, 8]} />
          <meshStandardMaterial color={SKIN} roughness={0.6} />
        </mesh>
        <mesh position={[0, -0.075, 0]} castShadow>
          <capsuleGeometry args={[0.031, 0.09, 6, 10]} />
          <meshStandardMaterial color={SKIN} roughness={0.6} />
        </mesh>
        <mesh position={[0, -ARM_FORE, 0.005]}>
          <sphereGeometry args={[0.04, 12, 10]} />
          <meshStandardMaterial color={SKIN} roughness={0.6} />
        </mesh>
      </group>
    </group>
  );
}

/** Hip → thigh → knee → shin → ankle → sandal. */
function Leg({
  jointsRef,
  side,
  shorts,
  sandal,
}: {
  jointsRef: React.RefObject<LimbJoints>;
  side: -1 | 1;
  shorts: string;
  sandal: string;
}) {
  return (
    <group
      ref={(el) => {
        jointsRef.current.hip = el;
      }}
      position={[side * 0.07, 0, 0]}
    >
      {/* Shorts leg rides the thigh so it bends with the hip. */}
      <mesh position={[0, -0.04, 0]}>
        <cylinderGeometry args={[0.06, 0.055, 0.12, 12]} />
        <meshStandardMaterial color={shorts} roughness={0.9} />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.055, 10, 8]} />
        <meshStandardMaterial color={shorts} roughness={0.9} />
      </mesh>
      <mesh position={[0, -THIGH * 0.5, 0]} castShadow>
        <capsuleGeometry args={[0.046, THIGH - 0.08, 6, 12]} />
        <meshStandardMaterial color={SKIN} roughness={0.6} />
      </mesh>
      <group
        ref={(el) => {
          jointsRef.current.knee = el;
        }}
        position={[0, -THIGH, 0]}
      >
        <mesh>
          <sphereGeometry args={[0.048, 10, 8]} />
          <meshStandardMaterial color={SKIN} roughness={0.6} />
        </mesh>
        <mesh position={[0, -SHIN * 0.45, 0]} castShadow>
          <capsuleGeometry args={[0.041, SHIN - 0.1, 6, 12]} />
          <meshStandardMaterial color={SKIN} roughness={0.6} />
        </mesh>
        <group
          ref={(el) => {
            jointsRef.current.ankle = el;
          }}
          position={[0, -SHIN, 0]}
        >
          <mesh position={[0, -0.025, 0.03]} castShadow>
            <boxGeometry args={[0.095, 0.035, 0.19]} />
            <meshStandardMaterial color={sandal} roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.01, 0.075]}>
            <boxGeometry args={[0.1, 0.035, 0.035]} />
            <meshStandardMaterial color={sandal} roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.02, -0.01]}>
            <boxGeometry args={[0.1, 0.03, 0.03]} />
            <meshStandardMaterial color={sandal} roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.005, 0.11]}>
            <sphereGeometry args={[0.034, 10, 8]} />
            <meshStandardMaterial color={SKIN} roughness={0.6} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

function Eye({ position }: { position: Vec3 }) {
  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[0.024, 12, 10]} />
        <meshStandardMaterial color="#f6f3ee" roughness={0.3} />
      </mesh>
      <mesh position={[0, -0.002, 0.014]}>
        <sphereGeometry args={[0.015, 10, 8]} />
        <meshStandardMaterial color="#3a2415" roughness={0.25} />
      </mesh>
      <mesh position={[0, -0.002, 0.024]}>
        <sphereGeometry args={[0.008, 8, 6]} />
        <meshStandardMaterial color="#0a0604" roughness={0.2} />
      </mesh>
    </group>
  );
}
