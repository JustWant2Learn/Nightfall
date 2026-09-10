import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

function makeCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 512;
  return canvas;
}

function wisp(
  ctx: CanvasRenderingContext2D,
  points: readonly [number, number][],
  width: number,
  color: string,
  blur: number
): void {
  if (points.length < 2) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length - 1; i++) {
    const [x, y] = points[i];
    const [nx, ny] = points[i + 1];
    ctx.quadraticCurveTo(x, y, (x + nx) * 0.5, (y + ny) * 0.5);
  }
  const last = points[points.length - 1];
  ctx.lineTo(last[0], last[1]);
  ctx.stroke();
  ctx.restore();
}

/** Paints the reference comet: white-hot head, orange body, curling streamers. */
export function paintFireball(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.clearRect(0, 0, w, h);
  const cx = w * 0.5;
  const cy = h * 0.3;

  wisp(ctx, [[cx, cy], [cx + 18, cy + 70], [cx - 8, cy + 140], [cx + 28, cy + 210], [cx + 8, cy + 300]], 5, "rgba(255,110,20,0.28)", 22);
  wisp(ctx, [[cx, cy], [cx - 22, cy + 55], [cx + 6, cy + 120], [cx - 24, cy + 190], [cx - 6, cy + 270]], 3.5, "rgba(255,150,30,0.32)", 18);
  wisp(ctx, [[cx + 4, cy + 10], [cx + 36, cy + 90], [cx + 14, cy + 170], [cx + 42, cy + 250], [cx + 22, cy + 340]], 2.6, "rgba(255,170,40,0.38)", 16);
  wisp(ctx, [[cx - 2, cy + 8], [cx - 34, cy + 85], [cx - 12, cy + 165], [cx - 30, cy + 240]], 2.2, "rgba(255,90,10,0.3)", 14);
  wisp(ctx, [[cx + 10, cy + 20], [cx + 8, cy + 100], [cx + 26, cy + 180], [cx + 4, cy + 260]], 1.8, "rgba(255,220,80,0.4)", 12);

  ctx.save();
  ctx.translate(cx, cy + 48);
  ctx.rotate(-0.18);
  ctx.scale(0.52, 1.38);
  const body = ctx.createRadialGradient(0, -28, 3, 0, 8, 78);
  body.addColorStop(0, "rgba(255,255,230,1)");
  body.addColorStop(0.18, "rgba(255,236,110,0.98)");
  body.addColorStop(0.38, "rgba(255,180,36,0.88)");
  body.addColorStop(0.62, "rgba(255,110,16,0.5)");
  body.addColorStop(1, "rgba(255,40,0,0)");
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(0, 0, 78, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const halo = ctx.createRadialGradient(cx, cy, 2, cx, cy, 54);
  halo.addColorStop(0, "rgba(255,255,255,1)");
  halo.addColorStop(0.22, "rgba(255,248,190,1)");
  halo.addColorStop(0.48, "rgba(255,200,50,0.75)");
  halo.addColorStop(0.72, "rgba(255,120,20,0.28)");
  halo.addColorStop(1, "rgba(255,60,0,0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(cx, cy, 54, 0, Math.PI * 2);
  ctx.fill();

  const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, 22);
  core.addColorStop(0, "rgba(255,255,255,1)");
  core.addColorStop(0.45, "rgba(255,252,210,1)");
  core.addColorStop(1, "rgba(255,220,80,0)");
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(cx, cy, 22, 0, Math.PI * 2);
  ctx.fill();
}

export function createFireballTexture(): THREE.CanvasTexture {
  const canvas = makeCanvas();
  const ctx = canvas.getContext("2d");
  if (ctx) paintFireball(ctx, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function prepare(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const ready = geo.index ? geo.toNonIndexed() : geo;
  if (ready !== geo) geo.dispose();
  const keep = new Set(["position", "normal", "uv"]);
  for (const name of Object.keys(ready.attributes)) {
    if (!keep.has(name)) ready.deleteAttribute(name);
  }
  ready.clearGroups();
  if (!ready.getAttribute("normal")) ready.computeVertexNormals();
  return ready;
}

/**
 * Crossed flame cards + a hot core. +Y is the glowing head so combat can
 * aim with setFromUnitVectors(Y, velocity).
 */
export function createFireballGeometry(): THREE.BufferGeometry {
  const plane = new THREE.PlaneGeometry(0.72, 1.72, 1, 1);
  plane.translate(0, -0.42, 0);
  const a = prepare(plane);

  const crossed = prepare(new THREE.PlaneGeometry(0.72, 1.72, 1, 1).translate(0, -0.42, 0));
  crossed.rotateY(Math.PI / 2);

  const merged = mergeGeometries([a, crossed], false);
  a.dispose();
  crossed.dispose();
  if (!merged) {
    return new THREE.PlaneGeometry(0.72, 1.72);
  }
  merged.computeVertexNormals();
  return merged;
}
