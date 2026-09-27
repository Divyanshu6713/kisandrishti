import { ArrowLeft, Lock, Pencil, Play, Shuffle, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { PERMISSION_OPTIONS, type DatasetVersion, type PermissionStatus, type Split } from '@/models/mlAdmin';
import { mlAdminApi } from '@/services/mlAdmin/api';
import { Modal } from '@/components/ui/overlay';
import { Disclosure, SectionTitle } from '@/components/ui/primitives';
import { toast } from '@/state/toastStore';
import { DatasetStatusBadge, ErrorNote, LiveProgress, KV, Loading, Metric, ModelStatusBadge, NA, WarningList, errorMessage, fmtBytes, fmtDate, fmtInt, useAdminData } from './shared';

const REASONS: Record<string, string> = {
  hidden_or_system: 'Hidden/system files',
  executable_or_script: 'Executables or scripts',
  not_an_image: 'Not an image',
  outside_class_folder: 'Outside a class folder',
  invalid_class_name: 'Invalid class folder name',
  encrypted: 'Password-protected',
  corrupt_or_unreadable: 'Corrupt or unreadable',
  corrupt_in_archive: 'Damaged inside the archive',
  empty_file: 'Empty file',
  unsupported_format: 'Unsupported image format',
  too_many_pixels: 'Too many pixels',
  unsupported_compression: 'Unsupported compression',
};

function ProvenanceEditor({ v, onSaved, onClose }: { v: DatasetVersion; onSaved: (v: DatasetVersion) => void; onClose: () => void }) {
  const [f, setF] = useState({ description: v.description ?? '', source: v.source ?? '', owner: v.owner ?? '', license: v.license ?? '', permission_status: v.permission_status, collection_method: v.collection_method ?? '', notes: v.notes ?? '' });
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!confirm) return setErr('Confirm that the updated information is accurate.');
    setBusy(true);
    try {
      onSaved(await mlAdminApi.updateProvenance(v.id, { ...f, confirm_provenance: true }));
      toast('Provenance updated', 'The change is recorded in the audit log.');
    } catch (e2) {
      setErr(errorMessage(e2));
    } finally {
      setBusy(false);
    }
  };
  const input = (k: 'source' | 'owner' | 'license' | 'collection_method', label: string) => (
    <div>
      <label htmlFor={`pe-${k}`} className="field-label">{label}</label>
      <input id={`pe-${k}`} className="field" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
    </div>
  );
  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {input('source', 'Source')}
        {input('owner', 'Owner')}
        {input('license', 'Licence')}
        <div>
          <label htmlFor="pe-perm" className="field-label">Permission status</label>
          <select id="pe-perm" className="field" value={f.permission_status} onChange={(e) => setF({ ...f, permission_status: e.target.value as PermissionStatus })}>
            {PERMISSION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        {input('collection_method', 'Collection method')}
        <div className="sm:col-span-2">
          <label htmlFor="pe-notes" className="field-label">Notes</label>
          <textarea id="pe-notes" className="field min-h-[4rem]" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        </div>
      </div>
      <label className="flex items-start gap-2.5 text-sm text-ink-2">
        <input type="checkbox" className="mt-1 h-4 w-4" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
        I confirm this provenance information is accurate. Image files are not changed — only this record.
      </label>
      {err && <ErrorNote>{err}</ErrorNote>}
      <div className="flex gap-2">
        <button type="submit" className="btn-primary" disabled={busy}>Save</button>
        <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
      </div>
    </form>
  );
}

function SplitGenerator({ v, onCreated }: { v: DatasetVersion; onCreated: (s: Split) => void }) {
  const [p, setP] = useState({ train_pct: 70, val_pct: 15, test_pct: 15, seed: 42 });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sum = p.train_pct + p.val_pct + p.test_pct;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (Math.abs(sum - 100) > 1e-9) return setErr(`Train + Validation + Test must equal 100% (currently ${sum}%).`);
    setBusy(true);
    setErr(null);
    try {
      const s = await mlAdminApi.createSplit(v.id, p);
      toast('Split generated', `Train ${s.train_count} · Validation ${s.val_count} · Test ${s.test_count}`);
      onCreated(s);
    } catch (e2) {
      setErr(errorMessage(e2));
    } finally {
      setBusy(false);
    }
  };
  const num = (k: keyof typeof p, label: string, max: number) => (
    <div>
      <label htmlFor={`sg-${k}`} className="field-label">{label}</label>
      <input id={`sg-${k}`} type="number" min={0} max={max} step={k === 'seed' ? 1 : 0.5} className="field tabular" value={p[k]} onChange={(e) => setP({ ...p, [k]: Number(e.target.value) })} />
    </div>
  );
  return (
    <form onSubmit={submit} className="space-y-3" aria-label="Generate a split">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {num('train_pct', 'Train %', 100)}
        {num('val_pct', 'Validation %', 100)}
        {num('test_pct', 'Test %', 100)}
        {num('seed', 'Random seed', 2147483647)}
      </div>
      <p className={Math.abs(sum - 100) > 1e-9 ? 'text-sm text-danger' : 'text-label text-ink-3'}>
        Total: {sum}%. Stratified by class; exact and near-identical copies stay in the same partition. The same seed always gives the same split.
      </p>
      {v.structure === 'predefined_splits' && (
        <p className="text-sm text-warn">This archive has its own train/validation/test folders. A generated split ignores them and re-splits every image — only do this if the provided split is incomplete.</p>
      )}
      {err && <ErrorNote>{err}</ErrorNote>}
      <button type="submit" className="btn-secondary" disabled={busy}>
        <Shuffle className="h-4 w-4" aria-hidden /> Generate split
      </button>
    </form>
  );
}

export default function DatasetDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [delErr, setDelErr] = useState<string | null>(null);
  const { data: v, error, loading, reload, setData } = useAdminData(() => mlAdminApi.version(id), [id], (d) => (d && ['uploading', 'queued', 'validating'].includes(d.status) ? 2500 : null));

  if (loading && !v) return <Loading />;
  if (error && !v) return <ErrorNote action={<button type="button" className="btn-secondary" onClick={() => void reload()}>Retry</button>}>{errorMessage(error)}</ErrorNote>;
  if (!v) return null;
  const val = v.validation;
  const sum = val?.summary;
  const usable = v.status === 'ready' || v.status === 'ready_with_warnings';
  const processing = ['uploading', 'queued', 'validating'].includes(v.status);
  const maxClass = Math.max(1, ...(val?.classes ?? []).map((c) => c.count));
  const splitName = (s: Split) => (s.strategy === 'predefined' ? 'Provided folders' : `Stratified ${s.train_pct}/${s.val_pct}/${s.test_pct} · seed ${s.seed}`);

  const del = async () => {
    try {
      await mlAdminApi.deleteVersion(v.id, confirmText);
      toast('Dataset version deleted');
      navigate('/app/admin/ml/datasets');
    } catch (e) {
      setDelErr(errorMessage(e));
    }
  };

  return (
    <div className="space-y-6">
      <Link to="/app/admin/ml/datasets" className="btn-ghost -ml-3 px-3 py-1.5 text-sm">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Datasets
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow mb-1">Dataset version</p>
          <h2 className="text-h2">
            {v.dataset_name} v{v.version}
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <DatasetStatusBadge status={v.status} />
            {v.locked_at && (
              <span className="chip bg-sunken text-ink-2">
                <Lock className="h-3 w-3" aria-hidden /> Locked since {fmtDate(v.locked_at)} (used for training)
              </span>
            )}
          </div>
        </div>
        {!v.locked_at && !processing && (
          <button type="button" className="btn-ghost text-danger" onClick={() => setDeleting(true)}>
            <Trash2 className="h-4 w-4" aria-hidden /> Delete version
          </button>
        )}
      </header>

      {processing && (
        <section className="card card-pad" aria-live="polite">
          <p className="mb-2 text-sm font-semibold">{v.status_detail ?? 'Waiting for the worker…'}</p>
          <LiveProgress label="Validation progress" value={(v.progress ?? 0) * 100} tone="ok" />
          <p className="mt-2 text-label text-ink-3">Validation runs in the background worker. This page refreshes automatically.</p>
        </section>
      )}

      {val?.error && <ErrorNote>{val.error.message}</ErrorNote>}

      <section className="card card-pad">
        <SectionTitle title="Provenance" hint="Recorded by the uploader. Kisan Drishti does not assume any rights that are not stated here." action={<button type="button" className="btn-ghost px-2 py-1 text-sm" onClick={() => setEditing(true)}><Pencil className="h-3.5 w-3.5" aria-hidden /> Edit</button>} />
        <KV
          rows={[
            ['Permission status', PERMISSION_OPTIONS.find((o) => o.value === v.permission_status)?.label ?? v.permission_status],
            ['Source', v.source ?? NA],
            ['Owner', v.owner ?? NA],
            ['Licence', v.license ?? NA],
            ['Collection method', v.collection_method ?? NA],
            ['Description', v.description ?? NA],
            ['Notes', v.notes ?? NA],
            ['Uploaded', `${fmtDate(v.created_at)} by ${v.uploaded_by}`],
            ['Original file', v.original_filename ? `${v.original_filename} (${fmtBytes(v.upload_bytes)})` : NA],
            ['Archive SHA-256', v.archive_sha256 ? <code className="break-all text-label">{v.archive_sha256}</code> : NA],
            ['Content hash', v.content_hash ? <code className="break-all text-label">{v.content_hash}</code> : NA],
            ['Dataset version ID', <code className="text-label">{v.id}</code>],
          ]}
        />
      </section>

      {sum && (
        <>
          <section className="card card-pad">
            <SectionTitle title="Validation" hint={`Structure: ${v.structure === 'predefined_splits' ? 'Format A — provided train/validation/test folders' : 'Format B — class folders'}${val?.stripped_prefix ? ` · wrapper folder “${val.stripped_prefix}” removed` : ''}`} />
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Metric label="Valid images" value={fmtInt(sum.total_images)} />
              <Metric label="Classes" value={fmtInt(sum.class_count)} />
              <Metric label="Dataset size" value={fmtBytes(sum.total_bytes)} />
              <Metric label="Excluded files" value={fmtInt(Object.values(sum.rejected).reduce((a, b) => a + b, 0))} hint="could not be decoded" />
            </div>
            <div className="mt-5 grid gap-6 md:grid-cols-2">
              <KV
                rows={[
                  ...Object.entries(sum.split_counts).map(([k, n]): [string, string] => [k === 'unsplit' ? 'Not yet split' : `${k === 'val' ? 'Validation' : k[0].toUpperCase() + k.slice(1)} images`, `${fmtInt(n)} (${sum.split_percent[k]}%)`]),
                  ['Width range', sum.dimensions.min_width === null ? NA : `${sum.dimensions.min_width}–${sum.dimensions.max_width} px`],
                  ['Height range', sum.dimensions.min_height === null ? NA : `${sum.dimensions.min_height}–${sum.dimensions.max_height} px`],
                  ['Most common sizes', sum.dimensions.common.map((c) => `${c.width}×${c.height} (${fmtInt(c.count)})`).join(', ') || NA],
                  ['File formats', Object.entries(sum.formats).map(([k, n]) => `${k} ${fmtInt(n)}`).join(' · ') || NA],
                ]}
              />
              <div>
                <p className="eyebrow mb-2">Warnings</p>
                <WarningList warnings={val?.warnings ?? []} empty="No problems found." />
              </div>
            </div>
          </section>

          <section className="card card-pad">
            <SectionTitle title="Classes" hint="Discovered from folder names. The raw folder name is the model's class ID; the display name is what farmers see." />
            <div className="-mx-2 overflow-x-auto">
              <table className="w-full min-w-[620px] text-left text-sm">
                <thead className="text-label text-ink-3">
                  <tr>
                    <th className="px-2 py-2 font-medium">Display name</th>
                    <th className="px-2 py-2 font-medium">Class ID (folder)</th>
                    <th className="px-2 py-2 font-medium">Images</th>
                    <th className="w-1/3 px-2 py-2 font-medium">
                      <span className="sr-only">Share</span>
                    </th>
                    {v.structure === 'predefined_splits' && <th className="px-2 py-2 font-medium">Train / Val / Test</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {val?.classes?.map((c) => (
                    <tr key={c.raw_name}>
                      <td className="px-2 py-2 font-medium">{c.display_name}</td>
                      <td className="px-2 py-2"><code className="text-label text-ink-2">{c.raw_name}</code></td>
                      <td className="px-2 py-2 tabular">{fmtInt(c.count)}</td>
                      <td className="px-2 py-2">
                        <div className="h-2 rounded-full bg-sunken" aria-hidden>
                          <div className="h-2 rounded-full bg-accent/70" style={{ width: `${(100 * c.count) / maxClass}%` }} />
                        </div>
                      </td>
                      {v.structure === 'predefined_splits' && <td className="px-2 py-2 tabular text-ink-2">{c.by_split.train ?? 0} / {c.by_split.val ?? 0} / {c.by_split.test ?? 0}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!!val?.empty_classes?.length && <p className="mt-3 text-sm text-warn">Empty class folders (not used): {val.empty_classes.join(', ')}</p>}
          </section>

          <section className="card card-pad">
            <Disclosure summary="Duplicates, excluded and ignored files">
              <div className="space-y-5 text-sm">
                {val?.duplicates && (
                  <div>
                    <p className="font-semibold">Duplicate detection</p>
                    <p className="text-label text-ink-3">Method: {val.duplicates.method}</p>
                    <KV
                      className="mt-2"
                      rows={[
                        ['Exact copies', `${fmtInt(val.duplicates.exact_duplicate_images)} images in ${fmtInt(val.duplicates.exact_duplicate_groups)} groups`],
                        ['Near-identical links', fmtInt(val.duplicates.near_duplicate_links)],
                        ['Groups under several classes', fmtInt(val.duplicates.cross_class_groups)],
                        ['Groups across provided splits', fmtInt(val.duplicates.cross_split_groups)],
                        ['Large similar-looking clusters', `${fmtInt(val.duplicates.large_similarity_clusters ?? 0)} (not treated as copies)`],
                      ]}
                    />
                    {val.duplicates.examples.length > 0 && (
                      <ul className="mt-2 space-y-1 text-label text-ink-2">
                        {val.duplicates.examples.slice(0, 5).map((g, i) => (
                          <li key={i}>· {g.map((x) => `${x.file} [${x.class}]`).join('  =  ')}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="font-semibold">Excluded (not decodable)</p>
                    {Object.keys(sum.rejected).length === 0 ? <p className="text-ink-3">None.</p> : (
                      <ul className="mt-1 text-ink-2">{Object.entries(sum.rejected).map(([k, n]) => <li key={k}>{REASONS[k] ?? k}: {fmtInt(n)}</li>)}</ul>
                    )}
                    {!!val?.rejected_samples?.length && <ul className="mt-2 text-label text-ink-3">{val.rejected_samples.slice(0, 10).map((r, i) => <li key={i} className="break-all">{r.file} — {REASONS[r.reason] ?? r.reason}</li>)}</ul>}
                  </div>
                  <div>
                    <p className="font-semibold">Ignored (never extracted)</p>
                    {Object.keys(sum.skipped).length === 0 ? <p className="text-ink-3">None.</p> : (
                      <ul className="mt-1 text-ink-2">{Object.entries(sum.skipped).map(([k, n]) => <li key={k}>{REASONS[k] ?? k}: {fmtInt(n)}</li>)}</ul>
                    )}
                  </div>
                </div>
              </div>
            </Disclosure>
          </section>
        </>
      )}

      {usable && (
        <section className="card card-pad">
          <SectionTitle title="Train / validation / test splits" hint="Each split is saved with its seed and file manifest, so a training run can always be reproduced. Existing splits never change." />
          {v.splits && v.splits.length > 0 ? (
            <ul className="mb-6 divide-y divide-line">
              {v.splits.map((s) => (
                <li key={s.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{splitName(s)}</p>
                    <p className="text-label text-ink-3">
                      Train {fmtInt(s.train_count)} · Validation {fmtInt(s.val_count)} · Test {fmtInt(s.test_count)} · created {fmtDate(s.created_at)} by {s.created_by}
                    </p>
                    {s.warnings.length > 0 && <div className="mt-1.5"><WarningList warnings={s.warnings} /></div>}
                  </div>
                  <Link to={`/app/admin/ml/training?dataset=${v.id}&split=${s.id}`} className="btn-primary shrink-0">
                    <Play className="h-4 w-4" aria-hidden /> Train with this split
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-4 text-sm text-ink-2">No split yet. Generate one to train (default 70 / 15 / 15).</p>
          )}
          <Disclosure summary="Generate a new split" defaultOpen={!v.splits?.length}>
            <SplitGenerator v={v} onCreated={() => void reload()} />
          </Disclosure>
        </section>
      )}

      {v.models && v.models.length > 0 && (
        <section className="card card-pad">
          <SectionTitle title="Models trained on this version" />
          <ul className="divide-y divide-line">
            {v.models.map((m) => (
              <li key={m.id} className="flex items-center justify-between py-2 text-sm">
                <Link to={`/app/admin/ml/models/${m.id}`} className="font-semibold text-accent hover:underline">Model v{m.version}</Link>
                <ModelStatusBadge status={m.status} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <Modal open={editing} onClose={() => setEditing(false)} title="Edit provenance" wide>
        <ProvenanceEditor v={v} onClose={() => setEditing(false)} onSaved={(nv) => { setData(nv); setEditing(false); }} />
      </Modal>
      <Modal open={deleting} onClose={() => setDeleting(false)} title="Delete dataset version">
        <p className="text-sm text-ink-2">This permanently removes the extracted images and all splits of v{v.version}. It is only possible because no model has been trained on it.</p>
        <label htmlFor="del-confirm" className="field-label mt-4">Type <strong>{v.version}</strong> to confirm</label>
        <input id="del-confirm" className="field" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
        {delErr && <div className="mt-3"><ErrorNote>{delErr}</ErrorNote></div>}
        <div className="mt-5 flex gap-2">
          <button type="button" className="btn-danger" disabled={confirmText !== v.version} onClick={() => void del()}>Delete permanently</button>
          <button type="button" className="btn-ghost" onClick={() => setDeleting(false)}>Cancel</button>
        </div>
      </Modal>
    </div>
  );
}
