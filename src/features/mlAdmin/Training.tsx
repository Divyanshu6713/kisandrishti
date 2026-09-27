import { Cpu, Play } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import type { TrainingConfig, TrainingOptions } from '@/models/mlAdmin';
import { mlAdminApi } from '@/services/mlAdmin/api';
import { Disclosure, SectionTitle } from '@/components/ui/primitives';
import { toast } from '@/state/toastStore';
import { cn } from '@/lib/utils';
import { ErrorNote, JobStatusBadge, Loading, errorMessage, fmtDate, fmtInt, fmtPct, isJobRunning, useAdminData } from './shared';

function Field({ id, label, hint, children }: { id: string; label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="field-label">{label}</label>
      {children}
      {hint && <p className="mt-1 text-label text-ink-3">{hint}</p>}
    </div>
  );
}

function Toggle({ id, label, checked, onChange, hint }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label htmlFor={id} className="flex items-start gap-2.5 text-sm">
      <input id={id} type="checkbox" className="mt-0.5 h-4 w-4" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="font-medium text-ink">{label}</span>
        {hint && <span className="block text-label text-ink-3">{hint}</span>}
      </span>
    </label>
  );
}

function ConfigForm({ opts, datasets }: { opts: TrainingOptions; datasets: Awaited<ReturnType<typeof mlAdminApi.datasets>>['datasets'] }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const usable = useMemo(
    () => datasets.flatMap((d) => d.versions.filter((v) => v.status === 'ready' || v.status === 'ready_with_warnings').map((v) => ({ ...v, dataset_name: d.name }))),
    [datasets],
  );
  const [dsv, setDsv] = useState(params.get('dataset') ?? usable[0]?.id ?? '');
  const [splits, setSplits] = useState<{ id: string; label: string }[]>([]);
  const [split, setSplit] = useState(params.get('split') ?? '');
  const [cfg, setCfg] = useState<TrainingConfig>(opts.defaults);
  const [name, setName] = useState('Disease Model');
  const [version, setVersion] = useState(opts.suggested_version.version);
  const [versionHint, setVersionHint] = useState(opts.suggested_version.reason);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof TrainingConfig>(k: K, v: TrainingConfig[K]) => setCfg((c) => ({ ...c, [k]: v }));

  useEffect(() => {
    if (!dsv) return;
    let alive = true;
    mlAdminApi.version(dsv).then((v) => {
      if (!alive) return;
      const list = (v.splits ?? []).filter((s) => s.train_count && s.val_count && s.test_count).map((s) => ({
        id: s.id,
        label: `${s.strategy === 'predefined' ? 'Provided folders' : `Stratified ${s.train_pct}/${s.val_pct}/${s.test_pct}, seed ${s.seed}`} — ${s.train_count}/${s.val_count}/${s.test_count}`,
      }));
      setSplits(list);
      setSplit((cur) => (list.some((s) => s.id === cur) ? cur : list[0]?.id ?? ''));
    });
    return () => {
      alive = false;
    };
  }, [dsv]);

  useEffect(() => {
    mlAdminApi.trainingOptions(dsv || undefined, cfg.architecture).then((o) => {
      setVersion(o.suggested_version.version);
      setVersionHint(o.suggested_version.reason);
    }).catch(() => undefined);
  }, [dsv, cfg.architecture]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!dsv || !split) return setErr('Choose a validated dataset version and a split.');
    setBusy(true);
    try {
      const job = await mlAdminApi.createJob({ dataset_version_id: dsv, split_id: split, model_version: version.trim(), model_name: name.trim() || 'Disease Model', config: cfg });
      toast(`Training run #${job.number} queued`, 'The worker will pick it up. Progress updates live.');
      navigate(`/app/admin/ml/training/${job.id}`);
    } catch (e2) {
      setErr(errorMessage(e2));
      setBusy(false);
    }
  };

  const lim = (k: string) => opts.limits[k] ?? { min: null, max: undefined };
  const num = (k: keyof TrainingConfig, label: string, step: number | 'any', hint?: string) => (
    <Field id={`tc-${k}`} label={label} hint={hint}>
      <input id={`tc-${k}`} type="number" className="field tabular" step={step} min={lim(k).min ?? undefined} max={lim(k).max} value={cfg[k] as number} onChange={(e) => set(k, Number(e.target.value) as never)} />
    </Field>
  );

  if (usable.length === 0)
    return (
      <div className="card card-pad">
        <p className="text-sm text-ink-2">
          No validated dataset yet. <Link to="/app/admin/ml/datasets" className="font-semibold text-accent">Upload a dataset</Link> first.
        </p>
      </div>
    );

  return (
    <form onSubmit={submit} className="card card-pad space-y-6" aria-label="Training configuration">
      <SectionTitle title="New training run" hint="Transfer learning from an ImageNet-pretrained network. Settings are validated again on the server." />
      {!opts.worker.online && (
        <p className="rounded-ctl border border-warn/30 bg-warn-soft/50 p-3 text-sm text-ink-2">
          No training worker is online. The job will wait in the queue until one starts (<code>python -m kd_backend.worker</code>).
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <Field id="tc-dsv" label="Dataset version">
          <select id="tc-dsv" className="field" value={dsv} onChange={(e) => setDsv(e.target.value)}>
            {usable.map((v) => (
              <option key={v.id} value={v.id}>
                {v.dataset_name} v{v.version} — {fmtInt(v.total_images)} images, {v.class_count} classes
              </option>
            ))}
          </select>
        </Field>
        <Field id="tc-split" label="Split" hint={splits.length === 0 ? <>This version has no complete split. <Link to={`/app/admin/ml/datasets/${dsv}`} className="text-accent">Generate one</Link>.</> : undefined}>
          <select id="tc-split" className="field" value={split} onChange={(e) => setSplit(e.target.value)} disabled={splits.length === 0}>
            {splits.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </Field>
        <Field id="tc-name" label="Model name">
          <input id="tc-name" className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </Field>
        <Field id="tc-version" label="Model version" hint={`Suggested: ${versionHint} You can change it.`}>
          <input id="tc-version" className="field tabular" value={version} onChange={(e) => setVersion(e.target.value)} placeholder="1.0" />
        </Field>
      </div>

      <fieldset>
        <legend className="field-label">Architecture</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {opts.architectures.map((a) => (
            <label key={a.id} className={cn('choice cursor-pointer flex-col gap-1 p-3.5', cfg.architecture === a.id && 'border-accent shadow-lift')}>
              <span className="flex items-center gap-2">
                <input type="radio" name="arch" value={a.id} checked={cfg.architecture === a.id} onChange={() => set('architecture', a.id)} />
                <span className="font-semibold">{a.label}</span>
                <span className="ml-auto text-label text-ink-3">~{a.params_m} M params · ~{a.size_mb} MB</span>
              </span>
              <span className="pl-6 text-label text-ink-3">{a.note}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {num('epochs', 'Epochs', 1)}
        {num('batch_size', 'Batch size', 1, 'Lower it if the GPU runs out of memory')}
        {num('learning_rate', 'Learning rate', 'any')}
        {num('image_size', 'Image size (px)', 16)}
        {num('seed', 'Random seed', 1)}
        {num('early_stopping_patience', 'Early-stopping patience', 1, 'Epochs without validation-loss improvement')}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Toggle id="tc-pre" label="Pretrained weights" checked={cfg.pretrained} onChange={(v) => set('pretrained', v)} hint="ImageNet weights, downloaded once from download.pytorch.org" />
        <Toggle id="tc-es" label="Early stopping" checked={cfg.early_stopping} onChange={(v) => set('early_stopping', v)} hint="Best checkpoint is always kept" />
        <Toggle id="tc-aug" label="Data augmentation" checked={cfg.augmentation} onChange={(v) => set('augmentation', v)} hint="Crops, flips, small rotations, mild light changes; training images only" />
      </div>

      <Disclosure summary="Advanced settings">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {num('weight_decay', 'Weight decay', 'any')}
          {num('label_smoothing', 'Label smoothing', 0.01)}
          {num('freeze_backbone_epochs', 'Freeze backbone (epochs)', 1, 'Train only the new head first')}
          <Field id="tc-sched" label="LR schedule">
            <select id="tc-sched" className="field" value={cfg.lr_schedule} onChange={(e) => set('lr_schedule', e.target.value as TrainingConfig['lr_schedule'])}>
              <option value="cosine">Cosine decay</option>
              <option value="plateau">Reduce on plateau</option>
              <option value="none">Constant</option>
            </select>
          </Field>
          <Field id="tc-dev" label="Device">
            <select id="tc-dev" className="field" value={cfg.device} onChange={(e) => set('device', e.target.value as TrainingConfig['device'])}>
              <option value="auto">Auto (GPU if available)</option>
              <option value="cuda">GPU (CUDA) only</option>
              <option value="cpu">CPU only</option>
            </select>
          </Field>
          <Field id="tc-nw" label="Data-loader workers" hint="Blank = server default">
            <input id="tc-nw" type="number" min={0} max={16} className="field tabular" value={cfg.num_workers ?? ''} onChange={(e) => set('num_workers', e.target.value === '' ? null : Number(e.target.value))} />
          </Field>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Toggle id="tc-cw" label="Class-weighted loss" checked={cfg.class_weighting} onChange={(v) => set('class_weighting', v)} hint="Helps imbalanced datasets" />
          <Toggle id="tc-amp" label="Mixed precision (GPU)" checked={cfg.mixed_precision} onChange={(v) => set('mixed_precision', v)} hint="Faster, less memory; ignored on CPU" />
        </div>
      </Disclosure>

      {err && <ErrorNote>{err}</ErrorNote>}
      <button type="submit" className="btn-primary btn-lg" disabled={busy || !split}>
        <Play className="h-4 w-4" aria-hidden /> Start training
      </button>
    </form>
  );
}

export default function Training() {
  const opts = useAdminData(() => Promise.all([mlAdminApi.trainingOptions(), mlAdminApi.datasets()]), []);
  const jobs = useAdminData(() => mlAdminApi.jobs(), [], (d) => (d?.jobs.some((j) => isJobRunning(j.status)) ? 4000 : 20000));

  return (
    <div className="space-y-6">
      {opts.data ? <ConfigForm opts={opts.data[0]} datasets={opts.data[1].datasets} /> : opts.loading ? <Loading /> : <ErrorNote>{errorMessage(opts.error)}</ErrorNote>}

      <section className="card card-pad">
        <SectionTitle title="Training runs" />
        {!jobs.data && !jobs.loading && <ErrorNote>{errorMessage(jobs.error)}</ErrorNote>}
        {jobs.data && jobs.data.jobs.length === 0 && <p className="text-sm text-ink-3">No training runs yet.</p>}
        {jobs.data && jobs.data.jobs.length > 0 && (
          <div className="-mx-2 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-label text-ink-3">
                <tr>
                  <th className="px-2 py-2 font-medium">Run</th>
                  <th className="px-2 py-2 font-medium">Model</th>
                  <th className="px-2 py-2 font-medium">Dataset</th>
                  <th className="px-2 py-2 font-medium">Architecture</th>
                  <th className="px-2 py-2 font-medium">Status</th>
                  <th className="px-2 py-2 font-medium">Progress</th>
                  <th className="px-2 py-2 font-medium">Started</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {jobs.data.jobs.map((j) => (
                  <tr key={j.id}>
                    <td className="px-2 py-2.5">
                      <Link to={`/app/admin/ml/training/${j.id}`} className="inline-flex items-center gap-1.5 font-semibold text-accent hover:underline">
                        <Cpu className="h-3.5 w-3.5" aria-hidden /> #{j.number}
                      </Link>
                    </td>
                    <td className="px-2 py-2.5">{j.model_version ? `v${j.model_version}` : 'deleted'}</td>
                    <td className="px-2 py-2.5 text-ink-2">{j.dataset_name} v{j.dataset_version}</td>
                    <td className="px-2 py-2.5 text-ink-2">{j.config.architecture}</td>
                    <td className="px-2 py-2.5"><JobStatusBadge status={j.status} /></td>
                    <td className="px-2 py-2.5 tabular text-ink-2">{j.status === 'completed' ? '100%' : fmtPct(j.overall_progress, 0)} · epoch {j.current_epoch}/{j.total_epochs}</td>
                    <td className="px-2 py-2.5 text-ink-2">{fmtDate(j.started_at ?? j.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
