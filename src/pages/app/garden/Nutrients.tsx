import { ArrowRight, Eye } from 'lucide-react';
import { Link } from 'react-router';
import type { PlantStatus } from '@/models';
import { formatShortDate } from '@/lib/utils';
import { useGarden } from '@/hooks/useGarden';
import { STAGE_LABEL } from '@/services/gardenService';
import { EmptyState, PageHeader } from '@/components/ui/primitives';
import { Reveal } from '@/components/ui/motion';
import { GardenScenarioNote, GardenSources, GuideNote, StageTrack } from '@/features/garden/parts';

function PlantNotes({ s }: { s: PlantStatus }) {
  const stage = s.stage && s.stage !== 'finished' ? s.stage : null;
  const note = stage ? s.plant.nutrients[stage] : null;
  const nextIdx = s.step !== null ? s.step + 1 : null;
  const next = nextIdx !== null && nextIdx < s.path.length ? s.path[nextIdx] : null;
  const nextFrom = next && next !== 'planted' ? s.plant.stages.find((x) => x.id === next)?.from : undefined;
  return (
    <article className="card overflow-hidden">
      <header className="flex flex-col gap-4 border-b border-line/70 px-5 py-4 sm:flex-row sm:items-center sm:px-6">
        <div className="sm:w-48 sm:shrink-0">
          <h2 className="text-h3">
            {s.plant.name} <span className="text-base font-normal text-ink-3">· {s.plant.localName}</span>
          </h2>
          <p className="text-label text-ink-3">{s.days === null ? 'No planting date' : `Day ${s.days}${stage ? ` · ${STAGE_LABEL[stage].toLowerCase()}` : ''}`}</p>
        </div>
        <StageTrack s={s} />
      </header>
      <div className="grid gap-5 p-5 sm:p-6 md:grid-cols-2">
        {note ? (
          <>
            <div>
              <p className="eyebrow mb-1.5">Focus now</p>
              <p className="text-ink text-pretty">{note.focus}</p>
              {next && nextFrom !== undefined && s.days !== null && (
                <p className="mt-3 text-sm text-ink-3">
                  Next: {STAGE_LABEL[next].toLowerCase()} from about day {nextFrom}.
                </p>
              )}
            </div>
            <div>
              <p className="eyebrow mb-1.5">What to watch</p>
              <ul className="space-y-2">
                {note.watch.map((w) => (
                  <li key={w} className="flex items-start gap-2 text-sm text-ink-2">
                    <Eye className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" aria-hidden />
                    {w}
                  </li>
                ))}
              </ul>
            </div>
          </>
        ) : s.stage === 'finished' ? (
          <p className="text-sm text-ink-2 md:col-span-2">Past the usual harvest window. Clear the pot, refresh the mix with compost, and replant.</p>
        ) : (
          <div className="md:col-span-2">
            <p className="text-sm text-ink-2">Stage notes need a planting date — nothing is guessed without one.</p>
            <Link to="/app/garden/setup" className="btn-secondary mt-3">
              Add planting date <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        )}
      </div>
      {s.harvestFrom && s.stage !== 'harvest' && s.stage !== 'finished' && (
        <p className="border-t border-line/70 px-5 py-3 text-label text-ink-3 sm:px-6">First harvest from about {formatShortDate(s.harvestFrom)} · {s.plant.harvestNote}</p>
      )}
    </article>
  );
}

export default function Nutrients() {
  const g = useGarden();
  return (
    <>
      <GardenScenarioNote g={g} />
      <PageHeader eyebrow="Nutrient Adviser" title="What each plant needs now" description="Stage by stage: where to focus feeding and which signs to watch for. Compost-first, and never a dose." />
      <div className="mb-6">
        <GuideNote>
          These are signs to look for, not a diagnosis. Leaf colour has many causes — water, cold, pests or nutrients. If a problem spreads, show a sample to a local nursery, KVK or horticulture officer before treating.
        </GuideNote>
      </div>
      {g.statuses.length ? (
        <Reveal className="space-y-5">
          {g.statuses.map((s) => (
            <PlantNotes key={s.entry.id} s={s} />
          ))}
        </Reveal>
      ) : (
        <EmptyState title="No plants yet" body="Add your first plant to see what it needs at each stage." action={<Link to="/app/garden/setup" className="btn-primary">Add plants</Link>} />
      )}
      <GardenSources ids={['unh', 'clemson']} className="mt-8" />
    </>
  );
}
