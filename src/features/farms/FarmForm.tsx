import { useEffect, useState, type FormEvent } from 'react';
import type { CropInfo, FarmDraft, FarmInput, FarmingMethod, IrrigationType, SoilType } from '@/models';
import { cn, todayIso } from '@/lib/utils';
import { cropAnalysisService, validateFarm } from '@/services';

const SOILS: { v: SoilType; l: string }[] = [
  { v: 'loamy', l: 'Loamy' },
  { v: 'clay-loam', l: 'Clay loam' },
  { v: 'clay', l: 'Clay' },
  { v: 'sandy-loam', l: 'Sandy loam' },
  { v: 'sandy', l: 'Sandy' },
  { v: 'silty', l: 'Silty' },
];
const IRRIGATION: { v: IrrigationType; l: string }[] = [
  { v: 'tubewell', l: 'Tubewell' },
  { v: 'canal', l: 'Canal' },
  { v: 'drip', l: 'Drip' },
  { v: 'sprinkler', l: 'Sprinkler' },
  { v: 'rainfed', l: 'Rainfed' },
];
const METHODS: { v: FarmingMethod; l: string }[] = [
  { v: 'organic', l: 'Organic' },
  { v: 'transitioning', l: 'Moving to organic' },
  { v: 'natural', l: 'Natural farming' },
  { v: 'conventional', l: 'Conventional' },
];
const INPUTS: { v: FarmInput; l: string }[] = [
  { v: 'cattle-dung', l: 'Cattle dung' },
  { v: 'crop-residue', l: 'Crop residue' },
  { v: 'vermicompost', l: 'Vermicompost' },
  { v: 'biofertilizers', l: 'Biofertilizers' },
  { v: 'neem', l: 'Neem' },
  { v: 'green-manure-seed', l: 'Green-manure seed' },
];

const EMPTY: FarmDraft = {
  name: '',
  location: '',
  areaAcres: 0,
  crop: 'wheat',
  variety: '',
  sowingDate: '',
  soilType: 'loamy',
  irrigation: 'tubewell',
  method: 'organic',
  availableInputs: [],
};

export function FarmForm({ onSubmit, onCancel }: { onSubmit: (d: FarmDraft) => void; onCancel: () => void }) {
  const [d, setD] = useState<FarmDraft>(EMPTY);
  const [crops, setCrops] = useState<CropInfo[]>([]);
  const [errors, setErrors] = useState<ReturnType<typeof validateFarm>>({});
  useEffect(() => {
    cropAnalysisService.crops().then(setCrops);
  }, []);
  const set = <K extends keyof FarmDraft>(k: K, v: FarmDraft[K]) => setD((x) => ({ ...x, [k]: v }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const errs = validateFarm(d);
    setErrors(errs);
    if (Object.keys(errs).length === 0) onSubmit(d);
  };

  const err = (k: keyof FarmDraft) => errors[k] && <p className="mt-1 text-sm text-danger">{errors[k]}</p>;

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="field-label" htmlFor="f-name">
            Farm name
          </label>
          <input id="f-name" className="field" placeholder="e.g. North field" value={d.name} onChange={(e) => set('name', e.target.value)} aria-invalid={Boolean(errors.name)} data-autofocus />
          {err('name')}
        </div>
        <div>
          <label className="field-label" htmlFor="f-loc">
            Location
          </label>
          <input id="f-loc" className="field" placeholder="Village, district" value={d.location} onChange={(e) => set('location', e.target.value)} aria-invalid={Boolean(errors.location)} />
          {err('location')}
        </div>
        <div>
          <label className="field-label" htmlFor="f-area">
            Area (acres)
          </label>
          <input id="f-area" type="number" inputMode="decimal" min={0} step="0.1" className="field tabular" value={d.areaAcres || ''} onChange={(e) => set('areaAcres', Number(e.target.value))} aria-invalid={Boolean(errors.areaAcres)} />
          {err('areaAcres')}
        </div>
        <div>
          <label className="field-label" htmlFor="f-crop">
            Crop
          </label>
          <select id="f-crop" className="field" value={d.crop} onChange={(e) => set('crop', e.target.value as FarmDraft['crop'])}>
            {crops.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.localName})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor="f-var">
            Variety <span className="text-ink-3">(optional)</span>
          </label>
          <input id="f-var" className="field" placeholder="e.g. HD 3086" value={d.variety} onChange={(e) => set('variety', e.target.value)} />
        </div>
        <div>
          <label className="field-label" htmlFor="f-sow">
            Sowing date
          </label>
          <input id="f-sow" type="date" max={todayIso()} className="field" value={d.sowingDate} onChange={(e) => set('sowingDate', e.target.value)} aria-invalid={Boolean(errors.sowingDate)} />
          {err('sowingDate')}
        </div>
        <div>
          <label className="field-label" htmlFor="f-soil">
            Soil type
          </label>
          <select id="f-soil" className="field" value={d.soilType} onChange={(e) => set('soilType', e.target.value as SoilType)}>
            {SOILS.map((s) => (
              <option key={s.v} value={s.v}>
                {s.l}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor="f-irr">
            Irrigation
          </label>
          <select id="f-irr" className="field" value={d.irrigation} onChange={(e) => set('irrigation', e.target.value as IrrigationType)}>
            {IRRIGATION.map((s) => (
              <option key={s.v} value={s.v}>
                {s.l}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor="f-method">
            Farming method
          </label>
          <select id="f-method" className="field" value={d.method} onChange={(e) => set('method', e.target.value as FarmingMethod)}>
            {METHODS.map((s) => (
              <option key={s.v} value={s.v}>
                {s.l}
              </option>
            ))}
          </select>
        </div>
      </div>
      <fieldset>
        <legend className="field-label">Inputs available on the farm</legend>
        <div className="flex flex-wrap gap-2">
          {INPUTS.map((i) => {
            const on = d.availableInputs.includes(i.v);
            return (
              <button
                key={i.v}
                type="button"
                aria-pressed={on}
                onClick={() => set('availableInputs', on ? d.availableInputs.filter((x) => x !== i.v) : [...d.availableInputs, i.v])}
                className={cn('rounded-full border px-3 py-1.5 text-sm font-medium transition-colors', on ? 'border-accent bg-accent-soft text-accent' : 'border-line text-ink-2 hover:bg-sunken')}
              >
                {i.l}
              </button>
            );
          })}
        </div>
      </fieldset>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" className="btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn-primary">
          Save and create profile
        </button>
      </div>
    </form>
  );
}
