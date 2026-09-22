import { CanvasShell } from './CanvasShell';
import { SceneFallback } from './SceneFallback';
import { FarmWorld } from './world/FarmWorld';

/** Dashboard field view. The marker reflects the farm's real advisor status. */
export default function FieldScene({ status, riskLabel, recLabel, className }: { status: 'attention' | 'planned' | 'clear'; riskLabel: string; recLabel: string; className?: string }) {
  const stage = status === 'attention' ? 2 : status === 'planned' ? 3 : 5;
  return (
    <CanvasShell
      className={className}
      camera={{ fov: 36, position: [4.2, 6.8, 10.5], near: 0.1, far: 60 }}
      fallback={<SceneFallback compact />}
      label="Illustrative view of the farm. The marker shows where the field observation was reported."
    >
      <FarmWorld stage={stage} variant="compact" labels={{ risk: riskLabel, rec: recLabel }} />
    </CanvasShell>
  );
}
