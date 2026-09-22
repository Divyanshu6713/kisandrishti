import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { ScenePalette } from '@/theme/scenePalette';
import { radialTexture, rng } from '../geometry';

/**
 * Pollen (light) / fireflies (dark). Particles drift slowly and move away from the
 * cursor ray — a quiet sign that the scene is alive.
 */
export function Pollen({ p, count = 160, box = [12, 3.6, 7], center = [0, 1.9, -0.5], dark = false }: { p: ScenePalette; count?: number; box?: [number, number, number]; center?: [number, number, number]; dark?: boolean }) {
  const pts = useRef<THREE.Points>(null);
  const tex = useMemo(() => radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)', 64), []);
  const boxKey = box.join(',');
  const centerKey = center.join(',');
  const { base, pos, vel } = useMemo(() => {
    const r = rng(9);
    const base = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      base[i * 3] = center[0] + (r() - 0.5) * box[0];
      base[i * 3 + 1] = center[1] + (r() - 0.5) * box[1];
      base[i * 3 + 2] = center[2] + (r() - 0.5) * box[2];
    }
    return { base, pos: base.slice(), vel: new Float32Array(count * 3) };
  }, [count, boxKey, centerKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return g;
  }, [pos]);
  useEffect(() => () => geo.dispose(), [geo]);

  const ray = useMemo(() => new THREE.Raycaster(), []);
  const v = useMemo(() => new THREE.Vector3(), []);
  const closest = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ clock, camera, pointer }, dt) => {
    const t = clock.elapsedTime;
    ray.setFromCamera(pointer, camera);
    const step = Math.min(dt, 0.05);
    for (let i = 0; i < count; i++) {
      const ix = i * 3;
      // idle drift around home position
      const hx = base[ix] + Math.sin(t * 0.3 + i) * 0.25;
      const hy = base[ix + 1] + Math.sin(t * 0.45 + i * 1.3) * 0.18;
      const hz = base[ix + 2] + Math.cos(t * 0.28 + i * 0.7) * 0.25;
      v.set(pos[ix], pos[ix + 1], pos[ix + 2]);
      ray.ray.closestPointToPoint(v, closest);
      const d = v.distanceTo(closest);
      if (d < 0.9) {
        const f = (0.9 - d) * 6;
        vel[ix] += ((v.x - closest.x) / (d + 1e-3)) * f * step;
        vel[ix + 1] += ((v.y - closest.y) / (d + 1e-3)) * f * step;
        vel[ix + 2] += ((v.z - closest.z) / (d + 1e-3)) * f * step;
      }
      // spring home + damping
      vel[ix] += (hx - pos[ix]) * 1.2 * step;
      vel[ix + 1] += (hy - pos[ix + 1]) * 1.2 * step;
      vel[ix + 2] += (hz - pos[ix + 2]) * 1.2 * step;
      vel[ix] *= 0.94;
      vel[ix + 1] *= 0.94;
      vel[ix + 2] *= 0.94;
      pos[ix] += vel[ix] * step * 4;
      pos[ix + 1] += vel[ix + 1] * step * 4;
      pos[ix + 2] += vel[ix + 2] * step * 4;
    }
    geo.attributes.position.needsUpdate = true;
    if (pts.current && dark) (pts.current.material as THREE.PointsMaterial).opacity = 0.75 + Math.sin(t * 2) * 0.15;
  });

  return (
    <points ref={pts} geometry={geo}>
      <pointsMaterial
        map={tex}
        color={p.particle}
        size={dark ? 0.12 : 0.07}
        sizeAttenuation
        transparent
        opacity={dark ? 0.85 : 0.75}
        depthWrite={false}
        blending={dark ? THREE.AdditiveBlending : THREE.NormalBlending}
      />
    </points>
  );
}

function wingGeometry() {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(0.05, 0.12, 0.2, 0.16, 0.22, 0.05);
  s.bezierCurveTo(0.24, -0.04, 0.12, -0.12, 0, 0);
  return new THREE.ShapeGeometry(s, 8);
}

/** Two small butterflies drifting around the hero plant. */
export function Butterflies({ p, center = [0, 1.2, 0], count = 2 }: { p: ScenePalette; center?: [number, number, number]; count?: number }) {
  const geo = useMemo(wingGeometry, []);
  const refs = useRef<(THREE.Group | null)[]>([]);
  const wings = useRef<(THREE.Mesh | null)[]>([]);
  const colors = [p.sun, p.cloud, p.ear];
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    for (let i = 0; i < count; i++) {
      const g = refs.current[i];
      if (!g) continue;
      const s = 0.35 + i * 0.12;
      const a = t * s + i * 2.4;
      const x = center[0] + Math.sin(a) * (1.7 + i * 0.6);
      const z = center[2] + Math.sin(a * 2) * 0.9;
      const y = center[1] + 0.5 + Math.sin(t * 1.3 + i) * 0.35 + i * 0.3;
      const dx = Math.cos(a) * (1.7 + i * 0.6);
      const dz = Math.cos(a * 2) * 1.8;
      g.position.set(x, y, z);
      g.rotation.y = Math.atan2(dx, dz);
      const flap = Math.sin(t * 14 + i) * 0.9;
      const l = wings.current[i * 2];
      const r = wings.current[i * 2 + 1];
      if (l) l.rotation.z = 0.2 + flap * 0.6;
      if (r) r.rotation.z = -0.2 - flap * 0.6;
    }
  });
  return (
    <group>
      {Array.from({ length: count }, (_, i) => (
        <group key={i} ref={(el) => {
            refs.current[i] = el;
          }} scale={0.8}>
          <mesh ref={(el) => {
            wings.current[i * 2] = el;
          }} geometry={geo} rotation-x={-Math.PI / 2}>
            <meshStandardMaterial color={colors[i % colors.length]} side={THREE.DoubleSide} roughness={0.6} />
          </mesh>
          <mesh ref={(el) => {
            wings.current[i * 2 + 1] = el;
          }} geometry={geo} rotation={[-Math.PI / 2, 0, Math.PI]} scale={[1, -1, 1]}>
            <meshStandardMaterial color={colors[i % colors.length]} side={THREE.DoubleSide} roughness={0.6} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/**
 * The "intelligence layer": a few data nodes orbiting the plant, softly linked to it.
 * Deliberately abstract — no numbers, so nothing here pretends to be live data.
 */
export function DataNodes({ p, center = [0, 1.2, 0], count = 3, radius = 1.25, active = false }: { p: ScenePalette; center?: [number, number, number]; count?: number; radius?: number; active?: boolean }) {
  const nodes = useRef<(THREE.Mesh | null)[]>([]);
  const glowTex = useMemo(() => radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)', 64), []);
  const halos = useRef<(THREE.Sprite | null)[]>([]);
  const lineGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 6), 3));
    return g;
  }, [count]);
  const line = useMemo(() => new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: p.line, transparent: true, opacity: 0.28 })), [lineGeo]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    (line.material as THREE.LineBasicMaterial).color.set(p.line);
  }, [p.line, line]);
  useEffect(() => () => lineGeo.dispose(), [lineGeo]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const arr = lineGeo.attributes.position.array as Float32Array;
    for (let i = 0; i < count; i++) {
      const a = t * 0.18 + (i / count) * Math.PI * 2;
      const x = center[0] + Math.cos(a) * radius;
      const z = center[2] + Math.sin(a) * radius * 0.7;
      const y = center[1] + 0.35 + Math.sin(t * 0.7 + i * 2) * 0.18 + i * 0.22;
      nodes.current[i]?.position.set(x, y, z);
      const h = halos.current[i];
      if (h) {
        h.position.set(x, y, z);
        const s = (active ? 0.55 : 0.4) + Math.sin(t * 1.5 + i) * 0.05;
        h.scale.set(s, s, 1);
      }
      arr.set([x, y, z, center[0], center[1] + 0.2 + i * 0.25, center[2]], i * 6);
    }
    lineGeo.attributes.position.needsUpdate = true;
    (line.material as THREE.LineBasicMaterial).opacity += ((active ? 0.5 : 0.25) - (line.material as THREE.LineBasicMaterial).opacity) * 0.08;
  });

  return (
    <group>
      <primitive object={line} />
      {Array.from({ length: count }, (_, i) => (
        <group key={i}>
          <mesh ref={(el) => {
            nodes.current[i] = el;
          }}>
            <sphereGeometry args={[0.045, 16, 12]} />
            <meshBasicMaterial color={p.node} />
          </mesh>
          <sprite ref={(el) => {
            halos.current[i] = el;
          }}>
            <spriteMaterial map={glowTex} color={p.node} transparent opacity={0.35} depthWrite={false} />
          </sprite>
        </group>
      ))}
    </group>
  );
}

/** Slowly rotating scan ring on the ground under the plant. */
export function ScanRing({ p, position = [0, 0.02, 0], radius = 1.1, color }: { p: ScenePalette; position?: [number, number, number]; radius?: number; color?: string }) {
  const ref = useRef<THREE.Mesh>(null);
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (ref.current) ref.current.rotation.z = t * 0.15;
    if (mat.current) mat.current.opacity = 0.28 + Math.sin(t * 1.2) * 0.1;
  });
  return (
    <mesh ref={ref} position={position} rotation-x={-Math.PI / 2}>
      <ringGeometry args={[radius, radius + 0.025, 96, 1, 0, Math.PI * 1.6]} />
      <meshBasicMaterial ref={mat} color={color ?? p.node} transparent opacity={0.3} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
}
