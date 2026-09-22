import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Deterministic PRNG so scenes look identical on every load. */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A grass/cereal leaf blade: a tapered strip that arcs outward along its length,
 * with a slight V-fold at the midrib. Vertex colours darken toward the base.
 */
export function makeLeafGeometry({ length = 1, width = 0.08, curl = 0.9, segments = 14, baseShade = 0.72 } = {}) {
  const cols = 3;
  const positions: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const ds = length / segments;
  let cy = 0;
  let cz = 0;

  for (let j = 0; j <= segments; j++) {
    const t = j / segments;
    const theta = curl * Math.pow(t, 1.6) * (Math.PI / 2);
    if (j > 0) {
      cy += ds * Math.cos(theta);
      cz += ds * Math.sin(theta);
    }
    // width profile: narrow base, widest ~25%, sharp tip
    const w = width * (t < 0.2 ? 0.55 + t * 2.25 : Math.pow(1 - (t - 0.2) / 0.8, 0.85));
    for (let k = 0; k < cols; k++) {
      const x = (k - 1) * w;
      const fold = k === 1 ? 0 : w * 0.28;
      positions.push(x, cy + fold * Math.sin(theta) * 0.2, cz - fold * Math.cos(theta));
      const shade = baseShade + (1 - baseShade) * Math.min(1, t * 1.4);
      colors.push(shade, shade, shade);
      uvs.push(k / (cols - 1), t);
    }
  }
  for (let j = 0; j < segments; j++) {
    for (let k = 0; k < cols - 1; k++) {
      const a = j * cols + k;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/** A clump of blades merged into one geometry — instanced across the field. */
export function makeTuftGeometry(seed = 7, blades = 6, height = 0.75) {
  const r = rng(seed);
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < blades; i++) {
    const g = makeLeafGeometry({ length: height * (0.65 + r() * 0.45), width: 0.028 + r() * 0.014, curl: 0.25 + r() * 0.55, segments: 6 });
    g.rotateX(-0.05 - r() * 0.12);
    g.rotateY((i / blades) * Math.PI * 2 + r() * 0.6);
    parts.push(g);
  }
  const merged = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  return merged;
}

/** Wheat ear (spike): alternating grains with short awns. */
export function makeEarGeometry(length = 0.32, grains = 14) {
  const parts: THREE.BufferGeometry[] = [];
  const grain = new THREE.SphereGeometry(1, 6, 5);
  for (let i = 0; i < grains; i++) {
    const t = i / (grains - 1);
    const g = grain.clone();
    g.scale(0.022, 0.042, 0.02);
    const side = i % 2 === 0 ? 1 : -1;
    g.rotateZ(side * 0.35);
    g.translate(side * 0.014, t * length, 0);
    parts.push(g);
    const awn = new THREE.CylinderGeometry(0.0015, 0.0015, 0.11, 3);
    awn.rotateZ(side * 0.25);
    awn.translate(side * 0.03, t * length + 0.06, 0);
    parts.push(awn);
  }
  const merged = mergeGeometries(parts.map((p) => p.toNonIndexed()));
  parts.forEach((p) => p.dispose());
  grain.dispose();
  return merged;
}

/** Soft radial gradient texture — used for glows, blob shadows and round particles. */
export function radialTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)', size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
