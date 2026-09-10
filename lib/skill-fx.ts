import * as THREE from "three";

function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function stroke(
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

function toTexture(c: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** First/second hit — hooked crescents from the top of the plate. */
export function createHookSlashTexture(): THREE.CanvasTexture {
  const c = canvas(512, 256);
  const ctx = c.getContext("2d");
  if (ctx) {
    ctx.clearRect(0, 0, 512, 256);
    stroke(ctx, [[30, 210], [90, 70], [200, 28], [300, 36], [390, 90], [430, 150]], 11, "rgba(255,255,255,0.96)", 18);
    stroke(ctx, [[48, 218], [110, 92], [210, 48], [300, 58]], 4, "rgba(255,255,255,0.5)", 10);
    stroke(ctx, [[12, 168], [46, 118], [22, 64]], 3.4, "rgba(255,255,255,0.9)", 8);
    stroke(ctx, [[8, 196], [38, 150], [18, 108]], 2.4, "rgba(255,255,255,0.75)", 6);
    stroke(ctx, [[418, 72], [470, 88], [500, 48]], 3.2, "rgba(255,255,255,0.88)", 8);
    stroke(ctx, [[400, 118], [458, 148], [494, 118]], 2.6, "rgba(255,255,255,0.7)", 6);
  }
  return toTexture(c);
}

/** Third hit — looping wrap from the bottom of the plate. */
export function createLoopSlashTexture(): THREE.CanvasTexture {
  const c = canvas(512, 512);
  const ctx = c.getContext("2d");
  if (ctx) {
    ctx.clearRect(0, 0, 512, 512);
    stroke(
      ctx,
      [[90, 400], [40, 260], [120, 90], [300, 50], [430, 140], [400, 300], [250, 390], [160, 300], [220, 180]],
      12,
      "rgba(255,255,255,0.95)",
      20
    );
    stroke(ctx, [[200, 430], [120, 300], [180, 140], [320, 90]], 4, "rgba(255,255,255,0.45)", 10);
    stroke(ctx, [[70, 120], [130, 40], [190, 70]], 3.2, "rgba(255,255,255,0.85)", 8);
    stroke(ctx, [[360, 40], [420, 20], [400, 80]], 3, "rgba(255,255,255,0.8)", 8);
    stroke(ctx, [[300, 460], [360, 500], [420, 430], [390, 390]], 3.4, "rgba(255,255,255,0.85)", 8);
  }
  return toTexture(c);
}

/** Third-hit equatorial slash — the circling belt. */
export function createRingSlashTexture(): THREE.CanvasTexture {
  const c = canvas(256, 256);
  const ctx = c.getContext("2d");
  if (ctx) {
    ctx.clearRect(0, 0, 256, 256);
    ctx.save();
    ctx.translate(128, 128);
    ctx.strokeStyle = "rgba(255,255,255,0.92)";
    ctx.shadowColor = "rgba(255,255,255,0.8)";
    ctx.shadowBlur = 14;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(0, 0, 86, 0.15, Math.PI * 1.85);
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 70, 0.8, Math.PI * 1.4);
    ctx.stroke();
    ctx.restore();
    stroke(ctx, [[20, 140], [50, 110], [30, 88]], 3, "rgba(255,255,255,0.75)", 6);
    stroke(ctx, [[220, 150], [246, 128], [230, 100]], 3, "rgba(255,255,255,0.75)", 6);
  }
  return toTexture(c);
}

/** @deprecated use createHookSlashTexture */
export function createSlashTexture(): THREE.CanvasTexture {
  return createHookSlashTexture();
}

/** Sickly green hex glyph for Hex Trap. */
export function createHexGlyphTexture(): THREE.CanvasTexture {
  const c = canvas(256, 256);
  const ctx = c.getContext("2d");
  if (ctx) {
    ctx.clearRect(0, 0, 256, 256);
    const cx = 128;
    const cy = 128;
    const hex = (r: number) => {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 6;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
    };

    const glow = ctx.createRadialGradient(cx, cy, 10, cx, cy, 120);
    glow.addColorStop(0, "rgba(160,255,80,0.35)");
    glow.addColorStop(0.55, "rgba(80,180,40,0.22)");
    glow.addColorStop(1, "rgba(40,80,20,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, 120, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(180,255,90,0.95)";
    ctx.shadowColor = "rgba(120,255,40,0.9)";
    ctx.shadowBlur = 16;
    ctx.lineWidth = 5;
    hex(98);
    ctx.stroke();
    ctx.lineWidth = 2.4;
    hex(68);
    ctx.stroke();

    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 6;
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * 68, cy + Math.sin(a) * 68);
    }
    ctx.stroke();

    ctx.fillStyle = "rgba(210,255,120,1)";
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 6;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * 98, cy + Math.sin(a) * 98, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(cx, cy, 7, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}
