import { Plus, Save, Trash2 } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import type { ContainerKind, PlantId, RooftopGarden } from '@/models';
import { cn, todayIso, uid as makeId } from '@/lib/utils';
import { useGarden } from '@/hooks/useGarden';
import { CONTAINER_LABEL, gardenService } from '@/services/gardenService';
import { useGardenStore } from '@/state/gardenStore';
import { toast } from '@/state/toastStore';
import { Modal } from '@/components/ui/overlay';
import { PageHeader } from '@/components/ui/primitives';
import { Reveal } from '@/components/ui/motion';
import { GardenForm } from '@/features/garden/GardenForm';
import { GardenScenarioNote } from '@/features/garden/parts';
import { Stepper } from './Quantity';

type About = Pick<RooftopGarden, 'name' | 'location' | 'areaSqFt' | 'sunHours' | 'containers'>;

function AboutCard({ garden }: { garden: RooftopGarden }) {
  const update = useGardenStore((s) => s.updateGarden);
  const id = useId();
  const pick = (g: RooftopGarden): About => ({ name: g.name, location: g.location, areaSqFt: g.areaSqFt, sunHours: g.sunHours, containers: g.containers });
  const [d, setD] = useState<About>(pick(garden));
  useEffect(() => setD(pick(garden)), [garden]);
  const errors = gardenService.validate(d);
  const dirty = JSON.stringify(d) !== JSON.stringify(pick(garden));
  const set = <K extends keyof About>(k: K, v: About[K]) => setD((x) => ({ ...x, [k]: v }));
  return (
    <Reveal className="card card-pad">
      <h2 className="eyebrow">About this rooftop</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="field-label" htmlFor={`${id}-n`}>
            Garden name
          </label>
          <input id={`${id}-n`} className="field" value={d.name} maxLength={60} onChange={(e) => set('name', e.target.value)} aria-invalid={Boolean(errors.name)} />
        </div>
        <div>
          <label className="field-label" htmlFor={`${id}-l`}>
            City or town
          </label>
          <input id={`${id}-l`} className="field" value={d.location} maxLength={60} onChange={(e) => set('location', e.target.value)} />
        </div>
        <div>
          <label className="field-label" htmlFor={`${id}-a`}>
            Space for pots (sq ft)
          </label>
          <input id={`${id}-a`} type="number" min={4} max={5000} className="field tabular" value={d.areaSqFt || ''} onChange={(e) => set('areaSqFt', Number(e.target.value))} aria-invalid={Boolean(errors.area)} />
        </div>
        <div>
          <label className="field-label" htmlFor={`${id}-s`}>
            Direct sun: <span className="font-semibold text-ink">{d.sunHours} h</span>
          </label>
          <input id={`${id}-s`} type="range" min={0} max={12} value={d.sunHours} onChange={(e) => set('sunHours', Number(e.target.value))} className="mt-3 w-full accent-[rgb(var(--accent))]" />
        </div>
        <fieldset className="sm:col-span-2">
          <legend className="field-label">Mostly</legend>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(CONTAINER_LABEL) as ContainerKind[]).map((c) => (
              <button key={c} type="button" aria-pressed={d.containers === c} onClick={() => set('containers', c)} className={cn('btn border', d.containers === c ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-surface text-ink-2 hover:bg-sunken')}>
                {CONTAINER_LABEL[c]}
              </button>
            ))}
          </div>
        </fieldset>
      </div>
      {dirty && (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn-primary"
            disabled={Object.keys(errors).length > 0}
            onClick={() => {
              update(garden.id, { ...d, name: d.name.trim(), location: d.location.trim() });
              toast('Rooftop updated', d.name.trim());
            }}
          >
            <Save className="h-4 w-4" aria-hidden /> Save changes
          </button>
          <button type="button" className="btn-ghost" onClick={() => setD(pick(garden))}>
            Cancel
          </button>
          {Object.keys(errors).length > 0 && <span className="text-sm text-danger">Name is required and space must be 4–5000 sq ft.</span>}
        </div>
      )}
    </Reveal>
  );
}

function PlantsCard({ garden }: { garden: RooftopGarden }) {
  const update = useGardenStore((s) => s.updateGarden);
  const id = useId();
  const [adding, setAdding] = useState<PlantId>('tomato');
  const setPlants = (plants: RooftopGarden['plants']) => update(garden.id, { plants });
  const patch = (entryId: string, p: Partial<RooftopGarden['plants'][number]>) => setPlants(garden.plants.map((x) => (x.id === entryId ? { ...x, ...p } : x)));
  return (
    <Reveal className="card overflow-hidden" delay={0.05}>
      <div className="px-5 pt-5 sm:px-6 sm:pt-6">
        <h2 className="eyebrow">Plants &amp; planting dates</h2>
        <p className="mt-1.5 text-sm text-ink-2">Planting dates drive stages and harvest dates. Leave a date empty and nothing is guessed.</p>
      </div>
      {garden.plants.length ? (
        <ul className="mt-3 divide-y divide-line/60">
          {garden.plants.map((entry) => {
            const plant = gardenService.plant(entry.plantId);
            return (
              <li key={entry.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-3.5 sm:px-6">
                <div className="min-w-[9rem] flex-1">
                  <p className="font-semibold text-ink">
                    {plant.name} <span className="font-normal text-ink-3">· {plant.localName}</span>
                  </p>
                  <p className="text-label text-ink-3">{plant.startsFrom === 'transplant' ? 'Date transplanted' : plant.startsFrom === 'cutting' ? 'Date planted (cutting)' : 'Date sown'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Stepper value={entry.count} onChange={(v) => patch(entry.id, { count: v })} label={`${plant.name} ${plant.unit === 'pot' ? 'pots' : 'sq ft of bed'}`} />
                  <span className="w-10 text-label text-ink-3">{plant.unit === 'pot' ? 'pots' : 'sq ft'}</span>
                </div>
                <label className="sr-only" htmlFor={`${id}-${entry.id}`}>
                  {plant.name} planting date
                </label>
                <input id={`${id}-${entry.id}`} type="date" max={todayIso()} className="field w-auto py-2" value={entry.plantedOn ?? ''} onChange={(e) => patch(entry.id, { plantedOn: e.target.value || null })} />
                <button type="button" className="btn-ghost p-2.5 text-ink-3 hover:text-danger" onClick={() => setPlants(garden.plants.filter((x) => x.id !== entry.id))} aria-label={`Remove ${plant.name}`}>
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mx-5 mt-4 rounded-ctl bg-sunken/60 p-4 text-sm text-ink-2 sm:mx-6">Add your first plant to start receiving garden guidance.</p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-line/70 px-5 py-4 sm:px-6">
        <label htmlFor={`${id}-add`} className="sr-only">
          Plant to add
        </label>
        <select id={`${id}-add`} className="field w-auto py-2" value={adding} onChange={(e) => setAdding(e.target.value as PlantId)}>
          {gardenService.plants().map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.localName})
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            const plant = gardenService.plant(adding);
            setPlants([...garden.plants, { id: makeId('gp'), plantId: adding, count: plant.unit === 'pot' ? 2 : 4, plantedOn: null }]);
            toast('Plant added', `${plant.name} — add its planting date to see stages.`);
          }}
        >
          <Plus className="h-4 w-4" aria-hidden /> Add plant
        </button>
      </div>
    </Reveal>
  );
}

export default function GardenSetup() {
  const g = useGarden();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const addGarden = useGardenStore((s) => s.addGarden);
  const removeGarden = useGardenStore((s) => s.removeGarden);
  const [confirm, setConfirm] = useState(false);

  if (params.get('new') === '1')
    return (
      <>
        <PageHeader eyebrow="Garden setup" title="Add a rooftop" description="Space, sunlight and what you grow. You can add planting dates next." />
        <Reveal className="card card-pad max-w-3xl">
          <GardenForm
            submitLabel="Save rooftop"
            onSubmit={(d) => {
              const garden = gardenService.create(d);
              addGarden(garden);
              toast('Rooftop saved', `${garden.name} is selected. Add planting dates to see stages.`);
              setParams({});
            }}
          />
        </Reveal>
      </>
    );

  return (
    <>
      <GardenScenarioNote g={g} />
      <PageHeader
        eyebrow="Garden setup"
        title={g.garden.name}
        description={g.garden.isDemo ? 'This is the demo rooftop. Your changes stay in this browser; “Reset demo rooftop” in the menu undoes them.' : 'Your rooftop, saved in this browser.'}
        action={
          <button type="button" className="btn-secondary" onClick={() => setParams({ new: '1' })}>
            <Plus className="h-4 w-4" aria-hidden /> Add a rooftop
          </button>
        }
      />
      <div className="grid gap-5 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <AboutCard garden={g.garden} />
        </div>
        <div className="lg:col-span-7">
          <PlantsCard garden={g.garden} />
        </div>
      </div>
      {!g.garden.isDemo && (
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-card border border-danger/25 bg-danger-soft/40 p-5">
          <div>
            <p className="font-semibold text-ink">Remove this rooftop</p>
            <p className="text-sm text-ink-2">Deletes its plants, dates and done marks from this browser.</p>
          </div>
          <button type="button" className="btn-danger" onClick={() => setConfirm(true)}>
            <Trash2 className="h-4 w-4" aria-hidden /> Remove
          </button>
        </div>
      )}
      <Modal open={confirm} onClose={() => setConfirm(false)} title="Remove this rooftop?">
        <p className="text-ink-2">
          <span className="font-semibold text-ink">{g.garden.name}</span> and its plants will be removed from this browser. The demo rooftop stays.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={() => setConfirm(false)}>
            Keep rooftop
          </button>
          <button
            type="button"
            className="btn-danger"
            onClick={() => {
              const name = g.garden.name;
              removeGarden(g.garden.id);
              setConfirm(false);
              toast('Rooftop removed', name, 'info');
              navigate('/app/garden');
            }}
          >
            Remove rooftop
          </button>
        </div>
      </Modal>
    </>
  );
}
