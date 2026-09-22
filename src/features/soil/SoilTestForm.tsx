import { useState, type FormEvent } from 'react';
import type { NutrientKey, SoilTest } from '@/models';
import { todayIso } from '@/lib/utils';

const FIELDS: { key: NutrientKey; label: string; unit: string; min: number; max: number; step: string; core?: boolean }[] = [
  { key: 'ph', label: 'pH', unit: '', min: 3, max: 11, step: '0.1', core: true },
  { key: 'nitrogen', label: 'Nitrogen (N)', unit: 'kg/ha', min: 0, max: 2000, step: '1', core: true },
  { key: 'phosphorus', label: 'Phosphorus (P)', unit: 'kg/ha', min: 0, max: 300, step: '0.1', core: true },
  { key: 'potassium', label: 'Potassium (K)', unit: 'kg/ha', min: 0, max: 2000, step: '1', core: true },
  { key: 'organicCarbon', label: 'Organic carbon', unit: '%', min: 0, max: 5, step: '0.01', core: true },
  { key: 'moisture', label: 'Soil moisture', unit: '%', min: 0, max: 70, step: '1' },
  { key: 'ec', label: 'EC', unit: 'dS/m', min: 0, max: 20, step: '0.01' },
  { key: 'sulphur', label: 'Sulphur (S)', unit: 'ppm', min: 0, max: 200, step: '0.1' },
  { key: 'zinc', label: 'Zinc (Zn)', unit: 'ppm', min: 0, max: 20, step: '0.01' },
];

export function SoilTestForm({ onSubmit, onCancel }: { onSubmit: (values: SoilTest['values'], date: string) => void; onCancel: () => void }) {
  const [date, setDate] = useState(todayIso());
  const [raw, setRaw] = useState<Partial<Record<NutrientKey, string>>>({});
  const [errors, setErrors] = useState<Partial<Record<NutrientKey | 'date' | 'form', string>>>({});

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    const values: SoilTest['values'] = {};
    for (const f of FIELDS) {
      const v = raw[f.key]?.trim();
      if (!v) continue;
      const n = Number(v);
      if (!Number.isFinite(n) || n < f.min || n > f.max) next[f.key] = `Enter a value between ${f.min} and ${f.max}.`;
      else values[f.key] = n;
    }
    if (!date) next.date = 'Add the test date.';
    else if (date > todayIso()) next.date = 'The test date cannot be in the future.';
    const core = FIELDS.filter((f) => f.core && values[f.key] !== undefined).length;
    if (core < 3) next.form = 'Enter at least 3 of pH, N, P, K and organic carbon — fewer is not enough for a reliable soil assessment.';
    setErrors(next);
    if (Object.keys(next).length === 0) onSubmit(values, date);
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      <div className="max-w-[14rem]">
        <label htmlFor="st-date" className="field-label">
          Test date
        </label>
        <input id="st-date" type="date" className="field" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} aria-invalid={Boolean(errors.date)} />
        {errors.date && <p className="mt-1 text-sm text-danger">{errors.date}</p>}
      </div>
      <fieldset>
        <legend className="eyebrow mb-3">Main values</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          {FIELDS.filter((f) => f.core).map((f) => (
            <NumberField key={f.key} f={f} value={raw[f.key] ?? ''} error={errors[f.key]} onChange={(v) => setRaw((r) => ({ ...r, [f.key]: v }))} />
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="eyebrow mb-3">Optional</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          {FIELDS.filter((f) => !f.core).map((f) => (
            <NumberField key={f.key} f={f} value={raw[f.key] ?? ''} error={errors[f.key]} onChange={(v) => setRaw((r) => ({ ...r, [f.key]: v }))} />
          ))}
        </div>
      </fieldset>
      {errors.form && (
        <p className="rounded-ctl bg-warn-soft px-4 py-3 text-sm text-warn" role="alert">
          {errors.form}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn-primary">
          Save soil test
        </button>
      </div>
    </form>
  );
}

function NumberField({ f, value, error, onChange }: { f: (typeof FIELDS)[number]; value: string; error?: string; onChange: (v: string) => void }) {
  const id = `st-${f.key}`;
  return (
    <div>
      <label htmlFor={id} className="field-label">
        {f.label} {f.unit && <span className="text-ink-3">({f.unit})</span>}
      </label>
      <input
        id={id}
        inputMode="decimal"
        type="number"
        step={f.step}
        min={f.min}
        max={f.max}
        className="field tabular"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-err` : undefined}
      />
      {error && (
        <p id={`${id}-err`} className="mt-1 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
