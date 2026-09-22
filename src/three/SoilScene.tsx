import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { SoilLayerId } from '@/models';
import { useTheme } from '@/theme/ThemeProvider';
import { CanvasShell } from './CanvasShell';
import { rng } from './geometry';
import { SceneFallback } from './SceneFallback';
import { Atmosphere, CameraRig, usePalette } from './world/parts';
import { WheatPlant } from './world/WheatPlant';

const W = 5.2;
const D = 2.4;

export const LAYERS: { id: SoilLayerId; name: string; top: number; bottom: number }[] = [
  { id: 'surface', name: 'Surface', top: 0, bottom: -0.16 },
  { id: 'topsoil', name: 'Topsoil', top: -0.16, bottom: -1.05 },
  { id: 'nutrient', name: 'Nutrient layer', top: -1.05, bottom: -1.7 },
  { id: 'subsoil', name: 'Subsoil', top: -1.7, bottom: -2.6 },
];
const PLANT_X = [-1.9, -0.95, 0, 0.95, 1.9];
/** Roots and nutrients are drawn on the cut face (front) of the slab, like a real soil profile. */
const FACE_Z = D / 2 + 0.018;

function Layer({ index, color, selected, dimmed }: { index: number; color: string; selected: boolean; dimmed: boolean }) {
  const l = LAYERS[index];
  const h = l.top - l.bottom;
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  const p = usePalette();
  const accent = useMemo(() => new THREE.Color(p.node), [p.node]);
  useFrame(({ clock }, dt) => {
    const m = mat.current;
    if (!m) return;
    const k = Math.min(1, dt * 4);
    m.opacity += ((dimmed ? 0.28 : 1) - m.opacity) * k;
    m.emissive.copy(accent);
    m.emissiveIntensity += ((selected ? 0.22 + Math.sin(clock.elapsedTime * 2.4) * 0.06 : 0) - m.emissiveIntensity) * k;
  });
  return (
    <mesh position={[0, l.bottom + h / 2, 0]}>
      <boxGeometry args={[W, h, D]} />
      <meshStandardMaterial ref={mat} color={color} roughness={1} transparent depthWrite={!dimmed} />
    </mesh>
  );
}

function Roots({ selected, dimmed }: { selected: boolean; dimmed: boolean }) {
  const p = usePalette();
  const geo = useMemo(() => {
    const r = rng(21);
    const tubes: THREE.BufferGeometry[] = [];
    for (const x of PLANT_X) {
      for (let k = 0; k < 5; k++) {
        const dir = (k - 2) * 0.16 + (r() - 0.5) * 0.1;
        const depth = 0.7 + r() * 0.55;
        const pts = [
          new THREE.Vector3(x, 0, FACE_Z),
          new THREE.Vector3(x + dir * 0.6, -depth * 0.35, FACE_Z),
          new THREE.Vector3(x + dir * 1.3, -depth * 0.7, FACE_Z),
          new THREE.Vector3(x + dir * 1.7 + (r() - 0.5) * 0.2, -depth, FACE_Z),
        ];
        tubes.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.012 + r() * 0.01, 5, false));
      }
    }
    return tubes;
  }, []);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.8, transparent: true }), []);
  useEffect(() => () => {
    geo.forEach((g) => g.dispose());
    mat.dispose();
  }, [geo, mat]);
  useFrame(({ clock }, dt) => {
    const k = Math.min(1, dt * 4);
    mat.color.set(p.ear);
    mat.emissive.set(p.node);
    mat.emissiveIntensity += ((selected ? 0.55 + Math.sin(clock.elapsedTime * 2.4) * 0.15 : 0.05) - mat.emissiveIntensity) * k;
    mat.opacity += ((dimmed ? 0.3 : 1) - mat.opacity) * k;
  });
  return (
    <group>
      {geo.map((g, i) => (
        <mesh key={i} geometry={g} material={mat} />
      ))}
    </group>
  );
}

function Nutrients({ selected, dimmed }: { selected: boolean; dimmed: boolean }) {
  const p = usePalette();
  const count = 70;
  const ref = useRef<THREE.InstancedMesh>(null);
  const seeds = useMemo(() => {
    const r = rng(8);
    return Array.from({ length: count }, () => ({ x: (r() - 0.5) * (W - 0.3), y: -1.12 - r() * 0.5, z: FACE_Z + r() * 0.03, ph: r() * 6.28, s: 0.03 + r() * 0.03 }));
  }, []);
  const m = useMemo(() => new THREE.Matrix4(), []);
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    const scaleBoost = selected ? 1.6 : 1;
    seeds.forEach((s, i) => {
      const y = s.y + Math.sin(t * 0.8 + s.ph) * 0.04 + (selected ? Math.sin(t * 1.5 + s.ph) * 0.05 : 0);
      m.makeScale(s.s * scaleBoost, s.s * scaleBoost, s.s * scaleBoost).setPosition(s.x + Math.cos(t * 0.5 + s.ph) * 0.03, y, s.z);
      ref.current?.setMatrixAt(i, m);
    });
    if (ref.current) ref.current.instanceMatrix.needsUpdate = true;
    if (mat.current) {
      const k = Math.min(1, dt * 4);
      mat.current.opacity += ((dimmed ? 0.25 : 1) - mat.current.opacity) * k;
      mat.current.emissiveIntensity += ((selected ? 0.8 : 0.2) - mat.current.emissiveIntensity) * k;
    }
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]}>
      <icosahedronGeometry args={[1, 1]} />
      <meshStandardMaterial ref={mat} color={p.ear} emissive={p.node} emissiveIntensity={0.2} roughness={0.5} transparent />
    </instancedMesh>
  );
}

function SoilWorld({ selected, growth, health, labels }: { selected: SoilLayerId | null; growth: number; health: number; labels: Partial<Record<SoilLayerId, string>> }) {
  const p = usePalette();
  const { theme } = useTheme();
  const group = useRef<THREE.Group>(null);
  useFrame(({ pointer }, dt) => {
    const g = group.current;
    if (!g) return;
    const k = Math.min(1, dt * 2);
    g.rotation.y += (-0.42 + pointer.x * 0.35 - g.rotation.y) * k;
    g.rotation.x += (pointer.y * -0.06 - g.rotation.x) * k;
  });
  const colors = [p.soil[0], p.soil[1], p.soil[2], p.soil[3]];
  const surfaceSel = selected === 'surface';

  return (
    <>
      <Atmosphere p={p} fogNear={20} fogFar={40} sunPos={theme === 'dark' ? [4, 5, 6] : [5, 8, 6]} />
      <CameraRig position={[0.4, 1.4, 8.4]} lookAt={[0, -0.75, 0]} strength={[0.3, 0.2]} ease={0.05} />
      <group ref={group} position={[-0.45, 0.3, 0]}>
        {LAYERS.map((l, i) => (
          <Layer key={l.id} index={i} color={colors[i]} selected={selected === l.id} dimmed={selected !== null && selected !== l.id && !(selected === 'roots' && l.id === 'topsoil')} />
        ))}
        <Roots selected={selected === 'roots'} dimmed={selected !== null && selected !== 'roots' && selected !== 'topsoil'} />
        <Nutrients selected={selected === 'nutrient'} dimmed={selected !== null && selected !== 'nutrient'} />
        {/* residue specks on the surface */}
        <mesh position={[0, 0.005, 0]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[W, D]} />
          <meshStandardMaterial color={surfaceSel ? p.node : p.groundEdge} roughness={1} transparent opacity={surfaceSel ? 0.5 : 0.6} />
        </mesh>
        {PLANT_X.map((x, i) => (
          <WheatPlant key={i} p={p} position={[x, 0, D / 2 - 0.12 - (i % 2) * 0.35]} scale={0.55} tillers={2} growth={growth} health={health} seed={30 + i} />
        ))}
        {LAYERS.map((l) => (
          <Html key={l.id} position={[W / 2 + 0.15, (l.top + l.bottom) / 2, D / 2]} zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
            <div
              className={`whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-semibold backdrop-blur transition-colors duration-300 ${
                selected === l.id || (selected === 'roots' && l.id === 'topsoil') ? 'border-accent/40 bg-accent-soft text-accent' : 'border-line bg-surface/90 text-ink-3'
              }`}
            >
              {l.id === 'topsoil' && selected === 'roots' ? 'Root zone' : l.name}
              {labels[l.id] ? <span className="ml-1.5 font-normal">{labels[l.id]}</span> : null}
            </div>
          </Html>
        ))}
      </group>
    </>
  );
}

export default function SoilScene({
  selected,
  growth = 0.5,
  health = 0.8,
  labels = {},
  className,
}: {
  selected: SoilLayerId | null;
  growth?: number;
  health?: number;
  labels?: Partial<Record<SoilLayerId, string>>;
  className?: string;
}) {
  return (
    <CanvasShell
      className={className}
      camera={{ fov: 34, position: [0.4, 1.4, 8.4], near: 0.1, far: 60 }}
      fallback={<SceneFallback compact />}
      label="Illustrative soil cross-section: surface, topsoil with roots, nutrient layer and subsoil."
    >
      <SoilWorld selected={selected} growth={growth} health={health} labels={labels} />
    </CanvasShell>
  );
}
