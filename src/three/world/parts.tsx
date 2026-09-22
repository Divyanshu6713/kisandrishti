import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { useTheme } from '@/theme/ThemeProvider';
import { scenePalette, type ScenePalette } from '@/theme/scenePalette';
import { makeEarGeometry, makeTuftGeometry, radialTexture, rng } from '../geometry';
import { createWindMaterial } from '../windMaterial';

export function usePalette(): ScenePalette {
  const { theme } = useTheme();
  return useMemo(() => scenePalette(theme), [theme]);
}

/** Lights + fog that blend the scene into the page background. */
export function Atmosphere({ p, fogNear = 14, fogFar = 42, sunPos = [8, 9, -6] as [number, number, number] }: { p: ScenePalette; fogNear?: number; fogFar?: number; sunPos?: [number, number, number] }) {
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    scene.fog = new THREE.Fog(p.fog, fogNear, fogFar);
    return () => {
      scene.fog = null;
    };
  }, [scene, p.fog, fogNear, fogFar]);
  return (
    <>
      <hemisphereLight args={[p.hemiSky, p.hemiGround, p.ambient + 0.35]} />
      <directionalLight position={sunPos} intensity={p.keyIntensity} color={p.keyLight} />
      <ambientLight intensity={p.ambient * 0.5} />
    </>
  );
}

/** Projects the cursor onto the ground plane (y = 0) every frame, smoothed. */
export function PointerGround({ target, enabled = true }: { target: MutableRefObject<THREE.Vector3>; enabled?: boolean }) {
  const ray = useMemo(() => new THREE.Raycaster(), []);
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
  const hit = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, pointer }) => {
    if (!enabled) return;
    ray.setFromCamera(pointer, camera);
    if (ray.ray.intersectPlane(plane, hit)) target.current.lerp(hit, 0.12);
  });
  return null;
}

/** Smooth, subtle parallax: the camera drifts toward the cursor and eases between stage poses. */
export function CameraRig({
  position,
  lookAt,
  strength = [0.6, 0.3],
  ease = 0.045,
}: {
  position: [number, number, number];
  lookAt: [number, number, number];
  strength?: [number, number];
  ease?: number;
}) {
  const look = useRef(new THREE.Vector3(...lookAt));
  const goal = useMemo(() => new THREE.Vector3(), []);
  const lookGoal = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, pointer }, dt) => {
    const k = 1 - Math.pow(1 - ease, dt * 60);
    goal.set(position[0] + pointer.x * strength[0], position[1] + pointer.y * strength[1], position[2]);
    camera.position.lerp(goal, k);
    lookGoal.set(...lookAt);
    look.current.lerp(lookGoal, k);
    camera.lookAt(look.current);
  });
  return null;
}

export function Ground({ p, fieldSize = [24, 11], fieldCenter = [0, -4] }: { p: ScenePalette; fieldSize?: [number, number]; fieldCenter?: [number, number] }) {
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.02}>
        <circleGeometry args={[60, 48]} />
        <meshStandardMaterial color={p.ground} roughness={1} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[fieldCenter[0], 0, fieldCenter[1]]}>
        <planeGeometry args={fieldSize} />
        <meshStandardMaterial color={p.groundEdge} roughness={1} />
      </mesh>
      {/* distant soft hills for depth — fog blends them into the page */}
      {[
        [-16, -24, 9, p.canopy],
        [4, -30, 13, p.canopy2],
        [22, -22, 8, p.canopy],
      ].map(([x, z, s, c], i) => (
        <mesh key={i} position={[x as number, -(s as number) * 0.72, z as number]} scale={[1.6, 1, 1]}>
          <sphereGeometry args={[s as number, 24, 12]} />
          <meshStandardMaterial color={c as string} roughness={1} />
        </mesh>
      ))}
    </group>
  );
}

/** Instanced wheat field with GPU wind + cursor push. `health` blends stressed → healthy colour. */
export function CropField({
  p,
  area,
  spacing = [0.3, 0.42],
  pointer,
  health = 1,
  ears = true,
  seed = 3,
  exclude,
  heightScale = 1,
}: {
  p: ScenePalette;
  area: [number, number, number, number]; // x0 x1 z0 z1
  spacing?: [number, number];
  pointer?: MutableRefObject<THREE.Vector3>;
  health?: number;
  ears?: boolean;
  seed?: number;
  exclude?: (x: number, z: number) => boolean;
  heightScale?: number;
}) {
  const HEIGHT = 0.75;
  const tuft = useMemo(() => makeTuftGeometry(seed, 6, HEIGHT), [seed]);
  const ear = useMemo(() => {
    const g = makeEarGeometry(0.2, 10);
    g.translate(0, HEIGHT * 0.78, 0);
    return g;
  }, []);
  const blades = useMemo(() => createWindMaterial(p.crop, HEIGHT), []); // eslint-disable-line react-hooks/exhaustive-deps
  const earMat = useMemo(() => createWindMaterial(p.ear, HEIGHT, false), []); // eslint-disable-line react-hooks/exhaustive-deps

  const areaKey = area.join(',');
  const spacingKey = spacing.join(',');
  const matrices = useMemo(() => {
    const r = rng(seed * 31);
    const out: THREE.Matrix4[] = [];
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const [x0, x1, z0, z1] = area;
    for (let z = z0; z <= z1; z += spacing[1]) {
      for (let x = x0; x <= x1; x += spacing[0]) {
        const jx = x + (r() - 0.5) * spacing[0] * 0.7;
        const jz = z + (r() - 0.5) * spacing[1] * 0.35;
        if (exclude?.(jx, jz)) continue;
        const s = (0.8 + r() * 0.45) * heightScale;
        e.set(0, r() * Math.PI * 2, 0);
        q.setFromEuler(e);
        m.compose(new THREE.Vector3(jx, 0, jz), q, new THREE.Vector3(s, s, s));
        out.push(m.clone());
      }
    }
    return out;
  }, [areaKey, spacingKey, seed, exclude, heightScale]); // eslint-disable-line react-hooks/exhaustive-deps

  const bladeRef = useRef<THREE.InstancedMesh>(null);
  const earRef = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    matrices.forEach((m, i) => {
      bladeRef.current?.setMatrixAt(i, m);
      earRef.current?.setMatrixAt(i, m);
    });
    if (bladeRef.current) bladeRef.current.instanceMatrix.needsUpdate = true;
    if (earRef.current) earRef.current.instanceMatrix.needsUpdate = true;
  }, [matrices]);

  const healthy = useMemo(() => new THREE.Color(), []);
  const stressed = useMemo(() => new THREE.Color(), []);
  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    healthy.set(p.cropHealthy);
    stressed.set(p.cropStressed);
    const target = stressed.clone().lerp(healthy, health);
    blades.material.color.lerp(target, Math.min(1, dt * 2.5));
    earMat.material.color.lerp(healthy.set(p.ear), Math.min(1, dt * 2.5));
    for (const u of [blades.uniforms, earMat.uniforms]) {
      u.uTime.value = t;
      if (pointer) u.uPointer.value.copy(pointer.current);
    }
  });

  useEffect(
    () => () => {
      tuft.dispose();
      ear.dispose();
      blades.material.dispose();
      earMat.material.dispose();
    },
    [tuft, ear, blades, earMat],
  );

  return (
    <group>
      <instancedMesh key={`b${matrices.length}`} ref={bladeRef} args={[tuft, blades.material, matrices.length]} frustumCulled={false} />
      {ears && <instancedMesh key={`e${matrices.length}`} ref={earRef} args={[ear, earMat.material, matrices.length]} frustumCulled={false} />}
    </group>
  );
}

export function Tree({ p, position, scale = 1, seed = 1 }: { p: ScenePalette; position: [number, number, number]; scale?: number; seed?: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.rotation.z = Math.sin(clock.elapsedTime * 0.6 + seed) * 0.012;
  });
  return (
    <group ref={ref} position={position} scale={scale}>
      <mesh position-y={0.7}>
        <cylinderGeometry args={[0.09, 0.15, 1.4, 7]} />
        <meshStandardMaterial color={p.trunk} roughness={0.9} />
      </mesh>
      <mesh position-y={1.9}>
        <icosahedronGeometry args={[0.95, 1]} />
        <meshStandardMaterial color={p.canopy} roughness={0.85} flatShading />
      </mesh>
      <mesh position={[0.45, 1.55, 0.2]}>
        <icosahedronGeometry args={[0.6, 1]} />
        <meshStandardMaterial color={p.canopy2} roughness={0.85} flatShading />
      </mesh>
    </group>
  );
}

export function Farmhouse({ p, position, rotation = 0 }: { p: ScenePalette; position: [number, number, number]; rotation?: number }) {
  return (
    <group position={position} rotation-y={rotation}>
      <mesh position-y={0.55}>
        <boxGeometry args={[2, 1.1, 1.4]} />
        <meshStandardMaterial color={p.house} roughness={0.9} />
      </mesh>
      <mesh position-y={1.42} rotation={[0, 0, 0]} scale={[1.18, 0.62, 0.86]}>
        <cylinderGeometry args={[1, 1, 2, 3, 1]} />
        <meshStandardMaterial color={p.roof} roughness={0.85} flatShading />
      </mesh>
      <mesh position={[0.35, 0.36, 0.71]}>
        <planeGeometry args={[0.36, 0.62]} />
        <meshStandardMaterial color={p.trunk} />
      </mesh>
      <mesh position={[-0.45, 0.62, 0.71]}>
        <planeGeometry args={[0.34, 0.3]} />
        <meshStandardMaterial color={p.water} emissive={p.water} emissiveIntensity={0.15} />
      </mesh>
    </group>
  );
}

/** Irrigation channel along the field edge — shimmers gently. */
export function Channel({ p, from, to, width = 0.35 }: { p: ScenePalette; from: [number, number]; to: [number, number]; width?: number }) {
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const angle = Math.atan2(to[1] - from[1], to[0] - from[0]);
  useFrame(({ clock }) => {
    if (mat.current) mat.current.emissiveIntensity = 0.18 + Math.sin(clock.elapsedTime * 1.6) * 0.06;
  });
  return (
    <mesh rotation={[-Math.PI / 2, 0, -angle]} position={[(from[0] + to[0]) / 2, 0.015, (from[1] + to[1]) / 2]}>
      <planeGeometry args={[len, width]} />
      <meshStandardMaterial ref={mat} color={p.water} emissive={p.water} emissiveIntensity={0.2} roughness={0.25} metalness={0.1} />
    </mesh>
  );
}

export function Sun({ p, position, size = 0.9 }: { p: ScenePalette; position: [number, number, number]; size?: number }) {
  const glow = useMemo(() => radialTexture('rgba(255,255,255,0.9)', 'rgba(255,255,255,0)'), []);
  const sprite = useRef<THREE.Sprite>(null);
  useFrame(({ clock, pointer }) => {
    if (sprite.current) {
      const s = size * 5.2 + Math.sin(clock.elapsedTime * 0.5) * 0.15 + pointer.x * 0.25;
      sprite.current.scale.set(s, s, 1);
    }
  });
  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[size, 32, 16]} />
        <meshBasicMaterial color={p.sun} fog={false} />
      </mesh>
      <sprite ref={sprite}>
        <spriteMaterial map={glow} color={p.sunGlow} transparent opacity={0.55} depthWrite={false} fog={false} />
      </sprite>
    </group>
  );
}

export function Clouds({ p, count = 4, y = 6.5, spread = 26, seed = 5 }: { p: ScenePalette; count?: number; y?: number; spread?: number; seed?: number }) {
  const clouds = useMemo(() => {
    const r = rng(seed);
    return Array.from({ length: count }, (_, i) => ({
      x: -spread / 2 + (i / count) * spread + r() * 3,
      z: -14 - r() * 8,
      y: y + r() * 2,
      s: 0.8 + r() * 0.7,
      speed: 0.12 + r() * 0.1,
      puffs: Array.from({ length: 4 }, (_, k) => [k * 0.9 - 1.3, r() * 0.35, r() * 0.4, 0.7 + r() * 0.5] as const),
    }));
  }, [count, y, spread, seed]);
  const refs = useRef<(THREE.Group | null)[]>([]);
  useFrame((_, dt) => {
    clouds.forEach((c, i) => {
      const g = refs.current[i];
      if (!g) return;
      g.position.x += c.speed * dt;
      if (g.position.x > spread / 2 + 4) g.position.x = -spread / 2 - 4;
    });
  });
  return (
    <group>
      {clouds.map((c, i) => (
        <group key={i} ref={(el) => {
            refs.current[i] = el;
          }} position={[c.x, c.y, c.z]} scale={c.s}>
          {c.puffs.map(([px, py, pz, ps], k) => (
            <mesh key={k} position={[px, py, pz]} scale={[ps * 1.2, ps * 0.8, ps]}>
              <sphereGeometry args={[1, 14, 10]} />
              <meshStandardMaterial color={p.cloud} roughness={1} transparent opacity={0.92} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

/** Soft contact shadow blob (cheaper than real shadows). */
export function BlobShadow({ position = [0, 0.01, 0], size = 2.2, opacity = 0.35 }: { position?: [number, number, number]; size?: number; opacity?: number }) {
  const tex = useMemo(() => radialTexture('rgba(40,30,15,1)', 'rgba(40,30,15,0)'), []);
  return (
    <mesh rotation-x={-Math.PI / 2} position={position}>
      <planeGeometry args={[size, size]} />
      <meshBasicMaterial map={tex} transparent opacity={opacity} depthWrite={false} />
    </mesh>
  );
}
