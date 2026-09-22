import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef, type ReactNode } from 'react';
import * as THREE from 'three';
import type { ScenePalette } from '@/theme/scenePalette';
import { useTheme } from '@/theme/ThemeProvider';
import { rng } from '../geometry';
import { Butterflies, Pollen } from './life';
import { Atmosphere, CameraRig, Channel, Clouds, CropField, Farmhouse, Ground, PointerGround, Sun, Tree, usePalette } from './parts';

/**
 * The journey world: one small farm that tells the Kisan Drishti story in six stages.
 *   0 understand · 1 analyze · 2 predict · 3 recommend · 4 act · 5 improve
 * Also used in compact form on the dashboard (stage chosen from the farm's real status).
 */

export const PATCH = { x: 2.3, z: -2.6, r: 1.35 };
const inPatch = (x: number, z: number) => (x - PATCH.x) ** 2 + (z - PATCH.z) ** 2 < PATCH.r ** 2;
const outsidePatch = (x: number, z: number) => !inPatch(x, z);

const POSES: { pos: [number, number, number]; look: [number, number, number] }[] = [
  { pos: [0, 6.2, 12.5], look: [0, 0.5, -1.8] },
  { pos: [-2.4, 5.2, 9.6], look: [0, 1.4, -1.6] },
  { pos: [4.6, 7.2, 8.2], look: [2.2, 0.2, -2.5] },
  { pos: [3.6, 6.8, 8], look: [2.2, 0.3, -2.5] },
  { pos: [1.6, 6.2, 8.6], look: [1.4, 0.2, -1.8] },
  { pos: [0, 5.4, 11.5], look: [0, 0.6, -1.6] },
];

function Fade({ show, children, speed = 3 }: { show: boolean; children: ReactNode; speed?: number }) {
  const g = useRef<THREE.Group>(null);
  const v = useRef(show ? 1 : 0);
  useFrame((_, dt) => {
    v.current += ((show ? 1 : 0) - v.current) * Math.min(1, dt * speed);
    const grp = g.current;
    if (!grp) return;
    grp.visible = v.current > 0.02;
    grp.scale.setScalar(0.85 + v.current * 0.15);
    grp.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material & { opacity?: number; userData: { baseOpacity?: number } };
      if (!m || Array.isArray(m)) return;
      if (m.userData.baseOpacity === undefined) m.userData.baseOpacity = m.opacity ?? 1;
      m.transparent = true;
      m.opacity = (m.userData.baseOpacity ?? 1) * v.current;
    });
  });
  return <group ref={g}>{children}</group>;
}

function Tag({ children, tone = 'accent' }: { children: ReactNode; tone?: 'accent' | 'warn' | 'danger' | 'info' }) {
  const cls = {
    accent: 'border-accent/30 text-accent',
    warn: 'border-warn/40 text-warn',
    danger: 'border-danger/40 text-danger',
    info: 'border-info/30 text-info',
  }[tone];
  return <div className={`pointer-events-none whitespace-nowrap rounded-full border bg-surface/95 px-3 py-1 text-[11px] font-semibold shadow-soft backdrop-blur ${cls}`}>{children}</div>;
}

function DataLayers({ p, show }: { p: ScenePalette; show: boolean }) {
  const scan = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (scan.current) scan.current.position.x = Math.sin(clock.elapsedTime * 0.6) * 5.2;
  });
  const layers: [number, string, string][] = [
    [1.3, 'Soil', p.soil[0]],
    [2.0, 'Crop', p.crop],
    [2.7, 'Weather', p.water],
  ];
  return (
    <Fade show={show}>
      {layers.map(([y, label, color]) => (
        <group key={label} position={[0, y, -1.6]}>
          <mesh rotation-x={-Math.PI / 2}>
            <planeGeometry args={[11.5, 6.5]} />
            <meshBasicMaterial color={color} transparent opacity={0.1} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
          <gridHelper args={[11.5, 16, color, color]} scale={[1, 1, 6.5 / 11.5]}>
            <lineBasicMaterial attach="material" color={color} transparent opacity={0.35} />
          </gridHelper>
          {show && (
            <Html position={[-6.1, 0, 3.2]} center zIndexRange={[10, 0]}>
              <Tag tone="info">{label}</Tag>
            </Html>
          )}
        </group>
      ))}
      <mesh ref={scan} position={[0, 2, -1.6]}>
        <boxGeometry args={[0.05, 1.6, 6.5]} />
        <meshBasicMaterial color={p.node} transparent opacity={0.4} depthWrite={false} />
      </mesh>
    </Fade>
  );
}

function PatchMarker({ p, show, tone, label }: { p: ScenePalette; show: boolean; tone: 'warn' | 'accent'; label: string }) {
  const ring = useRef<THREE.Mesh>(null);
  const pin = useRef<THREE.Group>(null);
  const color = tone === 'warn' ? p.warn : p.node;
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (ring.current) {
      const s = 1 + ((t * 0.5) % 1) * 0.35;
      ring.current.scale.set(s, s, 1);
      (ring.current.material as THREE.MeshBasicMaterial).opacity = (1 - ((t * 0.5) % 1)) * 0.7;
    }
    if (pin.current) pin.current.position.y = 1.55 + Math.sin(t * 1.6) * 0.06;
  });
  return (
    <Fade show={show}>
      <group position={[PATCH.x, 0.03, PATCH.z]}>
        <mesh rotation-x={-Math.PI / 2}>
          <ringGeometry args={[PATCH.r - 0.04, PATCH.r, 64]} />
          <meshBasicMaterial color={color} transparent opacity={0.8} depthWrite={false} />
        </mesh>
        <mesh ref={ring} rotation-x={-Math.PI / 2}>
          <ringGeometry args={[PATCH.r - 0.03, PATCH.r, 64]} />
          <meshBasicMaterial color={color} transparent opacity={0.5} depthWrite={false} />
        </mesh>
        <group ref={pin}>
          <mesh position-y={-0.55}>
            <cylinderGeometry args={[0.012, 0.012, 1.1, 6]} />
            <meshBasicMaterial color={color} />
          </mesh>
          <mesh>
            <sphereGeometry args={[0.11, 20, 14]} />
            <meshBasicMaterial color={color} />
          </mesh>
          {show && (
            <Html position={[0, 0.38, 0]} center zIndexRange={[10, 0]}>
              <Tag tone={tone === 'warn' ? 'warn' : 'accent'}>{label}</Tag>
            </Html>
          )}
        </group>
      </group>
    </Fade>
  );
}

function Farmer({ p, show }: { p: ScenePalette; show: boolean }) {
  const g = useRef<THREE.Group>(null);
  const progress = useRef(0);
  useFrame(({ clock }, dt) => {
    progress.current = show ? Math.min(1, progress.current + dt * 0.28) : 0;
    const k = 1 - Math.pow(1 - progress.current, 2);
    const grp = g.current;
    if (!grp) return;
    grp.position.set(THREE.MathUtils.lerp(-1.2, PATCH.x - 1.1, k), 0, THREE.MathUtils.lerp(1.9, PATCH.z + 1.2, k));
    grp.rotation.y = Math.atan2(PATCH.x - 1.1 + 1.2, PATCH.z + 1.2 - 1.9) * (1 - k * 0.2);
    grp.position.y = progress.current < 1 ? Math.abs(Math.sin(clock.elapsedTime * 7)) * 0.04 : 0;
  });
  return (
    <Fade show={show}>
      <group ref={g} scale={0.55}>
        <mesh position-y={0.62}>
          <capsuleGeometry args={[0.2, 0.55, 6, 12]} />
          <meshStandardMaterial color={p.water} roughness={0.8} />
        </mesh>
        <mesh position-y={1.22}>
          <sphereGeometry args={[0.17, 16, 12]} />
          <meshStandardMaterial color={p.trunk} roughness={0.8} />
        </mesh>
        <mesh position-y={1.38}>
          <cylinderGeometry args={[0.02, 0.34, 0.16, 16]} />
          <meshStandardMaterial color={p.ear} roughness={0.9} />
        </mesh>
      </group>
    </Fade>
  );
}

function Drops({ p, show }: { p: ScenePalette; show: boolean }) {
  const count = 90;
  const { geo, seeds } = useMemo(() => {
    const r = rng(4);
    const seeds = Array.from({ length: count }, () => [PATCH.x + (r() - 0.5) * PATCH.r * 1.6, PATCH.z + (r() - 0.5) * PATCH.r * 1.6, r()] as const);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    return { geo, seeds };
  }, []);
  useFrame(({ clock }) => {
    const arr = geo.attributes.position.array as Float32Array;
    const t = clock.elapsedTime;
    seeds.forEach(([x, z, o], i) => {
      const y = 2.4 - ((t * 0.9 + o * 2.4) % 2.4);
      arr[i * 3] = x;
      arr[i * 3 + 1] = y;
      arr[i * 3 + 2] = z;
    });
    geo.attributes.position.needsUpdate = true;
  });
  return (
    <Fade show={show}>
      <points geometry={geo}>
        <pointsMaterial color={p.water} size={0.06} transparent opacity={0.8} depthWrite={false} />
      </points>
    </Fade>
  );
}

export function FarmWorld({
  stage,
  variant = 'journey',
  labels,
}: {
  stage: number;
  variant?: 'journey' | 'compact';
  labels?: { risk?: string; rec?: string };
}) {
  const p = usePalette();
  const { theme } = useTheme();
  const pointer = useRef(new THREE.Vector3(999, 0, 999));
  const pose = POSES[Math.max(0, Math.min(5, stage))];
  const compact = variant === 'compact';

  return (
    <>
      <Atmosphere p={p} fogNear={compact ? 12 : 16} fogFar={compact ? 30 : 40} />
      <CameraRig position={compact ? [4.2, 6.8, 10.5] : pose.pos} lookAt={compact ? [1.2, 0.3, -1.8] : pose.look} strength={compact ? [0.5, 0.25] : [0.7, 0.35]} ease={0.035} />
      <PointerGround target={pointer} />
      <Ground p={p} fieldSize={[13, 7.4]} fieldCenter={[0, -1.7]} />
      <CropField p={p} area={[-6.2, 6.2, -5.1, 1.6]} spacing={compact ? [0.32, 0.4] : [0.26, 0.36]} pointer={pointer} exclude={inPatch} health={stage >= 5 ? 1 : 0.9} seed={3} heightScale={0.75} />
      <CropField p={p} area={[PATCH.x - PATCH.r, PATCH.x + PATCH.r, PATCH.z - PATCH.r, PATCH.z + PATCH.r]} spacing={[0.26, 0.36]} pointer={pointer} exclude={outsidePatch} health={stage >= 5 ? 1 : 0.15} seed={5} heightScale={stage >= 5 ? 0.75 : 0.62} />
      <Channel p={p} from={[-6.4, 2.25]} to={[6.4, 2.25]} width={0.3} />
      <Farmhouse p={p} position={[-4.6, 0, -7.2]} rotation={0.35} />
      <Tree p={p} position={[-7.6, 0, -4.8]} scale={0.95} seed={1} />
      <Tree p={p} position={[-8.4, 0, -1.4]} scale={0.8} seed={2} />
      <Tree p={p} position={[7.8, 0, -5.6]} scale={1} seed={3} />
      <Tree p={p} position={[6.6, 0, -8.4]} scale={0.8} seed={4} />
      <Sun p={p} position={theme === 'dark' ? [7, 3.2, -14] : [6.5, 7.5, -14]} size={0.8} />
      <Clouds p={p} count={3} y={6} spread={24} />

      {!compact && <DataLayers p={p} show={stage === 1} />}
      <PatchMarker p={p} show={stage === 2} tone="warn" label={labels?.risk ?? 'Rust-favourable weather'} />
      <PatchMarker p={p} show={stage === 3} tone="accent" label={labels?.rec ?? 'Scout + organic N support'} />
      {!compact && <Farmer p={p} show={stage === 4} />}
      {!compact && <Drops p={p} show={stage === 4} />}
      {!compact && stage === 5 && <Butterflies p={p} center={[0.5, 0.6, -0.6]} />}
      {!compact && theme === 'dark' && <Pollen p={p} count={60} box={[12, 2.5, 7]} center={[0, 1.4, -1.8]} dark />}
    </>
  );
}

