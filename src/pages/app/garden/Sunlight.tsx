import { AlertTriangle, CheckCircle2, CircleDot, Save, Sun } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import type { PlantInfo, SunFit } from '@/models';
import { cn } from '@/lib/utils';
import { useGarden } from '@/hooks/useGarden';
import { gardenService } from '@/services/gardenService';
import { useGardenStore } from '@/state/gardenStore';
import { toast } from '@/state/toastStore';
import { PageHeader } from '@/components/ui/primitives';
import { Reveal } from '@/components/ui/motion';
import { GardenScenarioNote, GardenSources, GuideNote } from '@/features/garden/parts';

export const FIT: Record<SunFit, { label: string; cls: string; icon: typeof Sun }> = {
  good: { label: 'Good fit', cls: 'bg-accent-soft text-accent', icon: CheckCircle2 },
  workable: { label: 'Workable', cls: 'bg-warn-soft text-warn', icon: CircleDot },
  poor: { label: 'Too little sun', cls: 'bg-danger-soft text-danger', icon: AlertTriangle },
};

export function FitChip({ fit }: { fit: SunFit }) {
  const f = FIT[fit];
  return (
    <span className={cn('chip', f.cls)}>
      <f.icon className="h-3.5 w-3.5" aria-hidden />
      {f.label}
    </span>
  );
}

const BANDS = [
  { from: 0, to: 3, label: 'Shade', cls: 'bg-sunken' },
  { from: 3, to: 6, label: 'Part sun', cls: 'bg-warn-soft' },
  { from: 6, to: 12, label: 'Full sun', cls: 'bg-accent-soft' },
];

/** 0–12 h scale with the three light bands and the entered hours marked. */
function SunScale({ hours }: { hours: number }) {
  return (
    <div aria-hidden>
      <div className="relative flex h-10 overflow-hidden rounded-ctl border border-line/70">
        {BANDS.map((b) => (
          <div key={b.label} className={cn('flex items-center justify-center text-label font-semibold text-ink-2', b.cls)} style={{ width: `${((b.to - b.from) / 12) * 100}%` }}>
            {b.label}
          </div>
        ))}
        <div className="absolute inset-y-0 w-0.5 bg-ink transition-[left] duration-300 ease-calm" style={{ left: `calc(${(hours / 12) * 100}% - 1px)` }} />
      </div>
      <div className="mt-1.5 flex justify-between text-label tabular text-ink-3">
        {[0, 3, 6, 9, 12].map((h) => (
          <span key={h}>{h} h</span>
        ))}
      </div>
    </div>
  );
}

function PlantFitRow({ plant, hours, count }: { plant: PlantInfo; hours: number; count?: string }) {
  const fit = gardenService.sunFit(plant, hours);
  return (
    <li className="flex flex-col gap-1.5 py-3.5 sm:flex-row sm:items-start sm:gap-4">
      <div className="sm:w-40 sm:shrink-0">
        <p className="font-semibold text-ink">
          {plant.name} <span className="font-normal text-ink-3">· {plant.localName}</span>
        </p>
        {count && <p className="text-label text-ink-3">{count}</p>}
      </div>
      <div className="min-w-0 flex-1">
        <FitChip fit={fit} />
        <p className="mt-1 text-sm text-ink-2">{gardenService.sunFitText(plant, hours)}</p>
      </div>
      <p className="text-label tabular text-ink-3 sm:w-24 sm:text-right">
        needs {plant.sun.min}+ h<br className="hidden sm:block" /> best {plant.sun.ideal}+ h
      </p>
    </li>
  );
}

export default function Sunlight() {
  const g = useGarden();
  const update = useGardenStore((s) => s.updateGarden);
  const uid = useId();
  const [hours, setHours] = useState(g.garden.sunHours);
  useEffect(() => setHours(g.garden.sunHours), [g.garden.id, g.garden.sunHours]);
  const changed = hours !== g.garden.sunHours;
  const suits = gardenService
    .plants()
    .map((p) => ({ p, fit: gardenService.sunFit(p, hours) }))
    .filter((x) => x.fit !== 'poor')
    .sort((a, b) => (a.fit === b.fit ? 0 : a.fit === 'good' ? -1 : 1));

  return (
    <>
      <GardenScenarioNote g={g} />
      <PageHeader eyebrow="Sunlight Adviser" title="Is there enough sun for what you grow?" description="Fruiting plants need the most direct sun; greens and herbs manage with less. Try other hours to compare spots on your roof." />

      <div className="grid gap-5 lg:grid-cols-12">
        <Reveal className="card card-pad lg:col-span-5">
          <div className="flex items-end justify-between gap-3">
            <label htmlFor={`${uid}-h`} className="text-sm font-semibold text-ink-2">
              Hours of direct sun
            </label>
            <output htmlFor={`${uid}-h`} className="tabular text-h1 font-semibold text-ink">
              {hours}
              <span className="ml-1 text-sm font-medium text-ink-3">h</span>
            </output>
          </div>
          <input id={`${uid}-h`} type="range" min={0} max={12} value={hours} onChange={(e) => setHours(Number(e.target.value))} className="mt-3 w-full accent-[rgb(var(--accent))]" />
          <div className="mt-5">
            <SunScale hours={hours} />
          </div>
          <p className="mt-5 text-sm text-ink-3">
            You entered <span className="font-semibold text-ink-2">{g.garden.sunHours} h</span> for this roof. Count the hours a spot is in full sun on a clear day — tanks, stair rooms and neighbouring buildings often shade part of it.
          </p>
          {changed && (
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  update(g.garden.id, { sunHours: hours });
                  toast('Sun hours saved', `${g.garden.name}: ${hours} h of direct sun.`);
                }}
              >
                <Save className="h-4 w-4" aria-hidden /> Save {hours} h to my garden
              </button>
              <button type="button" className="btn-ghost" onClick={() => setHours(g.garden.sunHours)}>
                Back to {g.garden.sunHours} h
              </button>
            </div>
          )}
        </Reveal>

        <Reveal className="card lg:col-span-7" delay={0.05}>
          <div className="px-5 pt-5 sm:px-6 sm:pt-6">
            <h2 className="eyebrow">Your plants at {hours} h</h2>
          </div>
          {g.statuses.length ? (
            <ul className="divide-y divide-line/60 px-5 sm:px-6">
              {g.statuses.map((s) => (
                <PlantFitRow key={s.entry.id} plant={s.plant} hours={hours} count={gardenService.unitLabel(s.plant, s.entry.count)} />
              ))}
            </ul>
          ) : (
            <p className="m-5 rounded-ctl bg-sunken/60 p-4 text-sm text-ink-2 sm:m-6">Add plants in Garden setup to check them against your sun.</p>
          )}
        </Reveal>
      </div>

      <Reveal className="mt-8">
        <h2 className="text-h3">What suits {hours} h of sun</h2>
        <p className="mb-4 text-sm text-ink-3">From the plants in the growing guide. Good fits first.</p>
        {suits.length ? (
          <ul className="flex flex-wrap gap-2">
            {suits.map(({ p, fit }) => (
              <li key={p.id} className="inline-flex items-center gap-2 rounded-full border border-line bg-surface py-1.5 pl-3 pr-1.5 text-sm">
                <span className="font-semibold text-ink">{p.name}</span>
                <span className="text-ink-3">{p.localName}</span>
                <FitChip fit={fit} />
              </li>
            ))}
          </ul>
        ) : (
          <GuideNote>Under 3 hours of direct sun, even greens struggle. Look for a brighter spot, or grow microgreens indoors near a window.</GuideNote>
        )}
      </Reveal>

      <div className="mt-8 space-y-4">
        <GuideNote>Sun bands follow extension guidance: leafy greens can grow with about 3 hours of sun, while fruiting crops like tomato and chilli want the most sun. Per-plant hours are approximate planning values.</GuideNote>
        <GardenSources ids={['ucanr', 'unh', 'clemson']} />
      </div>
    </>
  );
}
