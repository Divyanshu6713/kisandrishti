import { ArrowRight, Cpu, Database, Rocket, Server } from 'lucide-react';
import { Link } from 'react-router';
import { mlAdminApi } from '@/services/mlAdmin/api';
import { SectionTitle } from '@/components/ui/primitives';
import { ErrorNote, JobStatusBadge, KV, Loading, Metric, NA, WarningList, errorMessage, fmtDate, fmtPct, isJobRunning, useAdminData } from './shared';

export default function Dashboard() {
  const { data, error, loading, reload } = useAdminData(() => mlAdminApi.overview(), [], (d) => (d?.recent_jobs.some((j) => isJobRunning(j.status)) ? 4000 : 15000));
  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorNote action={<button type="button" className="btn-secondary" onClick={() => void reload()}>Retry</button>}>{errorMessage(error)}</ErrorNote>;
  if (!data) return null;
  const am = data.active_model;
  const w = data.worker;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card card-pad lg:col-span-2" aria-labelledby="dash-active">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="eyebrow mb-1">Production model</p>
              <h2 id="dash-active" className="text-h2">{am ? `${am.name} v${am.version}` : 'No model deployed'}</h2>
              <p className="mt-1 text-sm text-ink-2">
                {am ? `Serving farmer disease checks since ${fmtDate(data.active?.deployed_at)}.` : 'Farmers currently see “Disease identification is temporarily unavailable”. Train and deploy a model to enable it.'}
              </p>
            </div>
            <Rocket className="h-6 w-6 shrink-0 text-ink-3" aria-hidden />
          </div>
          {am && (
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric label="Dataset" value={am.dataset_version ? `v${am.dataset_version}` : NA} hint={am.dataset_name} />
              <Metric label="Classes" value={am.class_count} />
              <Metric label="Test accuracy" value={fmtPct(am.test_accuracy)} hint="held-out test set" />
              <Metric label="Macro F1" value={fmtPct(am.f1_macro)} hint="every class weighted equally" />
            </div>
          )}
          <div className="mt-5 flex flex-wrap gap-2">
            <Link to="/app/admin/ml/deployment" className="btn-secondary">
              Deployment <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            {am && (
              <Link to={`/app/admin/ml/models/${am.id}`} className="btn-ghost">
                Evaluation report
              </Link>
            )}
          </div>
        </section>

        <section className="card card-pad" aria-labelledby="dash-worker">
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4 text-ink-3" aria-hidden />
            <h2 id="dash-worker" className="text-h3">Training worker</h2>
          </div>
          <p className={w.online ? 'mt-3 font-semibold text-accent' : 'mt-3 font-semibold text-danger'}>{w.online ? 'Online' : 'Offline'}</p>
          {w.online ? (
            <KV
              className="mt-3"
              rows={[
                ['Device', `${w.workers[0].device.toUpperCase()} · ${w.workers[0].device_name}`],
                ['Busy with', w.workers[0].current_task ?? 'Idle'],
              ]}
            />
          ) : (
            <p className="mt-2 text-sm text-ink-2">
              Uploaded datasets wait in the queue until a worker runs. Start one with <code className="rounded bg-sunken px-1">python -m kd_backend.worker</code>. Last seen: {fmtDate(w.last_seen)}.
            </p>
          )}
          <KV
            className="mt-4 border-t border-line pt-4"
            rows={[
              ['Confidence threshold', fmtPct(data.confidence_threshold, 0)],
              ['Last training finished', fmtDate(data.last_training_completed_at)],
            ]}
          />
        </section>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="Ready datasets" value={(data.dataset_counts.ready ?? 0) + (data.dataset_counts.ready_with_warnings ?? 0)} hint={`${data.dataset_counts.ready_with_warnings ?? 0} with warnings`} />
        <Metric label="Models ready" value={(data.model_counts.ready ?? 0) + (data.model_counts.deployed ?? 0)} hint={`${data.model_counts.failed ?? 0} failed · ${data.model_counts.archived ?? 0} archived`} />
        <Metric label="Farmer predictions (7 days)" value={data.predictions_7d.count.toLocaleString('en-IN')} hint={data.predictions_7d.count ? `${data.predictions_7d.uncertain} below threshold` : undefined} />
        <Metric label="Avg. inference time (7 days)" value={data.predictions_7d.avg_inference_ms === null ? NA : `${data.predictions_7d.avg_inference_ms} ms`} hint="model forward pass on the server" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card card-pad">
          <SectionTitle title="Recent training jobs" action={<Link to="/app/admin/ml/training" className="btn-ghost px-2 py-1 text-sm">All jobs</Link>} />
          {data.recent_jobs.length === 0 ? (
            <p className="text-sm text-ink-3">No training jobs yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {data.recent_jobs.map((j) => (
                <li key={j.id}>
                  <Link to={`/app/admin/ml/training/${j.id}`} className="flex items-center gap-3 py-2.5 text-sm hover:text-accent">
                    <Cpu className="h-4 w-4 shrink-0 text-ink-3" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">
                      Run #{j.number} · {j.model_version ? `model v${j.model_version}` : 'model deleted'} · {j.dataset_name} v{j.dataset_version}
                    </span>
                    <JobStatusBadge status={j.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card card-pad">
          <SectionTitle title="Dataset warnings" action={<Link to="/app/admin/ml/datasets" className="btn-ghost px-2 py-1 text-sm">Datasets</Link>} />
          {data.dataset_warnings.length === 0 ? (
            <p className="text-sm text-ink-3">No dataset versions with warnings.</p>
          ) : (
            <ul className="space-y-4">
              {data.dataset_warnings.map((d) => (
                <li key={d.dataset_version_id}>
                  <Link to={`/app/admin/ml/datasets/${d.dataset_version_id}`} className="mb-1.5 flex items-center gap-2 text-sm font-semibold hover:text-accent">
                    <Database className="h-4 w-4 text-ink-3" aria-hidden /> {d.dataset_name} v{d.version}
                  </Link>
                  <WarningList warnings={d.warnings} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
