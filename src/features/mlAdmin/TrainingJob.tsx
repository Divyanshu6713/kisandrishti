import { ArrowLeft, ArrowRight, Square } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import type { EpochRecord } from '@/models/mlAdmin';
import { mlAdminApi } from '@/services/mlAdmin/api';
import { LineChart } from '@/components/charts/LineChart';
import { SectionTitle } from '@/components/ui/primitives';
import { toast } from '@/state/toastStore';
import { ErrorNote, JobStatusBadge, KV, LiveProgress, Loading, Metric, NA, elapsedSince, errorMessage, fmtDate, fmtDuration, fmtInt, fmtNum, fmtPct, isJobRunning, useAdminData } from './shared';

const PHASE = { train: 'Training batches', val: 'Validation batches', test: 'Test-set batches' } as const;

function Curves({ epochs }: { epochs: EpochRecord[] }) {
  if (epochs.length === 0) return <p className="text-sm text-ink-3">Curves appear after the first completed epoch.</p>;
  const labels = epochs.map((e) => `Epoch ${e.epoch}`);
  const losses = epochs.flatMap((e) => [e.train_loss, e.val_loss]).filter((v): v is number => v !== null && Number.isFinite(v));
  const maxLoss = Math.max(0.1, ...losses) * 1.1;
  const r = (v: number | null, k = 1) => (v === null || !Number.isFinite(v) ? null : Number((v * k).toFixed(4)));
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div>
        <p className="eyebrow mb-2">Loss vs epoch</p>
        <LineChart
          ariaLabel="Training and validation loss per epoch"
          labels={labels}
          min={0}
          max={Number(maxLoss.toFixed(2))}
          series={[
            { name: 'Training loss', color: 'rgb(var(--info))', values: epochs.map((e) => r(e.train_loss)) },
            { name: 'Validation loss', color: 'rgb(var(--warn))', values: epochs.map((e) => r(e.val_loss)) },
          ]}
        />
      </div>
      <div>
        <p className="eyebrow mb-2">Accuracy vs epoch (%)</p>
        <LineChart
          ariaLabel="Training and validation accuracy per epoch"
          labels={labels}
          min={0}
          max={100}
          unit="%"
          series={[
            { name: 'Training accuracy', color: 'rgb(var(--info))', values: epochs.map((e) => r(e.train_accuracy, 100)) },
            { name: 'Validation accuracy', color: 'rgb(var(--accent))', values: epochs.map((e) => r(e.val_accuracy, 100)) },
          ]}
        />
      </div>
    </div>
  );
}

export default function TrainingJob() {
  const { id = '' } = useParams();
  const [cancelling, setCancelling] = useState(false);
  const { data: j, error, loading, reload, setData } = useAdminData(() => mlAdminApi.job(id), [id], (d) => (d && isJobRunning(d.status) ? 2000 : null));

  if (loading && !j) return <Loading />;
  if (error && !j) return <ErrorNote action={<button type="button" className="btn-secondary" onClick={() => void reload()}>Retry</button>}>{errorMessage(error)}</ErrorNote>;
  if (!j) return null;
  const running = isJobRunning(j.status);
  const epochs = j.epochs ?? [];
  const last = epochs[epochs.length - 1];
  const worker = j.worker;

  const cancel = async () => {
    setCancelling(true);
    try {
      setData(await mlAdminApi.cancelJob(j.id));
      toast('Cancellation requested', 'The worker stops at the next batch and cleans up.', 'info');
    } catch (e) {
      toast('Could not cancel', errorMessage(e), 'error');
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="space-y-6">
      <Link to="/app/admin/ml/training" className="btn-ghost -ml-3 px-3 py-1.5 text-sm">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Training
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow mb-1">Training run #{j.number}</p>
          <h2 className="text-h2">
            {j.config.model_name} v{j.config.model_version}
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <JobStatusBadge status={j.status} />
            {j.status_detail && <span className="text-sm text-ink-2">{j.status_detail}</span>}
          </div>
        </div>
        <div className="flex gap-2">
          {running && j.status !== 'cancel_requested' && (
            <button type="button" className="btn-secondary" onClick={() => void cancel()} disabled={cancelling}>
              <Square className="h-4 w-4" aria-hidden /> Cancel training
            </button>
          )}
          {j.status === 'completed' && j.model_id && (
            <Link to={`/app/admin/ml/models/${j.model_id}`} className="btn-primary">
              Evaluation report <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          )}
        </div>
      </header>

      {j.status === 'queued' && worker && !worker.online && (
        <p className="rounded-ctl border border-warn/30 bg-warn-soft/50 p-3 text-sm text-ink-2">Waiting in the queue — no training worker is online. Start one with <code>python -m kd_backend.worker</code>.</p>
      )}
      {j.status === 'failed' && <ErrorNote>{j.error_message ?? 'The training run failed.'}</ErrorNote>}
      {j.status === 'cancelled' && <p className="rounded-ctl bg-sunken p-3 text-sm text-ink-2">Cancelled{j.cancel_requested_by ? ` by ${j.cancel_requested_by}` : ''}. No model was produced; temporary checkpoints were removed.</p>}

      <section className="card card-pad" aria-live="polite">
        <SectionTitle title="Progress" />
        <div className="mb-2 flex justify-between text-sm">
          <span className="text-ink-2">Overall</span>
          <span className="tabular font-semibold">{j.status === 'completed' ? '100%' : fmtPct(j.overall_progress, 0)}</span>
        </div>
        <LiveProgress label="Overall training progress" value={j.status === 'completed' ? 100 : j.overall_progress * 100} tone={j.status === 'failed' ? 'bad' : 'good'} />
        {running && j.live && (
          <div className="mt-4">
            <div className="mb-1.5 flex justify-between text-label text-ink-3">
              <span>{PHASE[j.live.phase]}</span>
              <span className="tabular">
                {j.live.batch} / {j.live.batches}
              </span>
            </div>
            <LiveProgress label={PHASE[j.live.phase]} value={(100 * j.live.batch) / Math.max(1, j.live.batches)} tone="ok" />
          </div>
        )}
        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Metric label="Epoch" value={`${j.current_epoch} / ${j.total_epochs}`} hint={j.early_stopped ? 'stopped early' : undefined} />
          <Metric label="Elapsed" value={fmtDuration(elapsedSince(j.started_at, j.finished_at ?? (running ? null : j.updated_at)))} />
          <Metric label="Training loss" value={last ? fmtNum(last.train_loss) : j.live?.running_loss !== undefined ? fmtNum(j.live.running_loss) : NA} hint={last ? `epoch ${last.epoch}` : j.live?.running_loss !== undefined ? 'running, this epoch' : undefined} />
          <Metric label="Validation loss" value={last ? fmtNum(last.val_loss) : NA} hint={last ? `epoch ${last.epoch}` : undefined} />
          <Metric label="Training accuracy" value={last ? fmtPct(last.train_accuracy) : j.live?.running_accuracy !== undefined ? fmtPct(j.live.running_accuracy) : NA} />
          <Metric label="Validation accuracy" value={last ? fmtPct(last.val_accuracy) : NA} />
          <Metric label="Learning rate" value={j.live?.learning_rate !== undefined ? j.live.learning_rate.toExponential(2) : last?.learning_rate ? last.learning_rate.toExponential(2) : NA} />
          <Metric label="Best epoch" value={j.best_epoch ?? NA} hint="lowest validation loss" />
        </div>
        {running && j.live?.images_per_second ? <p className="mt-3 text-label text-ink-3">Throughput: {j.live.images_per_second.toFixed(0)} images/s (measured this epoch)</p> : null}
      </section>

      <section className="card card-pad">
        <SectionTitle title="Training curves" hint="Measured values from each completed epoch." />
        <Curves epochs={epochs} />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card card-pad">
          <SectionTitle title="Dataset" />
          <KV
            rows={[
              ['Dataset', <Link to={`/app/admin/ml/datasets/${j.dataset_version_id}`} className="text-accent hover:underline">{j.dataset_name} v{j.dataset_version}</Link>],
              ['Total images', fmtInt(j.total_images)],
              ['Classes', fmtInt(j.class_count)],
              ['Split', j.split_strategy === 'predefined' ? 'Provided folders' : `Stratified, seed ${j.split_seed}`],
              ['Train / Validation / Test', `${fmtInt(j.train_count)} / ${fmtInt(j.val_count)} / ${fmtInt(j.test_count)}`],
            ]}
          />
        </section>
        <section className="card card-pad">
          <SectionTitle title="Configuration" />
          <KV
            rows={[
              ['Architecture', `${j.config.architecture}${j.config.pretrained ? ' (ImageNet-pretrained)' : ' (from scratch)'}`],
              ['Epochs · batch · LR', `${j.config.epochs} · ${j.config.batch_size} · ${j.config.learning_rate}`],
              ['Image size', `${j.config.image_size} px`],
              ['Early stopping', j.config.early_stopping ? `on, patience ${j.config.early_stopping_patience}` : 'off'],
              ['Augmentation', j.config.augmentation ? 'on' : 'off'],
              ['Seed', j.config.seed],
              ['Device', j.device ? `${j.device.toUpperCase()} · ${j.device_name}` : 'Assigned when the run starts'],
              ['Started by', `${j.created_by} · ${fmtDate(j.created_at)}`],
            ]}
          />
        </section>
      </div>

      {epochs.length > 0 && (
        <section className="card card-pad">
          <SectionTitle title="Epoch history" />
          <div className="-mx-2 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm tabular">
              <thead className="text-label text-ink-3">
                <tr>
                  {['Epoch', 'Train loss', 'Train acc.', 'Val loss', 'Val acc.', 'Val macro F1', 'LR', 'Time'].map((h) => (
                    <th key={h} className="px-2 py-2 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {epochs.map((e) => (
                  <tr key={e.epoch} className={e.is_best ? 'bg-accent-soft/40' : undefined}>
                    <td className="px-2 py-2">{e.epoch}{e.is_best ? ' · best' : ''}</td>
                    <td className="px-2 py-2">{fmtNum(e.train_loss)}</td>
                    <td className="px-2 py-2">{fmtPct(e.train_accuracy)}</td>
                    <td className="px-2 py-2">{fmtNum(e.val_loss)}</td>
                    <td className="px-2 py-2">{fmtPct(e.val_accuracy)}</td>
                    <td className="px-2 py-2">{fmtPct(e.val_macro_f1)}</td>
                    <td className="px-2 py-2">{e.learning_rate?.toExponential(2) ?? NA}</td>
                    <td className="px-2 py-2">{fmtDuration(e.duration_s)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
