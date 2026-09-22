import { CanvasShell } from './CanvasShell';
import { SceneFallback } from './SceneFallback';
import { FarmWorld } from './world/FarmWorld';

export default function JourneyScene({ stage, className }: { stage: number; className?: string }) {
  return (
    <CanvasShell
      className={className}
      camera={{ fov: 38, position: [0, 6.2, 12.5], near: 0.1, far: 80 }}
      fallback={<SceneFallback compact />}
      label={`Illustrative farm scene, stage ${stage + 1} of 6 of the Kisan Drishti journey.`}
    >
      <FarmWorld stage={stage} />
    </CanvasShell>
  );
}
