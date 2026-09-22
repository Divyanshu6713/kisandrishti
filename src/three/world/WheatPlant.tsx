import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { ScenePalette } from '@/theme/scenePalette';
import { makeEarGeometry, makeLeafGeometry, rng } from '../geometry';

interface LeafSpec {
  geo: THREE.BufferGeometry;
  y: number;
  yaw: number;
  tilt: number;
  phase: number;
}
interface TillerSpec {
  yaw: number;
  lean: number;
  height: number;
  leaves: LeafSpec[];
  ear: boolean;
}

/**
 * A stylised wheat clump. `health` (0–1) shifts colour and leaf posture (a stressed plant
 * droops slightly and pales — no exaggerated effects). `growth` (0–1 of season) controls
 * height, leaf count and whether ears are visible. With `followPointer`, the plant turns
 * gently toward the cursor and leaves respond to hover.
 */
export function WheatPlant({
  p,
  health = 1,
  growth = 0.75,
  tillers = 3,
  followPointer = false,
  position = [0, 0, 0],
  scale = 1,
  seed = 11,
  onHover,
}: {
  p: ScenePalette;
  health?: number;
  growth?: number;
  tillers?: number;
  followPointer?: boolean;
  position?: [number, number, number];
  scale?: number;
  seed?: number;
  onHover?: (h: boolean) => void;
}) {
  const root = useRef<THREE.Group>(null);
  const leafRefs = useRef<(THREE.Mesh | null)[]>([]);
  const [hovered, setHovered] = useState(false);
  const droop = (1 - health) * 0.45;

  const spec = useMemo<TillerSpec[]>(() => {
    const r = rng(seed);
    const g = Math.max(0.15, growth);
    return Array.from({ length: tillers }, (_, i) => {
      const height = (0.55 + g * 1.05) * (i === 0 ? 1 : 0.86 + r() * 0.1);
      const leafCount = 3 + Math.round(g * 2);
      return {
        yaw: (i / tillers) * Math.PI * 2 + r() * 0.5,
        lean: i === 0 ? 0.02 : 0.1 + r() * 0.08,
        height,
        ear: g >= 0.55,
        leaves: Array.from({ length: leafCount }, (_, k) => ({
          geo: makeLeafGeometry({ length: (0.62 + r() * 0.38) * (1 - k * 0.07) * (0.7 + g * 0.5), width: 0.045 + r() * 0.015, curl: 1.05 + r() * 0.35 + droop, segments: 16 }),
          y: (k / leafCount) * height * 0.78 + 0.04,
          yaw: k * 2.4 + r() * 0.5,
          tilt: 0.25 + r() * 0.2,
          phase: r() * Math.PI * 2,
        })),
      };
    });
  }, [seed, tillers, growth, droop]);

  useEffect(() => () => spec.forEach((t) => t.leaves.forEach((l) => l.geo.dispose())), [spec]);

  const ear = useMemo(() => makeEarGeometry(0.34, 16), []);
  const leafMat = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.62 }), []);
  const stemMat = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.7 }), []);
  const earMat = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.55 }), []);
  const target = useMemo(() => new THREE.Color(), []);
  const tmp = useMemo(() => new THREE.Color(), []);

  useFrame(({ clock, pointer }, dt) => {
    const t = clock.elapsedTime;
    const k = Math.min(1, dt * 3);
    // colour follows health (and theme) smoothly
    target.set(p.cropStressed).lerp(tmp.set(p.cropHealthy), health);
    leafMat.color.lerp(target, k);
    stemMat.color.lerp(target, k);
    earMat.color.lerp(tmp.set(p.ear).lerp(target, growth < 0.7 ? 0.55 : 0.1), k);
    leafMat.emissive.set(p.cropHealthy);
    leafMat.emissiveIntensity += ((hovered ? 0.12 : 0) - leafMat.emissiveIntensity) * k;

    const g = root.current;
    if (g) {
      if (followPointer) {
        g.rotation.y += (pointer.x * 0.55 - g.rotation.y) * Math.min(1, dt * 2.2);
        g.rotation.x += (-pointer.y * 0.07 - g.rotation.x) * Math.min(1, dt * 2.2);
        g.rotation.z += (-pointer.x * 0.05 - g.rotation.z) * Math.min(1, dt * 2.2);
      } else {
        g.rotation.y = Math.sin(t * 0.25) * 0.15;
      }
    }
    // leaves breathe; on hover they lift slightly
    let i = 0;
    for (const tiller of spec) {
      for (const leaf of tiller.leaves) {
        const m = leafRefs.current[i++];
        if (!m) continue;
        const lift = hovered ? -0.12 : 0;
        m.rotation.x = leaf.tilt + lift + Math.sin(t * 1.2 + leaf.phase) * 0.035 + droop * 0.3;
      }
    }
  });

  let leafIndex = 0;
  return (
    <group
      ref={root}
      position={position}
      scale={scale}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
        onHover?.(true);
      }}
      onPointerOut={() => {
        setHovered(false);
        onHover?.(false);
      }}
    >
      {spec.map((tiller, ti) => (
        <group key={ti} rotation={[tiller.lean * Math.cos(tiller.yaw), tiller.yaw, tiller.lean * Math.sin(tiller.yaw)]}>
          <mesh position-y={tiller.height / 2} material={stemMat}>
            <cylinderGeometry args={[0.016, 0.03, tiller.height, 6]} />
          </mesh>
          {tiller.leaves.map((leaf) => {
            const idx = leafIndex++;
            return (
              <group key={idx} position-y={leaf.y} rotation-y={leaf.yaw}>
                <mesh ref={(el) => {
            leafRefs.current[idx] = el;
          }} geometry={leaf.geo} material={leafMat} />
              </group>
            );
          })}
          {tiller.ear && <mesh geometry={ear} material={earMat} position-y={tiller.height - 0.02} />}
        </group>
      ))}
    </group>
  );
}
