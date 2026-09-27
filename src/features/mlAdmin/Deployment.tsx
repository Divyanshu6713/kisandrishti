import { Power, Rocket, Undo2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import type { ModelSummary } from '@/models/mlAdmin';
import { mlAdminApi } from '@/services/mlAdmin/api';
import { Modal } from '@/components/ui/overlay';
import { Disclosure, SectionTitle } from '@/components/ui/primitives';
import { toast } from '@/state/toastStore';
import { DeployDialog } from './deploy';
import { ErrorNote, KV, Loading, errorMessage, fmtDate, fmtPct, useAdminData } from './shared';

function ThresholdForm({ value, onSaved }: { value: number; onSaved: () => void }) {
  const [v, setV] = useState(Math.round(value * 100));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => setV(Math.round(value * 100)), [value]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await mlAdminApi.setThreshold(v / 100);
      toast('Confidence threshold updated', `Predictions below ${v}% are now shown as uncertain.`);
      onSaved();
    } catch (e2) {
      setErr(errorMessage(e2));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="space-y-3">
      <label htmlFor="thr" className="field-label">Confidence threshold: {v}%</label>
      <input id="thr" type="range" min={5} max={99} value={v} onChange={(e) => setV(Number(e.target.value))} className="w-full accent-[rgb(var(--accent))]" />
      <p className="text-label text-ink-3">
        Below this model confidence, farmers see “Unable to identify this condition reliably” with the possible match, instead of a diagnosis. This is confidence-based uncertainty handling only — it does not detect unknown diseases reliably.
      </p>
      {err && <ErrorNote>{err}</ErrorNote>}
      <button type="submit" className="btn-secondary" disabled={busy || v === Math.round(value * 100)}>Save threshold</button>
    </form>
  );
}

export default function Deployment() {
  const state = useAdminData(() => mlAdminApi.deployment(), []);
  const models = useAdminData(() => mlAdminApi.models(), []);
  const audit = useAdminData(() => mlAdminApi.audit(40), []);
  const [target, setTarget] = useState<{ model: ModelSummary; mode: 'deploy' | 'rollback'; deploymentId?: string } | null>(null);
  const [turningOff, setTurningOff] = useState(false);
  const [offReason, setOffReason] = useState('');

  const refresh = () => {
    void state.reload();
    void models.reload();
    void audit.reload();
  };

  if ((state.loading && !state.data) || (models.loading && !models.data)) return <Loading />;
  const err = state.error || models.error;
  if (err && (!state.data || !models.data)) return <ErrorNote>{errorMessage(err)}</ErrorNote>;
  const s = state.data!;
  const all = models.data!.models;
  const active = s.active;
  const activeModel = active ? all.find((m) => m.id === active.model_id) : undefined;
  const deployable = all.filter((m) => m.status === 'ready');
  const rbModel = s.rollback_target ? all.find((m) => m.id === s.rollback_target!.model_id) : undefined;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card card-pad lg:col-span-2">
          <SectionTitle title="Active production model" hint="Training and deployment are separate: only the model deployed here serves farmers." />
          {active ? (
            <>
              <p className="text-h2">
                {active.name} v{active.version}
              </p>
              <KV
                className="mt-3"
                rows={[
                  ['Dataset', `${active.dataset_name} v${active.dataset_version}`],
                  ['Deployed', `${fmtDate(active.deployed_at)} (deployment #${active.number})`],
                  ['Test accuracy / macro F1', activeModel ? `${fmtPct(activeModel.test_accuracy)} / ${fmtPct(activeModel.f1_macro)}` : 'Not available'],
                ]}
              />
              <div className="mt-5 flex flex-wrap gap-2">
                {rbModel && (
                  <button type="button" className="btn-secondary" onClick={() => setTarget({ model: rbModel, mode: 'rollback', deploymentId: s.rollback_target!.deployment_id })}>
                    <Undo2 className="h-4 w-4" aria-hidden /> Roll back to v{rbModel.version}
                  </button>
                )}
                <button type="button" className="btn-ghost text-danger" onClick={() => setTurningOff(true)}>
                  <Power className="h-4 w-4" aria-hidden /> Turn off production model
                </button>
              </div>
            </>
          ) : (
            <p className="text-sm text-ink-2">No model is deployed. Farmers see “Disease identification is temporarily unavailable because no trained model is currently deployed.”</p>
          )}
        </section>
        <section className="card card-pad">
          <SectionTitle title="Uncertainty" />
          <ThresholdForm value={s.confidence_threshold} onSaved={refresh} />
        </section>
      </div>

      <section className="card card-pad">
        <SectionTitle title="Deploy a model" hint="Only evaluated models in the Ready state are listed. Archived and failed models cannot be deployed." />
        {deployable.length === 0 ? (
          <p className="text-sm text-ink-3">No ready models. <Link to="/app/admin/ml/training" className="text-accent">Train one</Link>.</p>
        ) : (
          <ul className="divide-y divide-line">
            {deployable.map((m) => (
              <li key={m.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1 text-sm">
                  <Link to={`/app/admin/ml/models/${m.id}`} className="font-semibold text-accent hover:underline">{m.name} v{m.version}</Link>
                  <span className="text-ink-2"> · {m.architecture} · {m.dataset_name} v{m.dataset_version} · test acc. {fmtPct(m.test_accuracy)} · macro F1 {fmtPct(m.f1_macro)}</span>
                  {m.deploy_block && <p className="text-label text-warn">{m.deploy_block.code === 'dataset_permission' ? 'Blocked by dataset permission — override required' : m.deploy_block.message}</p>}
                </div>
                <button type="button" className="btn-primary shrink-0" onClick={() => setTarget({ model: m, mode: 'deploy' })} disabled={Boolean(m.deploy_block && !m.deploy_block.overridable)}>
                  <Rocket className="h-4 w-4" aria-hidden /> Deploy
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card card-pad">
        <SectionTitle title="Deployment history" />
        {s.history.length === 0 ? (
          <p className="text-sm text-ink-3">No deployments yet.</p>
        ) : (
          <div className="-mx-2 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-label text-ink-3">
                <tr>
                  {['#', 'Action', 'Model', 'Dataset', 'By', 'When', 'Status', 'Permission override'].map((h) => (
                    <th key={h} className="px-2 py-2 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {s.history.map((d) => {
                  const m = all.find((x) => x.id === d.model_id);
                  const canRollback = d.status === 'superseded' && m?.status === 'ready' && d.model_id !== active?.model_id;
                  return (
                    <tr key={d.id}>
                      <td className="px-2 py-2 tabular">{d.number}</td>
                      <td className="px-2 py-2 capitalize">{d.action}</td>
                      <td className="px-2 py-2">{d.model_version ? `v${d.model_version}` : '—'}</td>
                      <td className="px-2 py-2 text-ink-2">{d.dataset_name ? `${d.dataset_name} v${d.dataset_version}` : '—'}</td>
                      <td className="px-2 py-2 text-ink-2">{d.deployed_by}</td>
                      <td className="px-2 py-2 text-ink-2">{fmtDate(d.deployed_at)}{d.ended_at ? ` → ${fmtDate(d.ended_at)}` : ''}</td>
                      <td className="px-2 py-2">
                        {d.status === 'active' ? <span className="font-semibold text-accent">Active</span> : 'Ended'}
                        {canRollback && m && (
                          <button type="button" className="btn-ghost ml-2 px-2 py-0.5 text-label" onClick={() => setTarget({ model: m, mode: 'rollback', deploymentId: d.id })}>
                            Re-activate
                          </button>
                        )}
                      </td>
                      <td className="px-2 py-2 text-label text-ink-2">{d.permission_override ? `Yes — ${d.override_by}: “${d.override_reason}”` : 'No'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card card-pad">
        <Disclosure summary="Audit log (recent administrator actions)">
          {audit.data ? (
            <ul className="max-h-96 space-y-1.5 overflow-y-auto text-sm">
              {audit.data.entries.map((e) => (
                <li key={e.id} className="flex flex-wrap gap-x-2 text-ink-2">
                  <span className="tabular text-ink-3">{fmtDate(e.at)}</span>
                  <span className="font-medium text-ink">{e.actor}</span>
                  <code className="text-label">{e.action}</code>
                  {e.target_id && <span className="text-label text-ink-3">{e.target_id}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <Loading />
          )}
        </Disclosure>
      </section>

      {target && <DeployDialog model={target.model} mode={target.mode} deploymentId={target.deploymentId} open onClose={() => setTarget(null)} onDone={refresh} />}
      <Modal open={turningOff} onClose={() => setTurningOff(false)} title="Turn off the production model?">
        <p className="text-sm text-ink-2">Farmers will see that disease identification is temporarily unavailable until another model is deployed. No prediction will be guessed.</p>
        <label htmlFor="off-reason" className="field-label mt-4">Reason</label>
        <input id="off-reason" className="field" value={offReason} onChange={(e) => setOffReason(e.target.value)} maxLength={500} />
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            className="btn-danger"
            onClick={async () => {
              try {
                await mlAdminApi.turnOff(offReason);
                toast('Production model turned off', undefined, 'info');
                setTurningOff(false);
                refresh();
              } catch (e) {
                toast('Could not turn off', errorMessage(e), 'error');
              }
            }}
          >
            Turn off
          </button>
          <button type="button" className="btn-ghost" onClick={() => setTurningOff(false)}>Cancel</button>
        </div>
      </Modal>
    </div>
  );
}
