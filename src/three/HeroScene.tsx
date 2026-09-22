import { useThree } from '@react-three/fiber';
import { useMemo, useRef, useState, type RefObject } from 'react';
import * as THREE from 'three';
import { useTheme } from '@/theme/ThemeProvider';
import { CanvasShell, isSmallScreen } from './CanvasShell';
import { radialTexture } from './geometry';
import { SceneFallback } from './SceneFallback';
import { Butterflies, DataNodes, Pollen, ScanRing } from './world/life';
import { Atmosphere, BlobShadow, CameraRig, Channel, Clouds, CropField, Farmhouse, Ground, PointerGround, Sun, Tree, usePalette } from './world/parts';
import { WheatPlant } from './world/WheatPlant';

/** Very soft light behind the plant so it reads clearly against the field. */
function Halo({ color, opacity }: { color: string; opacity: number }) {
  const tex = useMemo(() => radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)'), []);
  return (
    <sprite position={[0, 1.3, -0.6]} scale={[4.2, 4.2, 1]}>
      <spriteMaterial map={tex} color={color} transparent opacity={opacity} depthWrite={false} fog={false} />
    </sprite>
  );
}

function HeroWorld() {
  const p = usePalette();
  const { theme } = useTheme();
  const pointer = useRef(new THREE.Vector3(999, 0, 999));
  const [hover, setHover] = useState(false);
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height));
  const narrow = aspect < 1.05;
  const small = isSmallScreen();

  // On wide screens the plant sits right of the headline; on narrow screens it centres below it.
  const plantX = narrow ? 0 : Math.min(2.6, 1.2 + aspect * 0.7);
  const plantZ = 2.1;
  const cam: [number, number, number] = narrow ? [0, 4.3, 12.5] : [0, 3.3, 9.4];
  const look: [number, number, number] = narrow ? [0, 3, 0] : [0, 1.05, -0.5];

  return (
    <>
      <Atmosphere p={p} fogNear={15} fogFar={46} sunPos={theme === 'dark' ? [6, 3.5, -8] : [7, 9, -5]} />
      <CameraRig position={cam} lookAt={look} strength={[0.55, 0.28]} ease={0.05} />
      <PointerGround target={pointer} />

      <Ground p={p} fieldSize={[30, 11.4]} fieldCenter={[0, -6.6]} />
      <CropField p={p} area={[-15, 15, -12, -1.3]} spacing={small ? [0.42, 0.55] : [0.3, 0.42]} pointer={pointer} seed={3} heightScale={0.72} />
      <Channel p={p} from={[-16, -0.55]} to={[16, -0.55]} width={0.3} />

      <Farmhouse p={p} position={[5.6, 0, -14]} rotation={-0.45} />
      <Tree p={p} position={[-8.8, 0, -9.5]} scale={1.05} seed={1} />
      <Tree p={p} position={[-11, 0, -6.5]} scale={0.9} seed={2} />
      <Tree p={p} position={[9.5, 0, -10.5]} scale={1.1} seed={3} />
      <Tree p={p} position={[12, 0, -7.5]} scale={0.85} seed={4} />

      <Sun p={p} position={theme === 'dark' ? [8.5, 3.4, -20] : [8, 8, -20]} size={theme === 'dark' ? 0.75 : 0.95} />
      <Clouds p={p} count={3} y={7.2} spread={34} />

      {/* the signature element: a wheat clump that turns toward the cursor */}
      <group position={[plantX, 0, plantZ]}>
        <Halo color={p.sunGlow} opacity={theme === 'dark' ? 0.12 : 0.5} />
        <BlobShadow size={2} opacity={theme === 'dark' ? 0.35 : 0.2} />
        <ScanRing p={p} radius={1} />
        <WheatPlant p={p} health={1} growth={0.8} tillers={4} followPointer scale={1.3} onHover={setHover} />
        <DataNodes p={p} center={[0, 1.2, 0]} radius={1.05} active={hover} />
        {theme === 'light' && !small && <Butterflies p={p} center={[0, 1.1, -0.2]} />}
      </group>
      <Pollen p={p} count={small ? 70 : 150} box={[9, 3.2, 6]} center={[plantX, 1.9, 0.2]} dark={theme === 'dark'} />
    </>
  );
}

export default function HeroScene({ eventSource, className }: { eventSource: RefObject<HTMLElement | null>; className?: string }) {
  return (
    <CanvasShell
      className={className}
      eventSource={eventSource}
      camera={{ fov: 35, position: [0, 2.4, 9], near: 0.1, far: 80 }}
      fallback={<SceneFallback />}
      label="Illustrative 3D farm: a wheat plant in the foreground that turns toward your cursor, with a field, farmhouse and trees behind it."
    >
      <HeroWorld />
    </CanvasShell>
  );
}
