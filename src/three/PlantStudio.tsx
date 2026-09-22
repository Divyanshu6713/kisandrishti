import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useTheme } from '@/theme/ThemeProvider';
import { CanvasShell } from './CanvasShell';
import { rng } from './geometry';
import { SceneFallback } from './SceneFallback';
import { ScanRing } from './world/life';
import { Atmosphere, BlobShadow, CameraRig, usePalette } from './world/parts';
import { WheatPlant } from './world/WheatPlant';

/** Organic matter settling into the soil — replays whenever `pulse` changes. */
function OrganicBits({ pulse }: { pulse: number }) {
  const p = usePalette();
  const count = 36;
  const ref = useRef<THREE.InstancedMesh>(null);
  const start = useRef(-10);
  const lastPulse = useRef(pulse);
  const seeds = useMemo(() => {
    const r = rng(12);
    return Array.from({ length: count }, () => ({ x: (r() - 0.5) * 2.2, z: (r() - 0.5) * 2.2, d: r() * 0.8, s: 0.035 + r() * 0.03, rot: r() * 6 }));
  }, []);
  const m = useMemo(() => new THREE.Matrix4(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const e = useMemo(() => new THREE.Euler(), []);
  const v = useMemo(() => new THREE.Vector3(), []);
  const sc = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (pulse !== lastPulse.current) {
      lastPulse.current = pulse;
      start.current = t;
    }
    const age = t - start.current;
    seeds.forEach((s, i) => {
      const k = Math.min(1, Math.max(0, (age - s.d) / 1.4));
      const y = 2.6 * (1 - k * k) + 0.02;
      const visible = age > s.d && age < s.d + 4.5;
      const fade = visible ? (age > s.d + 3.5 ? 1 - (age - s.d - 3.5) : 1) : 0;
      e.set(s.rot + age, s.rot, 0);
      q.setFromEuler(e);
      v.set(s.x * (0.4 + k * 0.6), y, s.z * (0.4 + k * 0.6));
      sc.setScalar(s.s * fade);
      m.compose(v, q, sc);
      ref.current?.setMatrixAt(i, m);
    });
    if (ref.current) ref.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]}>
      <dodecahedronGeometry args={[1, 0]} />
      <meshStandardMaterial color={p.soil[0]} roughness={0.9} flatShading />
    </instancedMesh>
  );
}

function StudioWorld({ health, growth, warn, pulse }: { health: number; growth: number; warn: boolean; pulse?: number }) {
  const p = usePalette();
  const { theme } = useTheme();
  return (
    <>
      <Atmosphere p={p} fogNear={14} fogFar={30} sunPos={theme === 'dark' ? [3, 4, 4] : [4, 7, 5]} />
      <CameraRig position={[0, 1.35, 4.5]} lookAt={[0, 0.85, 0]} strength={[0.7, 0.3]} ease={0.05} />
      <mesh position-y={-0.12}>
        <cylinderGeometry args={[1.15, 1.02, 0.2, 48]} />
        <meshStandardMaterial color={p.soil[1]} roughness={1} />
      </mesh>
      <mesh position-y={0.001} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[1.15, 48]} />
        <meshStandardMaterial color={p.soil[0]} roughness={1} />
      </mesh>
      <BlobShadow position={[0, -0.24, 0]} size={4} opacity={0.25} />
      {warn && <ScanRing p={p} radius={1.28} color={p.warn} />}
      <WheatPlant p={p} health={health} growth={growth} tillers={5} scale={1.35} followPointer seed={17} />
      {pulse !== undefined && <OrganicBits pulse={pulse} />}
    </>
  );
}

export default function PlantStudio({
  health,
  growth,
  warn = false,
  pulse,
  className,
  label,
}: {
  health: number;
  growth: number;
  warn?: boolean;
  pulse?: number;
  className?: string;
  label: string;
}) {
  return (
    <CanvasShell className={className} camera={{ fov: 34, position: [0, 1.35, 4.5], near: 0.1, far: 50 }} fallback={<SceneFallback compact />} label={label}>
      <StudioWorld health={health} growth={growth} warn={warn} pulse={pulse} />
    </CanvasShell>
  );
}
