import { Archive, ArchiveRestore, ArrowLeft, Download, FlaskConical, Rocket, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import type { Evaluation } from '@/models/mlAdmin';
import { mlAdminApi } from '@/services/mlAdmin/api';
import { Modal } from '@/components/ui/overlay';
import { Disclosure, SectionTitle } from '@/components/ui/primitives';
import { toast } from '@/state/toastStore';
import { DeployDialog } from './deploy';
import { ErrorNote, KV, Loading, Metric, ModelStatusBadge, NA, errorMessage, fmtBytes, fmtDate, fmtDuration, fmtInt, fmtNum, fmtPct, useAdminData } from './shared';

/** Real confusion matrix from the test predictions. Cell shade = share of that row's (true class's) images. */
export function ConfusionMatrix({ cm }: { cm: Evaluation['confusion_matrix'] }) {
  const n = cm.labels.length;
  const rowSums = cm.matrix.map((r) => r.reduce((a, b) => a + b, 0));
  const compact = n > 12;
  return (
    <div className="-mx-2 overflow-x-auto px-2">
      <table className="border-separate border-spacing-0.5 text-label tabular" aria-label="Confusion matrix: rows are true classes, columns are predicted classes">
        <thead>
          <tr>
            <th className="p-1 text-left font-medium text-ink-3">True ↓ / Predicted →</th>
            {cm.display_labels.map((l, j) => (
              <th key={j} scope="col" title={l} className="h-28 min-w-[2rem] p-1 align-bottom font-medium text-ink-2">
                <span className="inline-block max-h-28 overflow-hidden text-ellipsis whitespace-nowrap [writing-mode:vertical-rl] rotate-180">{compact ? `${j + 1}. ${l}` : l}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cm.matrix.map((row, i) => (
            <tr key={i}>
              <th scope="row" title={cm.display_labels[i]} className="max-w-[14rem] truncate p-1 pr-2 text-left font-medium text-ink-2">
                {compact ? `${i + 1}. ` : ''}
                {cm.display_labels[i]}
              </th>
              {row.map((v, j) => {
                const share = rowSums[i] ? v / rowSums[i] : 0;
                const diag = i === j;
                return (
                  <td
                    key={j}
                    title={`True ${cm.display_labels[i]} → predicted ${cm.display_labels[j]}: ${v} of ${rowSums[i]}`}
                    className="h-8 min-w-[2rem] rounded-[4px] px-1 text-center"
                    style={{ background: v === 0 ? 'rgb(var(--sunken))' : `rgb(var(${diag ? '--accent' : '--danger'}) / ${0.12 + share * 0.78})`, color: share > 0.55 ? 'rgb(var(--on-accent))' : 'rgb(var(--ink))' }}
                  >
                    {v}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-label text-ink-3">Green diagonal = correct; red = mistakes. Hover a cell for details.</p>
    </div>
  );
}

export default function ModelDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { data: m, error, loading, reload, setData } = useAdminData(() => mlAdminApi.model(id), [id], (d) => (d?.status === 'training' ? 5000 : null));
  const [deploying, setDeploying] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [actionErr, setActionErr] = useState<string | null>(null);

  if (loading && !m) return <Loading />;
  if (error && !m) return <ErrorNote action={<button type="button" className="btn-secondary" onClick={() => void reload()}>Retry</button>}>{errorMessage(error)}</ErrorNote>;
  if (!m) return null;
  const ev = m.evaluation;
  const canTest = (m.status === 'ready' || m.status === 'deployed') && m.artifact_present;

  const act = async (fn: () => Promise<unknown>, done: string) => {
    setActionErr(null);
    try {
      await fn();
      toast(done);
      await reload();
    } catch (e) {
      setActionErr(errorMessage(e));
    }
  };

  return (
    <div className="space-y-6">
      <Link to="/app/admin/ml/models" className="btn-ghost -ml-3 px-3 py-1.5 text-sm">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Models
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow mb-1">Model version</p>
          <h2 className="text-h2">
            {m.name} v{m.version}
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <ModelStatusBadge status={m.status} />
            {m.is_active && <span className="chip bg-accent-soft text-accent">In production</span>}
            {m.deploy_block?.code === 'dataset_permission' && <span className="chip bg-warn-soft text-warn">Blocked by dataset permission</span>}
          </div>
          {m.status_detail && m.status !== 'ready' && <p className="mt-2 text-sm text-ink-2">{m.status_detail}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {(m.status === 'ready') && (
            <button type="button" className="btn-primary" onClick={() => setDeploying(true)} disabled={Boolean(m.deploy_block && !m.deploy_block.overridable)}>
              <Rocket className="h-4 w-4" aria-hidden /> Deploy
            </button>
          )}
          {canTest && (
            <Link to={`/app/admin/ml/test?model=${m.id}`} className="btn-secondary">
              <FlaskConical className="h-4 w-4" aria-hidden /> Test
            </Link>
          )}
          {m.artifact_present && (
            <button type="button" className="btn-secondary" onClick={() => void act(() => mlAdminApi.exportModel(m.id, m.version), 'Export started')}>
              <Download className="h-4 w-4" aria-hidden /> Export
            </button>
          )}
          {m.status === 'archived' ? (
            <button type="button" className="btn-ghost" onClick={() => void act(() => mlAdminApi.unarchiveModel(m.id), 'Model restored')}>
              <ArchiveRestore className="h-4 w-4" aria-hidden /> Restore
            </button>
          ) : (
            !m.is_active && m.status !== 'training' && (
              <button type="button" className="btn-ghost" onClick={() => void act(() => mlAdminApi.archiveModel(m.id), 'Model archived')}>
                <Archive className="h-4 w-4" aria-hidden /> Archive
              </button>
            )
          )}
          {!m.is_active && m.deployment_count === 0 && m.status !== 'training' && (
            <button type="button" className="btn-ghost text-danger" onClick={() => setDeleting(true)}>
              <Trash2 className="h-4 w-4" aria-hidden /> Delete
            </button>
          )}
        </div>
      </header>
      {actionErr && <ErrorNote>{actionErr}</ErrorNote>}
      {m.deploy_block?.code === 'dataset_permission' && (
        <p className="rounded-ctl border border-warn/30 bg-warn-soft/50 p-3 text-sm text-ink-2">
          {m.deploy_block.message} <Link to={`/app/admin/ml/datasets/${m.dataset_version_id}`} className="font-semibold text-accent">Open the dataset record</Link>
        </p>
      )}
      {m.permission_warning && <p className="text-sm text-warn">{m.permission_warning}</p>}

      {ev ? (
        <>
          <section className="card card-pad">
            <SectionTitle title="Test-set evaluation" hint={`Best checkpoint (epoch ${ev.checkpoint_epoch ?? NA}, ${ev.selection}) evaluated once on ${fmtInt(ev.test_images)} held-out test images on ${fmtDate(ev.evaluated_at)}.`} />
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Metric label="Test accuracy" value={fmtPct(ev.accuracy)} hint={ev.definitions.accuracy} />
              <Metric label="Macro precision" value={fmtPct(ev.macro.precision)} hint={`average over ${ev.macro.classes_averaged} classes`} />
              <Metric label="Macro recall" value={fmtPct(ev.macro.recall)} hint="every class weighted equally" />
              <Metric label="Macro F1" value={fmtPct(ev.macro.f1)} hint="every class weighted equally" />
              <Metric label="Weighted precision" value={fmtPct(ev.weighted.precision)} hint="weighted by test images per class" />
              <Metric label="Weighted recall" value={fmtPct(ev.weighted.recall)} />
              <Metric label="Weighted F1" value={fmtPct(ev.weighted.f1)} />
              <Metric label="Top-3 accuracy" value={fmtPct(ev.top3_accuracy)} hint="true class among the 3 most likely" />
            </div>
            {(ev.classes_without_test_images.length > 0 || ev.classes_never_predicted.length > 0) && (
              <div className="mt-4 space-y-1 text-sm text-warn">
                {ev.classes_without_test_images.length > 0 && <p>No test images (not evaluated): {ev.classes_without_test_images.join(', ')}</p>}
                {ev.classes_never_predicted.length > 0 && <p>Never predicted on the test set (precision undefined, shown as 0): {ev.classes_never_predicted.join(', ')}</p>}
              </div>
            )}
          </section>

          <section className="card card-pad">
            <SectionTitle title="Confusion matrix" hint={`${ev.confusion_matrix.rows} × ${ev.confusion_matrix.columns}, counts of test images.`} />
            <ConfusionMatrix cm={ev.confusion_matrix} />
            {ev.most_confused.length > 0 && (
              <div className="mt-5">
                <p className="eyebrow mb-2">Most common confusions</p>
                <ul className="space-y-1 text-sm text-ink-2">
                  {ev.most_confused.slice(0, 8).map((c, i) => (
                    <li key={i}>
                      <span className="font-medium text-ink">{c.true_display}</span> → predicted as {c.predicted_display}: {c.count} image{c.count === 1 ? '' : 's'}
                      {c.share_of_true !== null && ` (${fmtPct(c.share_of_true)} of its test images)`}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <section className="card card-pad">
            <SectionTitle title="Per-class metrics" />
            <div className="-mx-2 overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm tabular">
                <thead className="text-label text-ink-3">
                  <tr>
                    {['Class', 'Precision', 'Recall', 'F1', 'Test images', 'Predicted as this'].map((h) => (
                      <th key={h} className="px-2 py-2 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {ev.per_class.map((c) => (
                    <tr key={c.class_id}>
                      <td className="px-2 py-2 font-sans">
                        <span className="font-medium">{c.display_name}</span>
                        <span className="block text-label text-ink-3">{c.class_id}</span>
                      </td>
                      <td className="px-2 py-2">{c.precision_defined ? fmtPct(c.precision) : `${fmtPct(0)}*`}</td>
                      <td className="px-2 py-2">{c.has_test_images ? fmtPct(c.recall) : NA}</td>
                      <td className="px-2 py-2">{fmtPct(c.f1)}</td>
                      <td className="px-2 py-2">{c.support}</td>
                      <td className="px-2 py-2">{c.predicted}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-label text-ink-3">* never predicted, so precision is undefined and shown as 0.</p>
          </section>
        </>
      ) : (
        <section className="card card-pad">
          <p className="text-sm text-ink-2">
            {m.status === 'training' ? 'Metrics appear when training and test evaluation finish.' : 'No evaluation is available for this model — it did not complete evaluation.'}
            {' '}
            <Link to={`/app/admin/ml/training/${m.training_job_id}`} className="font-semibold text-accent">Open training run #{m.job_number}</Link>
          </p>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card card-pad">
          <SectionTitle title="Lineage" hint="Every model points to the exact dataset version and split it was trained on." />
          <KV
            rows={[
              ['Dataset version', <Link to={`/app/admin/ml/datasets/${m.dataset_version_id}`} className="text-accent hover:underline">{m.dataset_name} v{m.dataset_version}</Link>],
              ['Dataset permission', m.permission_label],
              ['Split', m.split_strategy === 'predefined' ? 'Provided folders' : `Stratified, seed ${m.split_seed}`],
              ['Training run', <Link to={`/app/admin/ml/training/${m.training_job_id}`} className="text-accent hover:underline">#{m.job_number}</Link>],
              ['Train / Val / Test images', `${fmtInt(m.training_images)} / ${fmtInt(m.validation_images)} / ${fmtInt(m.test_images)}`],
              ['Deployments', m.deployments.length ? m.deployments.map((d) => `#${d.number} ${d.action} (${d.status})`).join(', ') : 'Never deployed'],
              ['Model ID', <code className="text-label">{m.id}</code>],
            ]}
          />
        </section>
        <section className="card card-pad">
          <SectionTitle title="Training and artefact" />
          <KV
            rows={[
              ['Architecture', `${m.architecture} (${m.framework} ${m.framework_version ?? ''})`],
              ['Epochs', `${m.epochs_completed ?? NA} of ${m.epochs_configured}${m.early_stopped ? ' (early stopping)' : ''}; best ${m.best_epoch ?? NA}`],
              ['Batch · LR · image', `${m.batch_size} · ${m.learning_rate} · ${m.image_size}px`],
              ['Seed', m.random_seed ?? NA],
              ['Trained on', m.train_device ? `${m.train_device.toUpperCase()} · ${m.train_device_name}` : NA],
              ['Training time', fmtDuration(m.training_duration_s)],
              ['Trained at', fmtDate(m.trained_at)],
              ['Model size', fmtBytes(m.model_bytes)],
              ['Weights SHA-256', m.model_sha256 ? <code className="break-all text-label">{m.model_sha256}</code> : NA],
              ['Test loss', ev ? fmtNum(ev.test_loss) : NA],
            ]}
          />
          <Disclosure summary="Preprocessing contract and classes" className="mt-4 border-t border-line pt-4">
            <pre className="max-h-64 overflow-auto rounded-ctl bg-sunken p-3 text-label">{JSON.stringify({ preprocessing: m.preprocessing, augmentation: m.augmentation }, null, 2)}</pre>
            <ol className="mt-3 list-decimal space-y-0.5 pl-5 text-sm text-ink-2">
              {m.classes.map((c) => (
                <li key={c.id}>
                  {c.display_name} <code className="text-label text-ink-3">{c.id}</code>
                </li>
              ))}
            </ol>
          </Disclosure>
        </section>
      </div>

      <DeployDialog model={m} open={deploying} onClose={() => setDeploying(false)} onDone={() => void reload()} />
      <Modal open={deleting} onClose={() => setDeleting(false)} title={`Delete model v${m.version}?`}>
        <p className="text-sm text-ink-2">The weights, manifest and evaluation files are removed permanently. The training run record stays for history. Models that were ever deployed cannot be deleted (archive them instead).</p>
        <label htmlFor="mdel" className="field-label mt-4">Type <strong>{m.version}</strong> to confirm</label>
        <input id="mdel" className="field" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            className="btn-danger"
            disabled={confirmText !== m.version}
            onClick={async () => {
              try {
                await mlAdminApi.deleteModel(m.id, confirmText);
                toast('Model deleted');
                navigate('/app/admin/ml/models');
              } catch (e) {
                setDeleting(false);
                setActionErr(errorMessage(e));
                setData(m);
              }
            }}
          >
            Delete permanently
          </button>
          <button type="button" className="btn-ghost" onClick={() => setDeleting(false)}>Cancel</button>
        </div>
      </Modal>
    </div>
  );
}
