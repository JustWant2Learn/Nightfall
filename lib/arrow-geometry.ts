import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const WOOD = new THREE.Color("#9a4e22");
const WOOD_CORE = new THREE.Color("#7a3818");
const WRAP_A = new THREE.Color("#3a2414");
const WRAP_B = new THREE.Color("#5a3820");
const STEEL = new THREE.Color("#efe6d4");
const STEEL_RIB = new THREE.Color("#d4c4a8");
const STEEL_EDGE = new THREE.Color("#f7f1e6");
const COLLAR = new THREE.Color("#c8b89a");

function paint(geo: THREE.BufferGeometry, color: THREE.Color): THREE.BufferGeometry {
  const n = geo.getAttribute("position").count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = color.r;
    arr[i * 3 + 1] = color.g;
    arr[i * 3 + 2] = color.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  return geo;
}

/** ExtrudeGeometry is non-indexed; the rest are indexed. Merge needs one or the other. */
function prepare(geo: THREE.BufferGeometry, color: THREE.Color): THREE.BufferGeometry {
  const ready = geo.index ? geo.toNonIndexed() : geo;
  if (ready !== geo) geo.dispose();
  const keep = new Set(["position", "normal", "uv"]);
  for (const name of Object.keys(ready.attributes)) {
    if (!keep.has(name)) ready.deleteAttribute(name);
  }
  ready.clearGroups();
  if (!ready.getAttribute("normal")) ready.computeVertexNormals();
  if (!ready.getAttribute("uv")) {
    const n = ready.getAttribute("position").count;
    ready.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  }
  return paint(ready, color);
}

/** Leaf-bladed spear along +Y so combat can aim it with setFromUnitVectors(Y, velocity). */
export function createArrowGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  const shaft = new THREE.CylinderGeometry(0.015, 0.018, 0.82, 10);
  shaft.translate(0, -0.14, 0);
  parts.push(prepare(shaft, WOOD));

  const butt = new THREE.SphereGeometry(0.017, 8, 6);
  butt.translate(0, -0.55, 0);
  parts.push(prepare(butt, WOOD_CORE));

  for (let i = 0; i < 9; i++) {
    const ring = new THREE.TorusGeometry(0.021, 0.0075, 6, 10);
    ring.rotateX(Math.PI / 2);
    ring.rotateY(i * 0.62);
    ring.scale(1, 1, 1.15);
    ring.translate(0, 0.2 + i * 0.015, 0);
    parts.push(prepare(ring, i % 2 === 0 ? WRAP_A : WRAP_B));
  }

  const collar = new THREE.CylinderGeometry(0.026, 0.02, 0.028, 10);
  collar.translate(0, 0.345, 0);
  parts.push(prepare(collar, COLLAR));

  const leaf = new THREE.Shape();
  leaf.moveTo(0, 0.4);
  leaf.bezierCurveTo(0.04, 0.36, 0.078, 0.26, 0.082, 0.16);
  leaf.bezierCurveTo(0.08, 0.1, 0.055, 0.04, 0.02, 0);
  leaf.lineTo(-0.02, 0);
  leaf.bezierCurveTo(-0.055, 0.04, -0.08, 0.1, -0.082, 0.16);
  leaf.bezierCurveTo(-0.078, 0.26, -0.04, 0.36, 0, 0.4);

  const head = new THREE.ExtrudeGeometry(leaf, {
    depth: 0.014,
    bevelEnabled: true,
    bevelThickness: 0.007,
    bevelSize: 0.008,
    bevelSegments: 2,
    curveSegments: 10,
  });
  head.translate(0, 0.358, -0.007);
  parts.push(prepare(head, STEEL));

  const midrib = new THREE.BoxGeometry(0.01, 0.34, 0.024);
  midrib.translate(0, 0.54, 0);
  parts.push(prepare(midrib, STEEL_EDGE));

  const ribXs = [-0.022, 0.022, -0.04, 0.04, -0.055, 0.055];
  const ribLens = [0.26, 0.26, 0.2, 0.2, 0.14, 0.14];
  for (let i = 0; i < ribXs.length; i++) {
    const rib = new THREE.BoxGeometry(0.0045, ribLens[i], 0.02);
    rib.translate(ribXs[i], 0.52, 0);
    parts.push(prepare(rib, STEEL_RIB));
  }

  const tip = new THREE.ConeGeometry(0.018, 0.07, 8);
  tip.translate(0, 0.78, 0);
  parts.push(prepare(tip, STEEL_EDGE));

  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!merged) {
    return new THREE.CylinderGeometry(0.02, 0.02, 0.8, 8);
  }
  merged.computeVertexNormals();
  return merged;
}

export function isSpearBolt(skill: string): boolean {
  return skill === "arrow" || skill === "shadowArrow";
}
