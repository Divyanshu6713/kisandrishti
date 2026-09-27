import { Boxes, GitCompare, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import type { ModelSummary } from '@/models/mlAdmin';
import { mlAdminApi } from '@/services/mlAdmin/api';
import { EmptyState, SectionTitle } from '@/components/ui/primitives';
import { ErrorNote, Loading, ModelStatusBadge, NA, errorMessage, fmtBytes, fmtDate, fmtDuration, fmtInt, fmtPct, useAdminData } from './shared';

function Compare({ models, onClose }: { models: ModelSummary[]; onClose: () => void }) {
  const rows: [string, (m: ModelSummary) => string][] = [
    ['Status', (m) => m.status],
    ['Dataset', (m) => `${m.dataset_name} v${m.dataset_version}`],
    ['Split', (m) => (m.split_strategy === 'predefined' ? 'Provided folders' : `Stratified, seed ${m.split_seed}`)],
    ['Architecture', (m) => m.architecture],
    ['Classes', (m) => String(m.class_count)],
    ['Train / Val / Test images', (m) => `${fmtInt(m.training_images)} / ${fmtInt(m.validation_images)} / ${fmtInt(m.test_images)}`],
    ['Epochs (done / set)', (m) => `${m.epochs_completed ?? NA} / ${m.epochs_configured ?? NA}`],
    ['Batch · LR · image size', (m) => `${m.batch_size} · ${m.learning_rate} · ${m.image_size}px`],
    ['Test accuracy', (m) => fmtPct(m.test_accuracy)],
    ['Macro precision / recall / F1', (m) => `${fmtPct(m.precision_macro)} / ${fmtPct(m.recall_macro)} / ${fmtPct(m.f1_macro)}`],
    ['Weighted F1', (m) => fmtPct(m.f1_weighted)],
    ['Top-3 accuracy', (m) => fmtPct(m.top3_accuracy)],
    ['Training time', (m) => fmtDuration(m.training_duration_s)],
    ['Model size', (m) => fmtBytes(m.model_bytes)],
    ['Trained', (m) => fmtDate(m.trained_at)],
  ];
  const sameTest = new Set(models.map((m) => `${m.dataset_version_id}:${m.split_id}`)).size === 1;
  return (
    <section className="card card-pad">
      <SectionTitle title="Compare models" action={<button type="button" className="btn-ghost p-2" onClick={onClose} aria-label="Close comparison"><X className="h-4 w-4" /></button>} />
      {!sameTest && <p className="mb-3 text-sm text-warn">These models were evaluated on different test sets, so their metrics are not directly comparable.</p>}
      <div className="-mx-2 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th className="px-2 py-2 text-label font-medium text-ink-3"><span className="sr-only">Field</span></th>
              {models.map((m) => (
                <th key={m.id} className="px-2 py-2 font-semibold">v{m.version}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map(([label, get]) => (
              <tr key={label}>
                <td className="px-2 py-2 text-ink-3">{label}</td>
                {models.map((m) => (
                  <td key={m.id} className="px-2 py-2 tabular">{get(m)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function Models() {
  const { data, error, loading, reload } = useAdminData(() => mlAdminApi.models(), [], (d) => (d?.models.some((m) => m.status === 'training') ? 5000 : null));
  const [picked, setPicked] = useState<string[]>([]);
  const [comparing, setComparing] = useState(false);

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorNote action={<button type="button" className="btn-secondary" onClick={() => void reload()}>Retry</button>}>{errorMessage(error)}</ErrorNote>;
  if (!data) return null;
  if (data.models.length === 0)
    return <EmptyState icon={<Boxes className="h-5 w-5" />} title="No models yet" body="Models appear here as soon as a training run starts." action={<Link to="/app/admin/ml/training" className="btn-primary">Start training</Link>} />;

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id].slice(-4)));

  return (
    <div className="space-y-6">
      {comparing && picked.length >= 2 && <Compare models={data.models.filter((m) => picked.includes(m.id))} onClose={() => setComparing(false)} />}
      <section className="card card-pad">
        <SectionTitle
          title="Model versions"
          hint="Metrics are from each model's held-out test set. Macro = every class weighted equally."
          action={
            <button type="button" className="btn-secondary" disabled={picked.length < 2} onClick={() => setComparing(true)}>
              <GitCompare className="h-4 w-4" aria-hidden /> Compare ({picked.length})
            </button>
          }
        />
        <div className="-mx-2 overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead className="text-label text-ink-3">
              <tr>
                <th className="px-2 py-2 font-medium"><span className="sr-only">Select for comparison</span></th>
                {['Version', 'Architecture', 'Dataset', 'Trained', 'Test acc.', 'Precision', 'Recall', 'F1', 'Classes', 'Size', 'Status'].map((h) => (
                  <th key={h} className="px-2 py-2 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.models.map((m) => (
                <tr key={m.id}>
                  <td className="px-2 py-2.5">
                    <input type="checkbox" className="h-4 w-4" aria-label={`Compare v${m.version}`} checked={picked.includes(m.id)} onChange={() => toggle(m.id)} />
                  </td>
                  <td className="px-2 py-2.5">
                    <Link to={`/app/admin/ml/models/${m.id}`} className="font-semibold text-accent hover:underline">v{m.version}</Link>
                    <p className="text-label text-ink-3">{m.name}</p>
                  </td>
                  <td className="px-2 py-2.5 text-ink-2">{m.architecture}</td>
                  <td className="px-2 py-2.5 text-ink-2">{m.dataset_name} v{m.dataset_version}</td>
                  <td className="px-2 py-2.5 text-ink-2">{fmtDate(m.trained_at)}</td>
                  <td className="px-2 py-2.5 tabular">{fmtPct(m.test_accuracy)}</td>
                  <td className="px-2 py-2.5 tabular">{fmtPct(m.precision_macro)}</td>
                  <td className="px-2 py-2.5 tabular">{fmtPct(m.recall_macro)}</td>
                  <td className="px-2 py-2.5 tabular">{fmtPct(m.f1_macro)}</td>
                  <td className="px-2 py-2.5 tabular">{m.class_count}</td>
                  <td className="px-2 py-2.5 tabular">{fmtBytes(m.model_bytes)}</td>
                  <td className="px-2 py-2.5">
                    <div className="flex flex-col items-start gap-1">
                      <ModelStatusBadge status={m.status} />
                      {m.is_active && <span className="text-label font-semibold text-accent">In production</span>}
                      {m.deploy_block?.code === 'dataset_permission' && <span className="text-label text-warn">Blocked by dataset permission</span>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
