import {
  DOOR_HALF,
  DOOR_HEIGHT,
  GATE_POSITION,
  HOUSES,
  ROCKS,
  STREETLIGHTS,
  TOMBSTONES,
  TREES,
  WALL_THICKNESS,
  biomeAt,
  houseSolids,
  toLocal,
  type HouseKind,
} from "@/lib/world-data";

export type HitSurface = "wood" | "ground" | "stone" | "boss";

export interface AimHit {
  x: number;
  y: number;
  z: number;
  t: number;
  surface: HitSurface;
  id: string;
}

const AIM_FAR = 80;
const AIM_NEAR = 0.85;

/** Must match `CONIFER_LAYERS` in Trees.tsx. */
const CONIFER_LAYERS: [base: number, radius: number, height: number][] = [
  [0.9, 1.95, 3.1],
  [2.6, 1.55, 2.9],
  [4.25, 1.15, 2.7],
  [5.75, 0.72, 2.5],
];

/** Must match `OAK_BLOBS` in Trees.tsx. */
const OAK_BLOBS: [x: number, y: number, z: number, r: number][] = [
  [0, 4.7, 0, 2.15],
  [-1.45, 4.25, 0.55, 1.45],
  [1.35, 4.35, -0.65, 1.4],
  [0.35, 5.95, 0.25, 1.3],
  [-0.4, 3.9, -1.3, 1.15],
];

interface Trace {
  t: number;
  surface: HitSurface;
  id: string;
  tMin: number;
  ignore?: ReadonlySet<string>;
}

function take(trace: Trace, t: number, surface: HitSurface, id: string): void {
  if (t < trace.tMin || t >= trace.t) return;
  if (trace.ignore?.has(id)) return;
  trace.t = t;
  trace.surface = surface;
  trace.id = id;
}

function hitCylinderY(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  cx: number,
  cz: number,
  radius: number,
  y0: number,
  y1: number,
  surface: HitSurface,
  id: string,
  trace: Trace
): void {
  if (trace.ignore?.has(id)) return;
  const fx = ox - cx;
  const fz = oz - cz;
  const a = dx * dx + dz * dz;
  if (a < 1e-8) return;
  const b = 2 * (fx * dx + fz * dz);
  const c = fx * fx + fz * fz - radius * radius;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return;
  const sqrt = Math.sqrt(disc);
  const inv = 0.5 / a;
  const tEnter = (-b - sqrt) * inv;
  const tExit = (-b + sqrt) * inv;
  for (const t of [tEnter, tExit]) {
    if (t < trace.tMin || t >= trace.t) continue;
    const y = oy + dy * t;
    if (y >= y0 && y <= y1) take(trace, t, surface, id);
  }
  if (tEnter < trace.tMin && tExit >= trace.tMin && tEnter < trace.t) {
    const y = oy + dy * trace.tMin;
    if (y >= y0 && y <= y1) take(trace, trace.tMin, surface, id);
  }
}

function hitSphere(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  cx: number,
  cy: number,
  cz: number,
  radius: number,
  surface: HitSurface,
  id: string,
  trace: Trace
): void {
  if (trace.ignore?.has(id)) return;
  const fx = ox - cx;
  const fy = oy - cy;
  const fz = oz - cz;
  const b = fx * dx + fy * dy + fz * dz;
  const c = fx * fx + fy * fy + fz * fz - radius * radius;
  const disc = b * b - c;
  if (disc < 0) return;
  const sqrt = Math.sqrt(disc);
  const t0 = -b - sqrt;
  const t1 = -b + sqrt;
  take(trace, t0, surface, id);
  take(trace, t1, surface, id);
  if (t0 < trace.tMin && t1 >= trace.tMin) take(trace, trace.tMin, surface, id);
}

function hitAabb(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  minZ: number,
  maxZ: number,
  surface: HitSurface,
  id: string,
  trace: Trace
): void {
  if (trace.ignore?.has(id)) return;
  let tmin = -1e9;
  let tmax = 1e9;
  const slabs: [number, number, number, number][] = [
    [ox, dx, minX, maxX],
    [oy, dy, minY, maxY],
    [oz, dz, minZ, maxZ],
  ];
  for (const [o, d, min, max] of slabs) {
    if (Math.abs(d) < 1e-8) {
      if (o < min || o > max) return;
      continue;
    }
    const inv = 1 / d;
    let t0 = (min - o) * inv;
    let t1 = (max - o) * inv;
    if (t0 > t1) {
      const tmp = t0;
      t0 = t1;
      t1 = tmp;
    }
    tmin = Math.max(tmin, t0);
    tmax = Math.min(tmax, t1);
    if (tmax < tmin) return;
  }
  take(trace, tmin, surface, id);
  if (tmin < trace.tMin && tmax >= trace.tMin) take(trace, trace.tMin, surface, id);
}

function wallTop(kind: HouseKind): number {
  if (kind === "shack") return 2.85;
  if (kind === "crypt") return 3.0;
  return 3.4;
}

function traceWorld(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  maxT: number,
  tMin: number,
  ignore?: ReadonlySet<string>,
  extras?: readonly { x: number; y: number; z: number; r: number }[]
): Trace {
  const len = Math.hypot(dx, dy, dz) || 1;
  dx /= len;
  dy /= len;
  dz /= len;

  const trace: Trace = { t: maxT, surface: "ground", id: "", tMin, ignore };

  if (dy < -1e-5) {
    const t = (0.02 - oy) / dy;
    take(trace, t, "ground", "ground");
  }

  const horiz = dx * dx + dz * dz;

  for (let i = 0; i < TREES.length; i++) {
    const tree = TREES[i];
    const s = tree.scale;
    const biome = biomeAt(tree.x, tree.z);
    const reach = (biome === "forest" ? 2.7 : 1.9) * s + 0.4;
    const wx = tree.x - ox;
    const wz = tree.z - oz;
    const tClose = horiz > 1e-8 ? (wx * dx + wz * dz) / horiz : 0;
    if (tClose > trace.t + 8 || tClose < -2) continue;
    const px = ox + dx * Math.max(0, tClose) - tree.x;
    const pz = oz + dz * Math.max(0, tClose) - tree.z;
    if (px * px + pz * pz > reach * reach) continue;
    const id = `tree:${i}`;

    if (biome === "forest") {
      const conifer = tree.rot > Math.PI * 0.9;
      if (conifer) {
        hitCylinderY(ox, oy, oz, dx, dy, dz, tree.x, tree.z, 0.28 * s, 0, 8.3 * s, "wood", id, trace);
        for (const [base, radius, height] of CONIFER_LAYERS) {
          hitCylinderY(
            ox, oy, oz, dx, dy, dz,
            tree.x, tree.z, radius * s * 0.92,
            base * s, (base + height) * s,
            "wood", id, trace
          );
        }
      } else {
        hitCylinderY(ox, oy, oz, dx, dy, dz, tree.x, tree.z, 0.34 * s, 0, 3.9 * s, "wood", id, trace);
        const cos = Math.cos(tree.rot);
        const sin = Math.sin(tree.rot);
        for (const [bx, by, bz, r] of OAK_BLOBS) {
          hitSphere(
            ox, oy, oz, dx, dy, dz,
            tree.x + (bx * cos + bz * sin) * s,
            by * s,
            tree.z + (-bx * sin + bz * cos) * s,
            r * s,
            "wood", id, trace
          );
        }
      }
    } else if (biome === "swamp") {
      hitCylinderY(ox, oy, oz, dx, dy, dz, tree.x, tree.z, 0.48 * s, 0, 6.2 * s, "wood", id, trace);
      hitSphere(ox, oy, oz, dx, dy, dz, tree.x, 3.4 * s, tree.z, 1.35 * s, "wood", id, trace);
    } else {
      hitCylinderY(ox, oy, oz, dx, dy, dz, tree.x, tree.z, 0.52 * s, 0, 5.4 * s, "wood", id, trace);
      hitSphere(ox, oy, oz, dx, dy, dz, tree.x, 3.2 * s, tree.z, 1.15 * s, "wood", id, trace);
    }
  }

  for (let hi = 0; hi < HOUSES.length; hi++) {
    const h = HOUSES[hi];
    const { lx, lz } = toLocal(h, ox, oz);
    const cos = Math.cos(h.rot);
    const sin = Math.sin(h.rot);
    const ldx = dx * cos - dz * sin;
    const ldz = dx * sin + dz * cos;
    const top = h.floorY + wallTop(h.kind);
    const roof = top + (h.kind === "cabin" ? 2.2 : 1.4);
    const solids = houseSolids(h);
    for (let s = 0; s < solids.length; s++) {
      const [minX, maxX, minZ, maxZ] = solids[s];
      const rail = maxZ - minZ < 0.3 && maxX - minX > 1;
      const y1 = rail ? h.floorY + 1.15 : top;
      hitAabb(lx, oy, lz, ldx, dy, ldz, minX, maxX, h.floorY, y1, minZ, maxZ, "wood", `house:${hi}:${s}`, trace);
    }
    const t = WALL_THICKNESS;
    hitAabb(
      lx, oy, lz, ldx, dy, ldz,
      -DOOR_HALF, DOOR_HALF, h.floorY + DOOR_HEIGHT, top, h.halfD - t, h.halfD,
      "wood", `house:${hi}:lintel`, trace
    );
    hitAabb(lx, oy, lz, ldx, dy, ldz, -h.halfW, h.halfW, top - 0.05, roof, -h.halfD, h.halfD, "wood", `house:${hi}:roof`, trace);
  }

  for (let i = 0; i < ROCKS.length; i++) {
    const rock = ROCKS[i];
    hitSphere(ox, oy, oz, dx, dy, dz, rock.x, 0.18 * rock.scale, rock.z, 0.52 * rock.scale, "stone", `rock:${i}`, trace);
  }

  for (let i = 0; i < TOMBSTONES.length; i++) {
    const stone = TOMBSTONES[i];
    const s = stone.scale;
    const cos = Math.cos(stone.rot);
    const sin = Math.sin(stone.rot);
    const dxw = ox - stone.x;
    const dzw = oz - stone.z;
    const lx = dxw * cos - dzw * sin;
    const lz = dxw * sin + dzw * cos;
    const ldx = dx * cos - dz * sin;
    const ldz = dx * sin + dz * cos;
    hitAabb(
      lx, oy, lz, ldx, dy, ldz,
      -0.28 * s, 0.28 * s, 0, 0.82 * s, -0.08 * s, 0.08 * s,
      "stone", `tomb:${i}`, trace
    );
  }

  for (let i = 0; i < STREETLIGHTS.length; i++) {
    const light = STREETLIGHTS[i];
    hitCylinderY(ox, oy, oz, dx, dy, dz, light.x, light.z, 0.16, 0, 4.8, "wood", `lamp:${i}`, trace);
  }

  hitAabb(
    ox, oy, oz, dx, dy, dz,
    GATE_POSITION.x - 2.05, GATE_POSITION.x - 1.15, 0, 3.85,
    GATE_POSITION.z - 0.45, GATE_POSITION.z + 0.45,
    "stone", "gate:l", trace
  );
  hitAabb(
    ox, oy, oz, dx, dy, dz,
    GATE_POSITION.x + 1.15, GATE_POSITION.x + 2.05, 0, 3.85,
    GATE_POSITION.z - 0.45, GATE_POSITION.z + 0.45,
    "stone", "gate:r", trace
  );
  hitAabb(
    ox, oy, oz, dx, dy, dz,
    GATE_POSITION.x - 2.2, GATE_POSITION.x + 2.2, 3.5, 4.3,
    GATE_POSITION.z - 0.5, GATE_POSITION.z + 0.5,
    "stone", "gate:lintel", trace
  );

  if (extras) {
    for (let i = 0; i < extras.length; i++) {
      const extra = extras[i];
      hitSphere(ox, oy, oz, dx, dy, dz, extra.x, extra.y, extra.z, extra.r, "boss", `boss:${i}`, trace);
    }
  }

  return trace;
}

function hitFromTrace(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  trace: Trace
): AimHit {
  const len = Math.hypot(dx, dy, dz) || 1;
  dx /= len;
  dy /= len;
  dz /= len;
  return {
    t: trace.t,
    x: ox + dx * trace.t,
    y: oy + dy * trace.t,
    z: oz + dz * trace.t,
    surface: trace.surface,
    id: trace.id,
  };
}

/**
 * Closest aimable surface along a camera ray. Falls back to a far point
 * so sky-aimed shots still have a target.
 */
export function raycastAim(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  extras?: readonly { x: number; y: number; z: number; r: number }[]
): AimHit {
  const len = Math.hypot(dx, dy, dz) || 1;
  dx /= len;
  dy /= len;
  dz /= len;
  const trace = traceWorld(ox, oy, oz, dx, dy, dz, AIM_FAR, AIM_NEAR, undefined, extras);
  if (trace.id) return hitFromTrace(ox, oy, oz, dx, dy, dz, trace);
  return {
    t: AIM_FAR,
    x: ox + dx * AIM_FAR,
    y: oy + dy * AIM_FAR,
    z: oz + dz * AIM_FAR,
    surface: "ground",
    id: "sky",
  };
}

/** First world surface along a short segment, or null if the path is clear. */
export function raycastWorld(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  maxT: number,
  ignore?: ReadonlySet<string>
): AimHit | null {
  if (maxT <= 0.001) return null;
  const trace = traceWorld(ox, oy, oz, dx, dy, dz, maxT, 0.001, ignore);
  if (!trace.id) return null;
  return hitFromTrace(ox, oy, oz, dx, dy, dz, trace);
}
