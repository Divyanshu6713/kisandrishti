import { AlertTriangle, Rocket } from 'lucide-react';
import { useState } from 'react';
import type { DeploymentState, ModelSummary } from '@/models/mlAdmin';
import { MlApiError, mlAdminApi } from '@/services/mlAdmin/api';
import { Modal } from '@/components/ui/overlay';
import { toast } from '@/state/toastStore';
import { ErrorNote, fmtPct } from './shared';

/**
 * Deploy / roll back confirmation. When the training dataset's permission status blocks deployment,
 * the admin must tick an explicit override and write a reason; the server records both.
 */
export function DeployDialog({
  model,
  mode = 'deploy',
  deploymentId,
  open,
  onClose,
  onDone,
}: {
  model: Pick<ModelSummary, 'id' | 'name' | 'version' | 'dataset_name' | 'dataset_version' | 'test_accuracy' | 'f1_macro' | 'deploy_block' | 'permission_label' | 'permission_warning'>;
  mode?: 'deploy' | 'rollback';
  deploymentId?: string;
  open: boolean;
  onClose: () => void;
  onDone: (s: DeploymentState) => void;
}) {
  const [override, setOverride] = useState(false);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const block = model.deploy_block;
  const needsOverride = Boolean(block?.overridable);

  const go = async () => {
    setErr(null);
    if (needsOverride && (!override || reason.trim().length < 10)) return setErr('Tick the override and give a reason (at least 10 characters).');
    setBusy(true);
    try {
      const body = { confirm_override: needsOverride ? override : undefined, override_reason: needsOverride ? reason.trim() : undefined, note: note.trim() || undefined };
      const s = mode === 'rollback' ? await mlAdminApi.rollback({ deployment_id: deploymentId, ...body }) : await mlAdminApi.deploy({ model_id: model.id, ...body });
      toast(mode === 'rollback' ? 'Rolled back' : 'Model deployed', `${model.name} v${model.version} now serves farmer disease checks.`);
      onDone(s);
      onClose();
    } catch (e) {
      setErr(e instanceof MlApiError ? e.message : 'Deployment failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={mode === 'rollback' ? `Roll back to v${model.version}?` : `Deploy v${model.version} to production?`}>
      <p className="text-sm text-ink-2">
        {model.name} v{model.version} (trained on {model.dataset_name} v{model.dataset_version}; test accuracy {fmtPct(model.test_accuracy)}, macro F1 {fmtPct(model.f1_macro)}) will replace the current production model for every farmer. The model is loaded and checked before the switch; if it fails to load, nothing changes.
      </p>
      {model.permission_warning && <p className="mt-3 text-sm text-warn">{model.permission_warning}</p>}
      {block && !block.overridable && <div className="mt-4"><ErrorNote>{block.message}</ErrorNote></div>}
      {needsOverride && (
        <div className="mt-4 rounded-card border border-warn/40 bg-warn-soft/40 p-4">
          <p className="flex items-start gap-2 text-sm font-semibold text-ink">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden /> {block?.message}
          </p>
          <label className="mt-3 flex items-start gap-2 text-sm text-ink-2">
            <input type="checkbox" className="mt-1 h-4 w-4" checked={override} onChange={(e) => setOverride(e.target.checked)} />
            I understand the dataset permission is “{model.permission_label}” and I take responsibility for deploying anyway. My name, the time and my reason are recorded.
          </label>
          <label htmlFor="ov-reason" className="field-label mt-3">Reason for the override</label>
          <textarea id="ov-reason" className="field min-h-[4rem]" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. written permission received on …, pending update of the record" />
        </div>
      )}
      <label htmlFor="dep-note" className="field-label mt-4">Note (optional)</label>
      <input id="dep-note" className="field" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
      {err && <div className="mt-3"><ErrorNote>{err}</ErrorNote></div>}
      <div className="mt-5 flex gap-2">
        <button type="button" className="btn-primary" onClick={() => void go()} disabled={busy || Boolean(block && !block.overridable)}>
          <Rocket className="h-4 w-4" aria-hidden /> {mode === 'rollback' ? 'Roll back' : 'Deploy'}
        </button>
        <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  );
}
