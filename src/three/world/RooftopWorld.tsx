import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef, type ReactNode } from 'react';
import * as THREE from 'three';
import type { PlantId, PlantStatus } from '@/models';
import type { ScenePalette } from '@/theme/scenePalette';
import { useTheme } from '@/theme/ThemeProvider';
import { useGardenFocus } from '@/state/gardenStore';
import { rng } from '../geometry';
import { Atmosphere, CameraRig, Clouds, Sun, usePalette } from './parts';

/**
 * An Indian terrace: parapet, stair room (mumty), black water tank on a stand, terracotta pots
 * and troughs. Pots are drawn from the grower's real garden (plant, count, stage) — the scene
 * is illustrative, the plants in it are not invented. Hovering a garden task emphasises its pots.
 */

const ROOF = { w: 10, d: 7 };
const MAX_DRAWN = 6;

type Geo = ReturnType<typeof makeGeometries>;
function makeGeometries() {
  return {
    pot: new THREE.CylinderGeometry(0.26, 0.19, 0.36, 18),
    rim: new THREE.CylinderGeometry(0.285, 0.285, 0.06, 18),
    soil: new THREE.CircleGeometry(0.245, 18),
    leaf: new THREE.IcosahedronGeometry(1, 0),
    ball: new THREE.SphereGeometry(1, 12, 8),
    stick: new THREE.CylinderGeometry(1, 1, 1, 5),
    cone: new THREE.ConeGeometry(1, 1, 6),
    trough: new THREE.BoxGeometry(1, 1, 1),
    ring: new THREE.RingGeometry(0.34, 0.4, 32),
  };
}

/** Growth 0.35 (just planted) → 1 (harvest), from the planting's real stage. */
function growthOf(s: PlantStatus) {
  if (s.step === null) return 0.6;
  return 0.35 + 0.65 * Math.min(1, s.step / (s.path.length - 1));
}

function FruitingPlant({ id, s, p, G, seed }: { id: PlantId; s: PlantStatus; p: ScenePalette; G: Geo; seed: number }) {
  const g = growthOf(s);
  const r = useMemo(() => rng(seed), [seed]);
  const layout = useMemo(() => Array.from({ length: 6 }, () => [r() - 0.5, r(), r() - 0.5, r()] as const), [r]);
  const flowering = s.stage === 'flowering';
  const fruiting = s.stage === 'fruit' || s.stage === 'harvest' || s.stage === 'finished';
  const ripe = s.stage === 'harvest' || s.stage === 'finished';
  const tall = id === 'tomato' || id === 'okra';
  const h = (tall ? 1.05 : 0.62) * g;
  const fruitColor = id === 'brinjal' ? p.aubergine : ripe ? p.fruit : p.fruitGreen;
  return (
    <group position-y={0.18}>
      {id === 'tomato' && (
        <mesh geometry={G.stick} position-y={0.55} scale={[0.012, 1.1, 0.012]}>
          <meshStandardMaterial color={p.trunk} roughness={0.9} />
        </mesh>
      )}
      <mesh geometry={G.stick} position-y={h / 2} scale={[0.02, h, 0.02]}>
        <meshStandardMaterial color={p.leafDark} roughness={0.9} />
      </mesh>
      {layout.slice(0, tall ? 5 : 4).map(([x, y, z], i) => (
        <mesh key={i} geometry={G.leaf} position={[x * 0.32 * g, h * (0.35 + y * 0.6), z * 0.32 * g]} scale={(tall ? 0.17 : 0.2) * (0.7 + g * 0.5)} rotation={[x, y * 3, z]}>
          <meshStandardMaterial color={i % 2 ? p.leaf : p.leafDark} roughness={0.85} flatShading />
        </mesh>
      ))}
      {flowering &&
        layout.slice(0, 4).map(([x, y, z], i) => (
          <mesh key={`f${i}`} geometry={G.ball} position={[x * 0.42 * g, h * (0.55 + y * 0.4), z * 0.42 * g + 0.05]} scale={0.035}>
            <meshBasicMaterial color={p.flower} />
          </mesh>
        ))}
      {fruiting &&
        layout.slice(0, id === 'okra' ? 3 : 4).map(([x, y, z], i) =>
          id === 'chilli' || id === 'okra' ? (
            <mesh key={`c${i}`} geometry={G.cone} position={[x * 0.4, h * (0.35 + y * 0.35), z * 0.4 + 0.08]} scale={[0.028, id === 'okra' ? 0.16 : 0.12, 0.028]} rotation-x={Math.PI}>
              <meshStandardMaterial color={id === 'okra' ? p.fruitGreen : fruitColor} roughness={0.6} />
            </mesh>
          ) : (
            <mesh key={`t${i}`} geometry={G.ball} position={[x * 0.4, h * (0.3 + y * 0.45), z * 0.4 + 0.08]} scale={id === 'brinjal' ? [0.06, 0.1, 0.06] : 0.065}>
              <meshStandardMaterial color={fruitColor} roughness={0.45} />
            </mesh>
          ),
        )}
    </group>
  );
}

function HerbMound({ s, p, G, seed }: { s: PlantStatus; p: ScenePalette; G: Geo; seed: number }) {
  const g = growthOf(s);
  const pts = useMemo(() => {
    const r = rng(seed);
    return Array.from({ length: 9 }, () => [(r() - 0.5) * 0.36, r() * 0.12, (r() - 0.5) * 0.36] as const);
  }, [seed]);
  return (
    <group position-y={0.2}>
      {pts.map(([x, y, z], i) => (
        <mesh key={i} geometry={G.leaf} position={[x, y * g + 0.04, z]} scale={0.085 * (0.6 + g * 0.6)}>
          <meshStandardMaterial color={i % 3 ? p.leaf : p.canopy2} roughness={0.85} flatShading />
        </mesh>
      ))}
    </group>
  );
}

/** Rows of greens in a trough (palak, methi, dhaniya are counted in sq ft of bed). */
function Trough({ s, p, G, length, seed }: { s: PlantStatus; p: ScenePalette; G: Geo; length: number; seed: number }) {
  const g = growthOf(s);
  const fine = s.plant.id === 'coriander' || s.plant.id === 'methi';
  const leaves = useMemo(() => {
    const r = rng(seed);
    const n = Math.round(length * 9);
    return Array.from({ length: n }, (_, i) => [-length / 2 + 0.08 + (i / n) * (length - 0.16), (r() - 0.5) * 0.3, r()] as const);
  }, [length, seed]);
  return (
    <group>
      <mesh geometry={G.trough} position-y={0.13} scale={[length, 0.26, 0.5]}>
        <meshStandardMaterial color={p.pot} roughness={0.95} />
      </mesh>
      <mesh geometry={G.trough} position-y={0.262} scale={[length - 0.08, 0.01, 0.42]}>
        <meshStandardMaterial color={p.soil[1]} roughness={1} />
      </mesh>
      {leaves.map(([x, z, k], i) => (
        <mesh key={i} geometry={fine ? G.cone : G.leaf} position={[x, 0.3 + (fine ? 0.07 : 0.04) * g, z]} scale={fine ? [0.03, 0.16 * g + 0.04, 0.03] : [0.09 * g + 0.03, 0.05 * g + 0.02, 0.09 * g + 0.03]} rotation-y={k * 6}>
          <meshStandardMaterial color={k > 0.5 ? p.leaf : fine ? p.canopy2 : p.leafDark} roughness={0.85} flatShading />
        </mesh>
      ))}
    </group>
  );
}

function Pot({ p, G, children }: { p: ScenePalette; G: Geo; children: ReactNode }) {
  return (
    <group>
      <mesh geometry={G.pot} position-y={0.18}>
        <meshStandardMaterial color={p.pot} roughness={0.95} />
      </mesh>
      <mesh geometry={G.rim} position-y={0.36}>
        <meshStandardMaterial color={p.potRim} roughness={0.9} />
      </mesh>
      <mesh geometry={G.soil} rotation-x={-Math.PI / 2} position-y={0.345}>
        <meshStandardMaterial color={p.soil[1]} roughness={1} />
      </mesh>
      <group position-y={0.16}>{children}</group>
    </group>
  );
}

/** One planting (all its pots or its trough), with sway and focus emphasis. */
function Planting({ s, slots, trough, p, G, index }: { s: PlantStatus; slots: [number, number][]; trough?: { x: number; z: number; length: number }; p: ScenePalette; G: Geo; index: number }) {
  const group = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Group>(null);
  const emphasis = useRef(0);
  const focused = useGardenFocus((st) => st.entryId === s.entry.id);
  useFrame(({ clock }, dt) => {
    emphasis.current += ((focused ? 1 : 0) - emphasis.current) * Math.min(1, dt * 6);
    const e = emphasis.current;
    const grp = group.current;
    if (grp)
      grp.children.forEach((c, i) => {
        c.rotation.z = Math.sin(clock.elapsedTime * 0.9 + i * 1.7 + index) * 0.025;
        c.scale.setScalar(1 + e * 0.08);
      });
    if (ring.current) {
      ring.current.visible = e > 0.02;
      ring.current.children.forEach((m) => (((m as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.85 * e));
    }
  });
  const tagAt: [number, number, number] = trough ? [trough.x, 1.0, trough.z] : [slots[0][0], 1.55, slots[0][1]];
  return (
    <>
      <group ref={group}>
        {trough ? (
          <group position={[trough.x, 0, trough.z]}>
            <Trough s={s} p={p} G={G} length={trough.length} seed={index * 7 + 3} />
          </group>
        ) : (
          slots.map(([x, z], i) => (
            <group key={i} position={[x, 0, z]}>
              <Pot p={p} G={G}>
                {s.plant.kind === 'fruiting' ? <FruitingPlant id={s.plant.id} s={s} p={p} G={G} seed={index * 13 + i} /> : <HerbMound s={s} p={p} G={G} seed={index * 5 + i} />}
              </Pot>
            </group>
          ))
        )}
      </group>
      <group ref={ring} visible={false}>
        {trough ? (
          <mesh position={[trough.x, 0.012, trough.z]} rotation-x={-Math.PI / 2}>
            <planeGeometry args={[trough.length + 0.4, 0.9]} />
            <meshBasicMaterial color={p.pot} transparent opacity={0} depthWrite={false} />
          </mesh>
        ) : (
          slots.map(([x, z], i) => (
            <mesh key={i} geometry={G.ring} position={[x, 0.012, z]} rotation-x={-Math.PI / 2}>
              <meshBasicMaterial color={p.pot} transparent opacity={0} depthWrite={false} />
            </mesh>
          ))
        )}
      </group>
      {focused && (
        <Html position={tagAt} center zIndexRange={[10, 0]}>
          <div className="pointer-events-none whitespace-nowrap rounded-full border border-clay/40 bg-surface/95 px-3 py-1 text-[11px] font-semibold text-clay shadow-lift ring-4 ring-clay/15 backdrop-blur">
            {s.plant.name} · {s.plant.localName}
          </div>
        </Html>
      )}
    </>
  );
}

function Terrace({ p }: { p: ScenePalette }) {
  const wall = (x: number, z: number, w: number, d: number, h = 0.45) => (
    <mesh position={[x, h / 2, z]}>
      <boxGeometry args={[w, h, d]} />
      <meshStandardMaterial color={p.parapet} roughness={0.95} />
    </mesh>
  );
  const t = 0.16;
  return (
    <group>
      {/* slab + building body below it */}
      <mesh position={[0, -0.06, 0]}>
        <boxGeometry args={[ROOF.w, 0.12, ROOF.d]} />
        <meshStandardMaterial color={p.slab} roughness={1} />
      </mesh>
      <mesh position={[0, -0.55, 0]}>
        <boxGeometry args={[ROOF.w - 0.1, 0.9, ROOF.d - 0.1]} />
        <meshStandardMaterial color={p.parapet} roughness={1} />
      </mesh>
      {wall(0, -ROOF.d / 2 + t / 2, ROOF.w, t)}
      {wall(-ROOF.w / 2 + t / 2, 0, t, ROOF.d)}
      {wall(ROOF.w / 2 - t / 2, 0, t, ROOF.d)}
      {wall(0, ROOF.d / 2 - t / 2, ROOF.w, t, 0.38)}
      {/* stair room (mumty) */}
      <group position={[-3.7, 0, -2.3]}>
        <mesh position-y={1.05}>
          <boxGeometry args={[2.2, 2.1, 2]} />
          <meshStandardMaterial color={p.parapet} roughness={0.95} />
        </mesh>
        <mesh position={[0, 2.14, 0]}>
          <boxGeometry args={[2.4, 0.08, 2.2]} />
          <meshStandardMaterial color={p.slab} roughness={1} />
        </mesh>
        <mesh position={[0.35, 0.8, 1.005]}>
          <planeGeometry args={[0.75, 1.6]} />
          <meshStandardMaterial color={p.trunk} roughness={0.9} />
        </mesh>
      </group>
      {/* water tank on a stand */}
      <group position={[3.8, 0, -2.45]}>
        {[
          [-0.45, -0.45],
          [0.45, -0.45],
          [-0.45, 0.45],
          [0.45, 0.45],
        ].map(([x, z], i) => (
          <mesh key={i} position={[x, 0.22, z]}>
            <boxGeometry args={[0.09, 0.44, 0.09]} />
            <meshStandardMaterial color={p.parapet} roughness={1} />
          </mesh>
        ))}
        <mesh position-y={0.47}>
          <boxGeometry args={[1.15, 0.07, 1.15]} />
          <meshStandardMaterial color={p.parapet} roughness={1} />
        </mesh>
        <mesh position-y={1.06}>
          <cylinderGeometry args={[0.52, 0.55, 1.1, 24]} />
          <meshStandardMaterial color={p.tank} roughness={0.55} />
        </mesh>
        <mesh position-y={1.66}>
          <cylinderGeometry args={[0.2, 0.52, 0.12, 24]} />
          <meshStandardMaterial color={p.tank} roughness={0.55} />
        </mesh>
      </group>
    </group>
  );
}

/** Low neighbouring blocks that fade into the page — says "city roof" without competing. */
function City({ p }: { p: ScenePalette }) {
  const blocks = useMemo(() => {
    const r = rng(11);
    return Array.from({ length: 16 }, (_, i) => {
      const a = (i / 16) * Math.PI * 2 + r() * 0.3;
      const dist = 15 + r() * 9;
      return { x: Math.cos(a) * dist, z: Math.sin(a) * dist - 6, w: 3 + r() * 3, d: 3 + r() * 3, h: 1 + r() * 3.2, c: r() > 0.5 ? p.city : p.city2 };
    }).filter((b) => b.z < -2);
  }, [p.city, p.city2]);
  return (
    <group>
      {blocks.map((b, i) => (
        <mesh key={i} position={[b.x, -3.6 + b.h / 2, b.z]}>
          <boxGeometry args={[b.w, b.h, b.d]} />
          <meshStandardMaterial color={b.c} roughness={1} />
        </mesh>
      ))}
    </group>
  );
}

const POT_SLOTS: [number, number][] = [];
// Front rows first, so the plants sit nearest the viewer.
for (let row = 0; row < 4; row++) for (let col = 0; col < 6; col++) POT_SLOTS.push([-1.3 + col * 0.95, 2.35 - row * 1.05]);
const TROUGH_ROWS = [2.45, 1.4, 0.35, -0.7];

export function RooftopWorld({ statuses }: { statuses: PlantStatus[] }) {
  const p = usePalette();
  const { theme } = useTheme();
  const G = useMemo(makeGeometries, []);

  // Pots fill the grid front-to-back; greens get a trough each along the left parapet.
  const placed = useMemo(() => {
    let slot = 0;
    let row = 0;
    return statuses.map((s) => {
      if (s.plant.unit === 'bed') {
        const z = TROUGH_ROWS[row++ % TROUGH_ROWS.length];
        return { s, slots: [] as [number, number][], trough: { x: -3.35, z, length: Math.min(2.4, 0.9 + Math.min(s.entry.count, MAX_DRAWN) * 0.25) } };
      }
      const n = Math.min(s.entry.count, MAX_DRAWN);
      const slots = POT_SLOTS.slice(slot, slot + n);
      slot += n;
      return { s, slots, trough: undefined };
    });
  }, [statuses]);

  return (
    <>
      <Atmosphere p={p} fogNear={13} fogFar={34} sunPos={[6, 9, -4]} />
      <CameraRig position={[4.4, 5.2, 8.4]} lookAt={[0.2, 0.2, 0.6]} strength={[0.6, 0.3]} ease={0.035} />
      <City p={p} />
      <Terrace p={p} />
      {placed.map(({ s, slots, trough }, i) => (
        <Planting key={s.entry.id} s={s} slots={slots} trough={trough} p={p} G={G} index={i} />
      ))}
      <Sun p={p} position={theme === 'dark' ? [7, 3, -13] : [6, 7.5, -13]} size={0.75} />
      <Clouds p={p} count={3} y={6} spread={24} />
    </>
  );
}
