import type { PlantStatus } from '@/models';
import { CanvasShell } from './CanvasShell';
import { RooftopFallback } from './RooftopFallback';
import { RooftopWorld } from './world/RooftopWorld';

/** Rooftop dashboard centrepiece. Pots and stages come from the grower's garden. */
export default function RooftopScene({ statuses, className }: { statuses: PlantStatus[]; className?: string }) {
  const summary = statuses.map((s) => `${s.plant.name} (${s.plant.unit === 'pot' ? `${s.entry.count} pots` : `${s.entry.count} sq ft`})`).join(', ');
  return (
    <CanvasShell
      className={className}
      camera={{ fov: 36, position: [4.4, 5.2, 8.4], near: 0.1, far: 60 }}
      fallback={<RooftopFallback />}
      label={`Illustrative view of your rooftop garden: ${summary || 'no plants yet'}.`}
    >
      <RooftopWorld statuses={statuses} />
    </CanvasShell>
  );
}
