import { useState, type FormEvent } from 'react';
import type { Level, ObservationKind } from '@/models';

/** Structured field note: the tag lets the engines read it, the note keeps the farmer's words. */
const KINDS: { kind: ObservationKind; label: string; tag: string }[] = [
  { kind: 'leaf-colour', label: 'Leaves look pale / yellowing', tag: 'pale-leaves' },
  { kind: 'pest', label: 'Pests seen (e.g. aphids)', tag: 'aphid' },
  { kind: 'growth', label: 'Growth looks good and even', tag: 'good-stand' },
  { kind: 'irrigation', label: 'Irrigated the field', tag: 'irrigated' },
  { kind: 'input-applied', label: 'Applied an organic input', tag: 'input' },
];

export function ObservationForm({ onSubmit, onCancel }: { onSubmit: (o: { kind: ObservationKind; tag: string; note: string; severity: Level }) => void; onCancel: () => void }) {
  const [kindIdx, setKindIdx] = useState(0);
  const [note, setNote] = useState('');
  const [severity, setSeverity] = useState<Level>('low');
  const [error, setError] = useState('');
  const k = KINDS[kindIdx];
  const needsSeverity = k.kind === 'leaf-colour' || k.kind === 'pest';

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (note.trim().length < 3) {
      setError('Add a short note — where in the field, and what you saw.');
      return;
    }
    onSubmit({ kind: k.kind, tag: k.tag, note: note.trim(), severity: needsSeverity ? severity : 'low' });
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <fieldset>
        <legend className="field-label">What did you see?</legend>
        <div className="grid gap-2">
          {KINDS.map((opt, i) => (
            <label key={opt.tag} className="flex cursor-pointer items-center gap-3 rounded-ctl border border-line px-3.5 py-2.5 text-sm transition-colors has-[:checked]:border-accent has-[:checked]:bg-accent-soft/50">
              <input type="radio" name="kind" className="accent-[rgb(var(--accent))]" checked={kindIdx === i} onChange={() => setKindIdx(i)} />
              {opt.label}
            </label>
          ))}
        </div>
      </fieldset>
      {needsSeverity && (
        <fieldset>
          <legend className="field-label">How widespread?</legend>
          <div className="flex gap-2">
            {(['low', 'medium', 'high'] as Level[]).map((s) => (
              <label key={s} className="flex-1 cursor-pointer rounded-ctl border border-line px-3 py-2 text-center text-sm capitalize transition-colors has-[:checked]:border-accent has-[:checked]:bg-accent-soft/50">
                <input type="radio" name="sev" className="sr-only" checked={severity === s} onChange={() => setSeverity(s)} />
                {s === 'low' ? 'A few plants' : s === 'medium' ? 'A patch' : 'Widespread'}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <div>
        <label htmlFor="obs-note" className="field-label">
          Note
        </label>
        <textarea id="obs-note" rows={3} className="field" placeholder="e.g. Older leaves pale in the north-east corner" value={note} onChange={(e) => setNote(e.target.value)} aria-invalid={Boolean(error)} />
        {error && <p className="mt-1 text-sm text-danger">{error}</p>}
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn-primary">
          Save observation
        </button>
      </div>
    </form>
  );
}
