"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { TREES, biomeAt, type Placement } from "@/lib/world-data";
import { useBarkTexture, useFoliageTexture } from "@/lib/proc-textures";

/**
 * Tree species built from a handful of instanced meshes, chosen by biome:
 *  - Hollow Woods: conifers (stacked rough cones) and oaks (branches + leafy blobs)
 *  - Drowned Marsh: corkscrew trunks on mossy islets, cypress knees, Spanish moss
 *  - Ashen Graveyard: wrung leafless trunks, zigzag claw branches, hollow faces
 * Everything is deterministic so collision (trunk radius) matches visuals.
 */

export function isConifer(p: Placement): boolean {
  return p.rot > Math.PI * 0.9;
}

/** Position-based jitter so shared seam vertices move identically (no cracks). */
function roughen(geometry: THREE.BufferGeometry, amount: number): THREE.BufferGeometry {
  const pos = geometry.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const h = Math.sin(v.x * 12.9898 + v.y * 78.233 + v.z * 37.719) * 43758.5453;
    const r = h - Math.floor(h);
    const s = 1 + (r * 2 - 1) * amount;
    pos.setXYZ(i, v.x * s, v.y * s, v.z * s);
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

/** Twist vertices around Y so a cylinder reads as spiraling cords of bark. */
function twistAlongY(geometry: THREE.BufferGeometry, turns: number): THREE.BufferGeometry {
  const pos = geometry.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const a = v.y * turns * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    pos.setXYZ(i, v.x * c - v.z * s, v.y, v.x * s + v.z * c);
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

/** Deep vertical furrows — the ridged bark in the reference models. */
function furrow(geometry: THREE.BufferGeometry, amount: number, ridges: number): THREE.BufferGeometry {
  const pos = geometry.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const ang = Math.atan2(v.z, v.x);
    const radial = 1 + Math.sin(ang * ridges + v.y * 3.1) * amount;
    pos.setXYZ(i, v.x * radial, v.y, v.z * radial);
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

interface Instance {
  x: number;
  y: number;
  z: number;
  rotY: number;
  rotZ: number;
  rotX: number;
  sx: number;
  sy: number;
  sz: number;
  color: THREE.Color;
}

interface ForestData {
  coniferTrunks: Instance[];
  coniferFoliage: Instance[];
  oakTrunks: Instance[];
  oakBranches: Instance[];
  oakCanopy: Instance[];
  marshLimbs: Instance[];
  deadLimbs: Instance[];
  moss: Instance[];
  hollows: Instance[];
  islands: Instance[];
  knees: Instance[];
  cattails: Instance[];
  vines: Instance[];
}

const WHITE = new THREE.Color("#ffffff");
const MARSH_BARK = new THREE.Color("#6a6248");
const MARSH_ROOT = new THREE.Color("#4e5338");
const MARSH_MOSS = new THREE.Color("#6a7a48");
const DEAD_BARK = new THREE.Color("#3a383e");
const DEAD_ASH = new THREE.Color("#5a5858");
const MOSS = new THREE.Color("#8a9480");
const TUFT = new THREE.Color("#3d8a38");
const ISLAND = new THREE.Color("#3a5a32");
const CATTAIL = new THREE.Color("#5a4a32");
const VINE = new THREE.Color("#2f6a32");

type Vec3 = [number, number, number];

const CONIFER_LAYERS: [base: number, radius: number, height: number][] = [
  [0.9, 1.95, 3.1],
  [2.6, 1.55, 2.9],
  [4.25, 1.15, 2.7],
  [5.75, 0.72, 2.5],
];

const OAK_BLOBS: [x: number, y: number, z: number, r: number][] = [
  [0, 4.7, 0, 2.15],
  [-1.45, 4.25, 0.55, 1.45],
  [1.35, 4.35, -0.65, 1.4],
  [0.35, 5.95, 0.25, 1.3],
  [-0.4, 3.9, -1.3, 1.15],
];

function hash(p: Placement, k: number): number {
  const h = Math.sin(p.x * 12.9898 + p.z * 78.233 + k * 37.719) * 43758.5453;
  return h - Math.floor(h);
}

/** Sequential deterministic random numbers for one tree. */
class Dice {
  private k = 0;
  constructor(private readonly p: Placement) {}
  next(): number {
    return hash(this.p, this.k++);
  }
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }
}

/** Direction a limb points given heading `a` and tilt from vertical. */
function branchDir(a: number, tilt: number): Vec3 {
  return [Math.sin(a) * Math.sin(tilt), Math.cos(tilt), Math.cos(a) * Math.sin(tilt)];
}

/** Centre-origin branch (oak). */
function pushBranch(
  list: Instance[],
  x: number,
  y: number,
  z: number,
  a: number,
  tilt: number,
  len: number,
  thickness: number,
  color: THREE.Color
): Vec3 {
  const [dx, dy, dz] = branchDir(a, tilt);
  list.push({
    x: x + dx * len * 0.5,
    y: y + dy * len * 0.5,
    z: z + dz * len * 0.5,
    rotY: a, rotZ: 0, rotX: tilt,
    sx: thickness, sy: len, sz: thickness,
    color,
  });
  return [x + dx * len, y + dy * len, z + dz * len];
}

/**
 * Base-origin tapered segment. The base is sunk slightly back along its own
 * axis so chained segments overlap at kinks instead of leaving gaps.
 */
function pushLimb(
  list: Instance[],
  [x, y, z]: Vec3,
  a: number,
  tilt: number,
  len: number,
  radius: number,
  color: THREE.Color
): Vec3 {
  const [dx, dy, dz] = branchDir(a, tilt);
  const sink = radius * 0.6;
  list.push({
    x: x - dx * sink,
    y: y - dy * sink,
    z: z - dz * sink,
    rotY: a, rotZ: 0, rotX: tilt,
    sx: radius, sy: len + sink, sz: radius,
    color,
  });
  return [x + dx * len, y + dy * len, z + dz * len];
}

interface Joint {
  pos: Vec3;
  heading: number;
  tilt: number;
  radius: number;
}

interface BranchStyle {
  /** Segments per branch level. */
  segs: number;
  /** How sharply heading/tilt change between segments (radians). */
  kink: number;
  /** Angular spread between forks. */
  spread: number;
  /** Per-segment tilt drift: negative curls upward, positive droops. */
  drift: number;
  /** Length/thickness retained by each child level. */
  shrink: number;
}

/** Recursive forking branch; returns the terminal tips for moss/leaves/claws. */
function growBranch(
  list: Instance[],
  start: Vec3,
  heading: number,
  tilt: number,
  len: number,
  radius: number,
  depth: number,
  maxDepth: number,
  style: BranchStyle,
  dice: Dice,
  color: THREE.Color,
  tips: Joint[]
): void {
  let pos = start;
  let a = heading;
  let t = tilt;
  const segLen = len / style.segs;
  for (let i = 0; i < style.segs; i++) {
    const r = radius * (1 - (i / style.segs) * 0.35);
    pos = pushLimb(list, pos, a, t, segLen, r, color);
    a += (dice.next() - 0.5) * style.kink;
    t = THREE.MathUtils.clamp(t + (dice.next() - 0.5) * style.kink * 0.7 + style.drift, 0.12, 2.3);
  }
  if (depth < maxDepth) {
    for (const side of [-1, 1]) {
      growBranch(
        list,
        pos,
        a + side * style.spread * dice.range(0.55, 1.2),
        THREE.MathUtils.clamp(t + (dice.next() - 0.45) * 0.6, 0.15, 2.2),
        len * style.shrink,
        radius * (style.shrink + 0.05),
        depth + 1,
        maxDepth,
        style,
        dice,
        color,
        tips
      );
    }
  } else {
    tips.push({ pos, heading: a, tilt: t, radius: radius * 0.65 });
  }
}

/** Splayed surface roots that dive into the ground around the base. */
function growRoots(
  list: Instance[],
  x: number,
  z: number,
  s: number,
  count: number,
  baseRadius: number,
  length: number,
  dice: Dice,
  color: THREE.Color
): void {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + dice.range(-0.35, 0.35);
    const start: Vec3 = [x + Math.sin(a) * baseRadius * 0.55, dice.range(0.18, 0.4) * s, z + Math.cos(a) * baseRadius * 0.55];
    const tilt = dice.range(1.45, 1.8);
    const r = baseRadius * dice.range(0.3, 0.5);
    const tip = pushLimb(list, start, a, tilt, length * dice.range(0.7, 1.15), r, color);
    // Second, thinner segment kinks further out and sinks in.
    pushLimb(list, tip, a + dice.range(-0.5, 0.5), tilt + 0.25, length * 0.5, r * 0.6, color);
  }
}

/** Chained trunk segments; returns every joint so branches can sprout there. */
function growTrunk(
  list: Instance[],
  x: number,
  z: number,
  heading: number,
  segLen: number,
  baseRadius: number,
  tilts: number[],
  headingTurns: number[],
  color: THREE.Color
): Joint[] {
  const joints: Joint[] = [];
  let pos: Vec3 = [x, -0.08, z];
  let a = heading;
  for (let i = 0; i < tilts.length; i++) {
    const r = baseRadius * (1 - (i / tilts.length) * 0.5);
    a += headingTurns[i];
    pos = pushLimb(list, pos, a, tilts[i], segLen, r, color);
    joints.push({ pos, heading: a, tilt: tilts[i], radius: r * 0.72 });
  }
  return joints;
}

/* ------------------------------------------------------------------------ */
/* Species                                                                   */
/* ------------------------------------------------------------------------ */

const MARSH_STYLE: BranchStyle = { segs: 3, kink: 0.7, spread: 0.7, drift: 0.08, shrink: 0.58 };
const DEAD_STYLE: BranchStyle = { segs: 3, kink: 1.25, spread: 0.85, drift: -0.12, shrink: 0.58 };

/** Zigzag talon: abrupt heading flips, the hooked tips in the graveyard refs. */
function pushZigzag(
  list: Instance[],
  start: Vec3,
  heading: number,
  tilt: number,
  s: number,
  radius: number,
  dice: Dice,
  color: THREE.Color
): void {
  let pos = start;
  let a = heading;
  let t = tilt;
  const n = 3 + Math.floor(dice.next() * 2);
  for (let i = 0; i < n; i++) {
    a += (i % 2 === 0 ? 1 : -1) * dice.range(0.85, 1.35);
    t = THREE.MathUtils.clamp(t + (i % 2 === 0 ? -0.55 : 0.7), 0.2, 2.2);
    pos = pushLimb(list, pos, a, t, dice.range(0.32, 0.5) * s, radius * (1 - i * 0.18), color);
  }
}

function hangMoss(data: ForestData, tip: Vec3, s: number, dice: Dice, count: number, dropMin: number, dropMax: number): void {
  for (let m = 0; m < count; m++) {
    const drop = dice.range(dropMin, dropMax) * s;
    data.moss.push({
      x: tip[0] + dice.range(-0.35, 0.35) * s,
      y: tip[1] + 0.04,
      z: tip[2] + dice.range(-0.35, 0.35) * s,
      rotY: dice.next() * Math.PI,
      rotZ: dice.range(-0.15, 0.15),
      rotX: dice.range(-0.1, 0.1),
      sx: dice.range(0.07, 0.13) * s,
      sy: drop,
      sz: dice.range(0.07, 0.13) * s,
      color: MOSS.clone().multiplyScalar(dice.range(0.7, 1.15)),
    });
  }
}

function buildMarshTree(p: Placement, data: ForestData): void {
  const dice = new Dice(p);
  const s = p.scale;
  const bark = MARSH_BARK.clone().multiplyScalar(dice.range(0.85, 1.15));
  const mossBark = MARSH_MOSS.clone().multiplyScalar(dice.range(0.9, 1.1));
  const baseRadius = 0.42 * s;
  const bonsai = dice.next() < 0.38;

  // Two offset cords so the trunk reads as braided / corkscrew.
  const lean = bonsai ? dice.range(0.45, 0.75) : dice.range(0.18, 0.38);
  const tilts = bonsai
    ? [lean, lean * 0.4, -lean * 1.15, -lean * 0.35, lean * 0.25]
    : [lean, lean * 0.7, -lean * 0.85, -lean * 0.35, lean * 0.15];
  const turns = [0, dice.range(0.4, 0.9), dice.range(0.5, 1.1), dice.range(-0.4, 0.4), dice.range(-0.3, 0.3)];
  const joints = growTrunk(data.marshLimbs, p.x, p.z, p.rot, (bonsai ? 0.95 : 1.15) * s, baseRadius, tilts, turns, bark);
  // Second cord, slightly thinner and phase-shifted, fused to the first.
  growTrunk(
    data.marshLimbs, p.x + Math.sin(p.rot) * 0.12 * s, p.z + Math.cos(p.rot) * 0.12 * s,
    p.rot + 0.4, (bonsai ? 0.9 : 1.1) * s, baseRadius * 0.72, tilts.map((t) => t * 0.85),
    turns.map((t) => -t * 0.6), mossBark
  );

  growRoots(data.marshLimbs, p.x, p.z, s, bonsai ? 7 : 6, baseRadius, (bonsai ? 1.8 : 1.35) * s, dice, MARSH_ROOT);

  // Cypress knees poking out of the water around the base.
  const kneeCount = 5 + Math.floor(dice.next() * 4);
  for (let i = 0; i < kneeCount; i++) {
    const a = (i / kneeCount) * Math.PI * 2 + dice.range(-0.2, 0.2);
    const r = dice.range(0.7, 1.6) * s;
    data.knees.push({
      x: p.x + Math.sin(a) * r,
      y: dice.range(0.18, 0.45) * s,
      z: p.z + Math.cos(a) * r,
      rotY: a, rotZ: dice.range(-0.15, 0.15), rotX: dice.range(-0.1, 0.2),
      sx: dice.range(0.1, 0.18) * s,
      sy: dice.range(0.35, 0.85) * s,
      sz: dice.range(0.1, 0.18) * s,
      color: MARSH_ROOT.clone().multiplyScalar(dice.range(0.85, 1.1)),
    });
  }

  // Mossy islet the tree sits on.
  data.islands.push({
    x: p.x, y: 0.08 * s, z: p.z,
    rotY: p.rot, rotZ: 0, rotX: 0,
    sx: (1.6 + dice.next() * 0.7) * s, sy: 0.22 * s, sz: (1.4 + dice.next() * 0.6) * s,
    color: ISLAND.clone().multiplyScalar(dice.range(0.85, 1.15)),
  });

  const tips: Joint[] = [];
  const sprout = (j: Joint, count: number, len: number, depth: number) => {
    for (let i = 0; i < count; i++) {
      const a = j.heading + (i / count) * Math.PI * 2 + dice.range(-0.35, 0.35);
      growBranch(
        data.marshLimbs, j.pos, a, dice.range(bonsai ? 1.15 : 0.95, bonsai ? 1.5 : 1.35),
        len, j.radius * 0.5, 0, depth, MARSH_STYLE, dice, bark, tips
      );
    }
  };
  if (bonsai) {
    sprout(joints[1], 2, 2.2 * s, 1);
    sprout(joints[2], 2, 2.4 * s, 1);
    sprout(joints[joints.length - 1], 3, 2.0 * s, 1);
  } else {
    sprout(joints[1], 1, 2.2 * s, 1);
    sprout(joints[2], 2, 2.6 * s, 1);
    sprout(joints[3], 2, 2.4 * s, 1);
    sprout(joints[joints.length - 1], 3, 2.3 * s, 1);
  }

  for (const tip of tips) {
    hangMoss(data, tip.pos, s, dice, bonsai ? 2 : 4 + Math.floor(dice.next() * 3), bonsai ? 0.7 : 1.2, bonsai ? 1.6 : 2.8);
    if (bonsai || dice.next() < 0.4) {
      const r = dice.range(0.4, bonsai ? 0.85 : 0.6) * s;
      data.oakCanopy.push({
        x: tip.pos[0], y: tip.pos[1] + r * 0.25, z: tip.pos[2],
        rotY: dice.next() * Math.PI, rotZ: 0, rotX: 0,
        sx: r * 1.35, sy: r * 0.45, sz: r,
        color: TUFT.clone().multiplyScalar(dice.range(0.85, 1.2)),
      });
    }
  }

  // Climbing vines on the lower trunk.
  for (let v = 0; v < 3; v++) {
    const a = p.rot + v * 2.1 + dice.range(-0.3, 0.3);
    data.vines.push({
      x: p.x + Math.sin(a) * baseRadius * 0.85,
      y: dice.range(0.6, 1.4) * s,
      z: p.z + Math.cos(a) * baseRadius * 0.85,
      rotY: a, rotZ: 0, rotX: dice.range(-0.15, 0.15),
      sx: 0.05 * s, sy: dice.range(1.1, 1.8) * s, sz: 0.05 * s,
      color: VINE.clone().multiplyScalar(dice.range(0.8, 1.15)),
    });
  }

  // Cattails around the islet.
  const reedCount = 4 + Math.floor(dice.next() * 4);
  for (let i = 0; i < reedCount; i++) {
    const a = dice.next() * Math.PI * 2;
    const r = dice.range(1.3, 2.2) * s;
    const h = dice.range(0.7, 1.25) * s;
    data.cattails.push({
      x: p.x + Math.sin(a) * r, y: h * 0.5, z: p.z + Math.cos(a) * r,
      rotY: a, rotZ: dice.range(-0.12, 0.12), rotX: 0,
      sx: 0.035 * s, sy: h, sz: 0.035 * s,
      color: CATTAIL.clone().multiplyScalar(dice.range(0.8, 1.15)),
    });
    data.cattails.push({
      x: p.x + Math.sin(a) * r, y: h + 0.08 * s, z: p.z + Math.cos(a) * r,
      rotY: a, rotZ: 0, rotX: 0,
      sx: 0.07 * s, sy: 0.16 * s, sz: 0.07 * s,
      color: new THREE.Color("#3a2a18"),
    });
  }
}

function buildDeadTree(p: Placement, data: ForestData): void {
  const dice = new Dice(p);
  const s = p.scale;
  const bark = DEAD_BARK.clone().lerp(DEAD_ASH, dice.next() * 0.45).multiplyScalar(dice.range(0.85, 1.15));
  const baseRadius = 0.5 * s;

  // Thick twisting trunk: large heading turns so it looks wrung like a cloth.
  const joints = growTrunk(
    data.deadLimbs, p.x, p.z, p.rot, 1.2 * s, baseRadius,
    [0.08, dice.range(0.12, 0.28), dice.range(0.1, 0.24), dice.range(0.05, 0.18)],
    [0, dice.range(1.6, 2.6), dice.range(1.6, 2.8), dice.range(0.8, 1.6)],
    bark
  );
  growTrunk(
    data.deadLimbs,
    p.x + Math.sin(p.rot + 0.8) * 0.14 * s,
    p.z + Math.cos(p.rot + 0.8) * 0.14 * s,
    p.rot + 0.5, 1.15 * s, baseRadius * 0.7,
    [0.1, 0.18, 0.16, 0.1],
    [0, -2.1, -2.2, -1.2],
    bark.clone().multiplyScalar(0.88)
  );

  // Stubby irregular roots gripping the ground — not long sprawling ones.
  const rootCount = 5 + Math.floor(dice.next() * 3);
  for (let i = 0; i < rootCount; i++) {
    const a = (i / rootCount) * Math.PI * 2 + dice.range(-0.25, 0.25);
    const start: Vec3 = [
      p.x + Math.sin(a) * baseRadius * 0.65,
      0.22 * s,
      p.z + Math.cos(a) * baseRadius * 0.65,
    ];
    const tip = pushLimb(data.deadLimbs, start, a, dice.range(1.35, 1.65), dice.range(0.55, 0.95) * s, baseRadius * 0.38, bark);
    pushLimb(data.deadLimbs, tip, a + dice.range(-0.4, 0.4), 1.7, 0.35 * s, baseRadius * 0.22, bark);
  }

  const tips: Joint[] = [];
  // Wide reaching crown: many nearly-horizontal limbs that fork into claws.
  const lowCount = 2;
  for (let i = 0; i < lowCount; i++) {
    growBranch(
      data.deadLimbs, joints[0].pos, p.rot + i * Math.PI + dice.range(-0.4, 0.4),
      dice.range(1.05, 1.35), 2.2 * s, baseRadius * 0.38, 0, 1, DEAD_STYLE, dice, bark, tips
    );
  }
  for (let i = 0; i < 3; i++) {
    growBranch(
      data.deadLimbs, joints[1].pos, joints[1].heading + (i / 3) * Math.PI * 2 + dice.range(-0.4, 0.4),
      dice.range(0.85, 1.25), 2.6 * s, joints[1].radius * 0.48, 0, 2, DEAD_STYLE, dice, bark, tips
    );
  }
  for (let i = 0; i < 3; i++) {
    growBranch(
      data.deadLimbs, joints[joints.length - 1].pos,
      joints[joints.length - 1].heading + (i / 3) * Math.PI * 2 + dice.range(-0.3, 0.3),
      dice.range(0.4, 0.9), 2.8 * s, joints[joints.length - 1].radius * 0.5, 0, 2, DEAD_STYLE, dice, bark, tips
    );
  }
  for (const tip of tips) {
    pushZigzag(data.deadLimbs, tip.pos, tip.heading, tip.tilt, s, tip.radius * 0.7, dice, bark);
  }

  // Haunted face: slanted triangular eyes and a jagged grin.
  if (dice.next() < 0.4) {
    const face = p.rot + Math.PI;
    const fx = Math.sin(face);
    const fz = Math.cos(face);
    const surface = baseRadius * 0.92;
    const eyeY = 1.55 * s;
    const place = (lateral: number, y: number, sx: number, sy: number, rotZ: number) => {
      data.hollows.push({
        x: p.x + fx * surface + Math.cos(face) * lateral,
        y,
        z: p.z + fz * surface - Math.sin(face) * lateral,
        rotY: face, rotZ, rotX: 0.15,
        sx, sy, sz: 0.1 * s,
        color: WHITE,
      });
    };
    place(-0.16 * s, eyeY, 0.11 * s, 0.16 * s, 0.45);
    place(0.16 * s, eyeY, 0.11 * s, 0.16 * s, -0.45);
    place(0, eyeY - 0.38 * s, 0.28 * s, 0.12 * s, 0);
  }
}

function buildForest(): ForestData {
  const data: ForestData = {
    coniferTrunks: [],
    coniferFoliage: [],
    oakTrunks: [],
    oakBranches: [],
    oakCanopy: [],
    marshLimbs: [],
    deadLimbs: [],
    moss: [],
    hollows: [],
    islands: [],
    knees: [],
    cattails: [],
    vines: [],
  };
  const coniferBase = new THREE.Color("#1d3a23");
  const oakBase = new THREE.Color("#2d5528");

  for (const p of TREES) {
    const biome = biomeAt(p.x, p.z);
    if (biome === "swamp") {
      buildMarshTree(p, data);
      continue;
    }
    if (biome === "graveyard") {
      buildDeadTree(p, data);
      continue;
    }

    const s = p.scale;
    const lean = (hash(p, 1) - 0.5) * 0.12;
    if (isConifer(p)) {
      data.coniferTrunks.push({
        x: p.x, y: 4.1 * s, z: p.z,
        rotY: p.rot, rotZ: lean, rotX: 0,
        sx: s, sy: s, sz: s,
        color: WHITE,
      });
      const tint = coniferBase.clone().multiplyScalar(0.8 + hash(p, 2) * 0.45);
      CONIFER_LAYERS.forEach(([base, radius, height], i) => {
        const squash = 0.9 + hash(p, 10 + i) * 0.2;
        data.coniferFoliage.push({
          x: p.x + lean * base * s, y: (base + height / 2) * s, z: p.z,
          rotY: p.rot + i * 0.7, rotZ: lean, rotX: 0,
          sx: radius * s * squash, sy: height * s, sz: radius * s / squash,
          color: tint.clone().multiplyScalar(1 - i * 0.05),
        });
      });
    } else {
      data.oakTrunks.push({
        x: p.x, y: 1.9 * s, z: p.z,
        rotY: p.rot, rotZ: lean, rotX: 0,
        sx: s, sy: s, sz: s,
        color: WHITE,
      });
      for (let b = 0; b < 3; b++) {
        const a = p.rot + b * 2.1 + hash(p, 20 + b) * 0.6;
        const tilt = 0.75 + hash(p, 30 + b) * 0.35;
        // Branch starts near the trunk top and leans outward.
        pushBranch(data.oakBranches, p.x, 3.4 * s, p.z, a, tilt, 2.1 * s, s, WHITE);
      }
      const tint = oakBase.clone().multiplyScalar(0.8 + hash(p, 3) * 0.45);
      OAK_BLOBS.forEach(([bx, by, bz, r], i) => {
        const cos = Math.cos(p.rot);
        const sin = Math.sin(p.rot);
        const wobble = 0.9 + hash(p, 40 + i) * 0.25;
        data.oakCanopy.push({
          x: p.x + (bx * cos + bz * sin) * s,
          y: by * s,
          z: p.z + (-bx * sin + bz * cos) * s,
          rotY: hash(p, 50 + i) * Math.PI * 2, rotZ: 0, rotX: 0,
          sx: r * s * wobble, sy: r * s * 0.82, sz: r * s / wobble,
          color: tint.clone().multiplyScalar(1 - i * 0.04 + (i === 3 ? 0.12 : 0)),
        });
      });
    }
  }
  return data;
}

function applyInstances(mesh: THREE.InstancedMesh, list: Instance[]): void {
  const dummy = new THREE.Object3D();
  list.forEach((inst, i) => {
    dummy.position.set(inst.x, inst.y, inst.z);
    // YXZ: tilt (X) first, then heading (Y), so branches lean outward.
    dummy.rotation.set(inst.rotX, inst.rotY, inst.rotZ, "YXZ");
    dummy.scale.set(inst.sx, inst.sy, inst.sz);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    mesh.setColorAt(i, inst.color);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

function InstancedBatch({
  geometry,
  material,
  list,
  shadow = true,
}: {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  list: Instance[];
  shadow?: boolean;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    if (ref.current) applyInstances(ref.current, list);
  }, [list]);
  if (list.length === 0) return null;
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, list.length]}
      castShadow={shadow}
      receiveShadow
      frustumCulled={false}
    />
  );
}

export function Trees() {
  const bark = useBarkTexture();
  const foliage = useFoliageTexture();
  const forest = useMemo(() => buildForest(), []);

  const geo = useMemo(
    () => ({
      coniferTrunk: new THREE.CylinderGeometry(0.06, 0.26, 8.2, 7),
      cone: roughen(new THREE.ConeGeometry(1, 1, 9, 4), 0.09),
      oakTrunk: new THREE.CylinderGeometry(0.17, 0.32, 3.8, 8),
      branch: new THREE.CylinderGeometry(0.05, 0.11, 1, 6),
      blob: roughen(new THREE.IcosahedronGeometry(1, 1), 0.16),
      limb: furrow(
        twistAlongY(new THREE.CylinderGeometry(0.7, 1, 1, 8, 5, true).translate(0, 0.5, 0), 0.7),
        0.12,
        7
      ),
      strand: new THREE.CylinderGeometry(0.45, 0.08, 1, 4, 1).translate(0, -0.5, 0),
      hollow: new THREE.ConeGeometry(1, 1.4, 3).rotateX(Math.PI),
      island: roughen(new THREE.SphereGeometry(1, 9, 7), 0.18),
      knee: new THREE.ConeGeometry(0.45, 1, 6).translate(0, 0.5, 0),
      vine: new THREE.CylinderGeometry(1, 0.7, 1, 5).translate(0, 0.5, 0),
    }),
    []
  );
  const mats = useMemo(
    () => ({
      bark: new THREE.MeshStandardMaterial({ map: bark, color: "#8a6e52", roughness: 0.95 }),
      marshWood: new THREE.MeshStandardMaterial({ map: bark, color: "#c4c0a8", roughness: 0.72, flatShading: true }),
      deadWood: new THREE.MeshStandardMaterial({ map: bark, color: "#c8c4c0", roughness: 0.98, flatShading: true }),
      island: new THREE.MeshStandardMaterial({ map: foliage, color: "#ffffff", roughness: 1, flatShading: true }),
      vine: new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.95, flatShading: true }),
      needles: new THREE.MeshStandardMaterial({
        map: foliage,
        color: "#ffffff",
        roughness: 0.92,
        flatShading: true,
      }),
      leaves: new THREE.MeshStandardMaterial({
        map: foliage,
        color: "#ffffff",
        roughness: 0.9,
        flatShading: true,
      }),
      moss: new THREE.MeshStandardMaterial({
        map: foliage,
        color: "#d4e0c8",
        roughness: 1,
        flatShading: true,
      }),
      hollow: new THREE.MeshStandardMaterial({
        color: "#050505",
        emissive: "#3a0a06",
        emissiveIntensity: 0.9,
        roughness: 1,
      }),
    }),
    [bark, foliage]
  );

  useEffect(() => {
    return () => {
      Object.values(geo).forEach((g) => g.dispose());
      Object.values(mats).forEach((m) => m.dispose());
    };
  }, [geo, mats]);

  return (
    <group>
      <InstancedBatch geometry={geo.coniferTrunk} material={mats.bark} list={forest.coniferTrunks} />
      <InstancedBatch geometry={geo.cone} material={mats.needles} list={forest.coniferFoliage} />
      <InstancedBatch geometry={geo.oakTrunk} material={mats.bark} list={forest.oakTrunks} />
      <InstancedBatch geometry={geo.branch} material={mats.bark} list={forest.oakBranches} shadow={false} />
      <InstancedBatch geometry={geo.blob} material={mats.leaves} list={forest.oakCanopy} />
      <InstancedBatch geometry={geo.island} material={mats.island} list={forest.islands} />
      <InstancedBatch geometry={geo.limb} material={mats.marshWood} list={forest.marshLimbs} />
      <InstancedBatch geometry={geo.limb} material={mats.deadWood} list={forest.deadLimbs} />
      <InstancedBatch geometry={geo.knee} material={mats.marshWood} list={forest.knees} />
      <InstancedBatch geometry={geo.vine} material={mats.vine} list={forest.vines} shadow={false} />
      <InstancedBatch geometry={geo.vine} material={mats.vine} list={forest.cattails} shadow={false} />
      <InstancedBatch geometry={geo.strand} material={mats.moss} list={forest.moss} shadow={false} />
      <InstancedBatch geometry={geo.hollow} material={mats.hollow} list={forest.hollows} shadow={false} />
    </group>
  );
}
