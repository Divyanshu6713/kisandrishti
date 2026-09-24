import { Check } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import type { ContainerKind, GardenDraft, PlantId } from '@/models';
import { cn } from '@/lib/utils';
import { useLang, useT } from '@/i18n';
import { gardenService } from '@/services/gardenService';

const CONTAINERS: { v: ContainerKind; k: 'ob.roof.potClay' | 'ob.roof.potPlastic' | 'ob.roof.potBags' }[] = [
  { v: 'clay', k: 'ob.roof.potClay' },
  { v: 'plastic', k: 'ob.roof.potPlastic' },
  { v: 'grow-bag', k: 'ob.roof.potBags' },
];

/** Describe a rooftop: space, observed sun hours, pots and plants. Nothing is pre-filled as fact. */
export function GardenForm({ onSubmit, submitLabel, initial }: { onSubmit: (d: GardenDraft) => void; submitLabel?: string; initial?: Partial<GardenDraft> }) {
  const t = useT();
  const lang = useLang();
  const uid = useId();
  const [d, setD] = useState<GardenDraft>({ name: '', location: '', areaSqFt: 0, sunHours: 5, containers: 'clay', plantIds: [], ...initial });
  const [errors, setErrors] = useState<ReturnType<typeof gardenService.validate>>({});
  const set = <K extends keyof GardenDraft>(k: K, v: GardenDraft[K]) => setD((x) => ({ ...x, [k]: v }));
  const togglePlant = (id: PlantId) => set('plantIds', d.plantIds.includes(id) ? d.plantIds.filter((p) => p !== id) : [...d.plantIds, id]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const errs = gardenService.validate(d);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    onSubmit({ ...d, name: d.name.trim(), location: d.location.trim() });
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`${uid}-name`} className="field-label">
            {t('ob.roof.name')}
          </label>
          <input id={`${uid}-name`} className="field" placeholder={t('ob.roof.namePh')} value={d.name} maxLength={60} onChange={(e) => set('name', e.target.value)} aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? `${uid}-name-e` : undefined} />
          {errors.name && (
            <p id={`${uid}-name-e`} className="mt-1 text-sm text-danger">
              {t('ob.roof.errName')}
            </p>
          )}
        </div>
        <div>
          <label htmlFor={`${uid}-city`} className="field-label">
            {t('ob.roof.city')}
          </label>
          <input id={`${uid}-city`} className="field" placeholder={t('ob.roof.cityPh')} value={d.location} maxLength={60} onChange={(e) => set('location', e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={`${uid}-area`} className="field-label">
            {t('ob.roof.area')}
          </label>
          <input
            id={`${uid}-area`}
            type="number"
            inputMode="numeric"
            min={4}
            max={5000}
            className="field tabular sm:max-w-[12rem]"
            value={d.areaSqFt || ''}
            onChange={(e) => set('areaSqFt', Number(e.target.value))}
            aria-invalid={Boolean(errors.area)}
            aria-describedby={`${uid}-area-h`}
          />
          <p id={`${uid}-area-h`} className={cn('mt-1 text-sm', errors.area ? 'text-danger' : 'text-ink-3')}>
            {errors.area ? t('ob.roof.errArea') : t('ob.roof.areaHint')}
          </p>
        </div>
      </div>

      <div>
        <div className="flex items-end justify-between gap-3">
          <label htmlFor={`${uid}-sun`} className="field-label mb-0">
            {t('ob.roof.sun')}
          </label>
          <output htmlFor={`${uid}-sun`} className="tabular text-h3 font-semibold text-ink">
            {t('ob.roof.hours', { n: d.sunHours })}
          </output>
        </div>
        <input id={`${uid}-sun`} type="range" min={0} max={12} step={1} value={d.sunHours} onChange={(e) => set('sunHours', Number(e.target.value))} className="mt-3 w-full accent-[rgb(var(--accent))]" aria-describedby={`${uid}-sun-h`} />
        <p id={`${uid}-sun-h`} className="mt-1 text-sm text-ink-3">
          {t('ob.roof.sunHint')}
        </p>
      </div>

      <fieldset>
        <legend className="field-label">{t('ob.roof.pots')}</legend>
        <div className="flex flex-wrap gap-2">
          {CONTAINERS.map((c) => (
            <button key={c.v} type="button" aria-pressed={d.containers === c.v} onClick={() => set('containers', c.v)} className={cn('btn border', d.containers === c.v ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-surface text-ink-2 hover:bg-sunken')}>
              {d.containers === c.v && <Check className="h-4 w-4" aria-hidden />}
              {t(c.k)}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="field-label">{t('ob.roof.plants')}</legend>
        <p className="-mt-1 mb-3 text-sm text-ink-3">{t('ob.roof.plantsHint')}</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {gardenService.plants().map((p) => {
            const on = d.plantIds.includes(p.id);
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={on}
                onClick={() => togglePlant(p.id)}
                className={cn('flex min-h-[3.5rem] items-center gap-2 rounded-ctl border px-3 py-2 text-left transition-colors', on ? 'border-accent bg-accent-soft/70' : 'border-line bg-surface hover:bg-sunken')}
              >
                <span className={cn('grid h-5 w-5 shrink-0 place-items-center rounded-[5px] border', on ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface')} aria-hidden>
                  {on && <Check className="h-3.5 w-3.5" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold leading-tight text-ink">{lang === 'hi' ? p.nameHi : p.name}</span>
                  <span className="block text-label text-ink-3">{lang === 'hi' ? p.name : p.localName}</span>
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <button type="submit" className="btn-primary btn-xl w-full sm:w-auto">
        {submitLabel ?? t('ob.roof.save')}
      </button>
    </form>
  );
}
