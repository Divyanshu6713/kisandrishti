import { Minus, Plus, Save } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';
import { useGarden } from '@/hooks/useGarden';
import { gardenService } from '@/services/gardenService';
import { useGardenStore } from '@/state/gardenStore';
import { toast } from '@/state/toastStore';
import { EmptyState, PageHeader, Stat } from '@/components/ui/primitives';
import { Reveal } from '@/components/ui/motion';
import { GardenScenarioNote, GardenSources, GuideNote } from '@/features/garden/parts';

const SEGMENT = ['bg-accent', 'bg-clay', 'bg-earth', 'bg-info', 'bg-warn', 'bg-accent/60', 'bg-clay/60', 'bg-earth/60'];

export function Stepper({ value, onChange, label, min = 1, max = 99 }: { value: number; onChange: (v: number) => void; label: string; min?: number; max?: number }) {
  return (
    <div className="inline-flex items-center rounded-ctl border border-line bg-surface" role="group" aria-label={label}>
      <button type="button" className="grid h-10 w-10 place-items-center rounded-l-ctl text-ink-2 hover:bg-sunken disabled:opacity-40" onClick={() => onChange(value - 1)} disabled={value <= min} aria-label={`Fewer — ${label}`}>
        <Minus className="h-4 w-4" aria-hidden />
      </button>
      <span className="min-w-[2.5rem] text-center font-semibold tabular" aria-live="polite">
        {value}
      </span>
      <button type="button" className="grid h-10 w-10 place-items-center rounded-r-ctl text-ink-2 hover:bg-sunken disabled:opacity-40" onClick={() => onChange(value + 1)} disabled={value >= max} aria-label={`More — ${label}`}>
        <Plus className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

export default function Quantity() {
  const g = useGarden();
  const update = useGardenStore((s) => s.updateGarden);
  const uid = useId();
  const [area, setArea] = useState(g.garden.areaSqFt);
  useEffect(() => setArea(g.garden.areaSqFt), [g.garden.id, g.garden.areaSqFt]);
  const { used, available, free, litres, lines, roomFor } = g.space;
  const over = used > available;
  const setCount = (entryId: string, count: number) => update(g.garden.id, { plants: g.garden.plants.map((p) => (p.id === entryId ? { ...p, count } : p)) });

  return (
    <>
      <GardenScenarioNote g={g} />
      <PageHeader eyebrow="Quantity Analyser" title="Plan your garden" description="How much of your roof your plants take, how much potting mix they need, and what still fits." />

      {lines.length === 0 ? (
        <EmptyState title="No plants yet" body="Add your first plant to plan space and potting mix." action={<Link to="/app/garden/setup" className="btn-primary">Add plants</Link>} />
      ) : (
        <div className="grid gap-5 lg:grid-cols-12">
          <Reveal className="card card-pad lg:col-span-7">
            <div className="grid grid-cols-3 gap-4">
              <Stat label="Space used" value={used} unit="sq ft" tone={over ? 'bad' : undefined} />
              <Stat label="Available" value={available} unit="sq ft" />
              <Stat label="Potting mix" value={`~${litres}`} unit="L" />
            </div>

            <div className="mt-6" aria-hidden>
              <div className="flex h-4 overflow-hidden rounded-full bg-sunken">
                {lines.map((l, i) => (
                  <div key={l.entry.id} className={cn('h-full border-r border-surface last:border-r-0', SEGMENT[i % SEGMENT.length])} style={{ width: `${Math.min(100, (l.sqFt / Math.max(available, used)) * 100)}%` }} />
                ))}
              </div>
              {over && <p className="mt-2 text-sm font-medium text-danger">About {Math.round((used - available) * 10) / 10} sq ft more than the space you entered.</p>}
            </div>

            <ul className="mt-6 divide-y divide-line/60">
              {lines.map((l, i) => (
                <li key={l.entry.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                  <span className={cn('h-3 w-3 shrink-0 rounded-sm', SEGMENT[i % SEGMENT.length])} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-ink">
                      {l.plant.name} <span className="font-normal text-ink-3">· {l.plant.localName}</span>
                    </span>
                    <span className="block text-label text-ink-3">
                      {l.sqFt} sq ft · ~{l.litres} L mix
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <Stepper value={l.entry.count} onChange={(v) => setCount(l.entry.id, v)} label={`${l.plant.name} ${l.plant.unit === 'pot' ? 'pots' : 'sq ft of bed'}`} />
                    <span className="w-12 text-label text-ink-3">{l.plant.unit === 'pot' ? 'pots' : 'sq ft'}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Reveal>

          <div className="space-y-5 lg:col-span-5">
            <Reveal className="card card-pad" delay={0.05}>
              <h2 className="eyebrow">Room for more</h2>
              {free > 0 ? (
                <ul className="mt-3 space-y-2">
                  {roomFor.map((r) => (
                    <li key={r.plant.id} className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="text-ink-2">{r.plant.name}</span>
                      <span className="font-semibold tabular text-ink">{r.more > 0 ? (r.plant.unit === 'pot' ? `${r.more} more pots` : `${r.more} more sq ft`) : 'no room'}</span>
                    </li>
                  ))}
                  <li className="pt-1 text-label text-ink-3">Each line is on its own — {free} sq ft free in total.</li>
                </ul>
              ) : (
                <p className="mt-2 text-sm text-ink-2">No free space left at the numbers you entered.</p>
              )}
            </Reveal>
            <Reveal className="card card-pad" delay={0.1}>
              <label htmlFor={`${uid}-area`} className="eyebrow">
                Space you can use
              </label>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input id={`${uid}-area`} type="number" min={4} max={5000} inputMode="numeric" className="field w-32 tabular" value={area || ''} onChange={(e) => setArea(Number(e.target.value))} />
                <span className="text-sm text-ink-3">sq ft</span>
                {area !== g.garden.areaSqFt && area >= 4 && area <= 5000 && (
                  <button
                    type="button"
                    className="btn-primary ml-auto"
                    onClick={() => {
                      update(g.garden.id, { areaSqFt: area });
                      toast('Space saved', `${g.garden.name}: ${area} sq ft.`);
                    }}
                  >
                    <Save className="h-4 w-4" aria-hidden /> Save
                  </button>
                )}
              </div>
              <p className="mt-2 text-label text-ink-3">Only the part of the roof where pots can stand — leave paths to walk and water.</p>
            </Reveal>
          </div>
        </div>
      )}

      <Reveal className="mt-8 card overflow-hidden">
        <div className="px-5 pt-5 sm:px-6 sm:pt-6">
          <h2 className="eyebrow">Planning assumptions</h2>
          <p className="mt-1.5 text-sm text-ink-2">Approximate values the analyser uses — per pot for fruiting plants, per sq ft of trough for greens.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="mt-3 w-full min-w-[32rem] text-left text-sm">
            <thead className="text-label text-ink-3">
              <tr className="border-b border-line/70">
                <th className="px-5 py-2 font-semibold sm:px-6">Plant</th>
                <th className="px-3 py-2 font-semibold">Counted in</th>
                <th className="px-3 py-2 font-semibold">Space each</th>
                <th className="px-3 py-2 font-semibold">Pot / depth</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {gardenService.plants().map((p) => (
                <tr key={p.id}>
                  <td className="px-5 py-2.5 font-medium text-ink sm:px-6">{p.name}</td>
                  <td className="px-3 py-2.5 text-ink-2">{p.unit === 'pot' ? 'pots' : 'sq ft of bed'}</td>
                  <td className="px-3 py-2.5 tabular text-ink-2">{p.unit === 'pot' ? `${p.container.footprintSqFt} sq ft` : '1 sq ft'}</td>
                  <td className="px-3 py-2.5 tabular text-ink-2">{p.container.minLitres ? `${p.container.minLitres} L+, ${p.container.minDepthCm} cm deep` : `${p.container.minDepthCm} cm deep`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Reveal>

      <div className="mt-8 space-y-4">
        <GuideNote>Space per pot includes room for leaves to spread. Bigger pots hold water longer — useful on a hot roof.</GuideNote>
        <GardenSources ids={['unh', 'clemson']} />
      </div>
    </>
  );
}
