import { Database, FileArchive, Plus, Upload, X } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { PERMISSION_OPTIONS, type Dataset, type PermissionStatus } from '@/models/mlAdmin';
import { mlAdminApi } from '@/services/mlAdmin/api';
import { Disclosure, EmptyState, SectionTitle } from '@/components/ui/primitives';
import { toast } from '@/state/toastStore';
import { DatasetStatusBadge, ErrorNote, LiveProgress, Loading, errorMessage, fmtBytes, fmtDate, fmtInt, useAdminData } from './shared';

const STRUCTURE_HELP = (
  <div className="grid gap-4 text-sm text-ink-2 sm:grid-cols-2">
    <div>
      <p className="mb-1 font-semibold text-ink">Format A — your own split</p>
      <pre className="overflow-x-auto rounded-ctl bg-sunken p-3 text-label leading-relaxed">{`dataset.zip
  train/
    Tomato___Early_blight/ *.jpg
    Tomato___healthy/      *.jpg
  validation/  (or val/, valid/)
    …same class folders
  test/
    …same class folders`}</pre>
      <p className="mt-1 text-label text-ink-3">The split is used exactly as provided — never reshuffled.</p>
    </div>
    <div>
      <p className="mb-1 font-semibold text-ink">Format B — class folders only</p>
      <pre className="overflow-x-auto rounded-ctl bg-sunken p-3 text-label leading-relaxed">{`dataset.zip
  Tomato___Early_blight/ *.jpg
  Tomato___Late_blight/  *.jpg
  Tomato___healthy/      *.jpg
  Potato___Early_blight/ *.jpg`}</pre>
      <p className="mt-1 text-label text-ink-3">You generate a reproducible train/validation/test split after validation.</p>
    </div>
    <p className="text-label text-ink-3 sm:col-span-2">
      Classes are the folder names — they are discovered from your archive, never hard-coded. Images: JPG, PNG, WebP or BMP. One wrapper folder around everything is fine. Hidden/system files, scripts and executables are ignored and reported.
    </p>
  </div>
);

type Form = {
  dataset_id: string;
  dataset_name: string;
  dataset_description: string;
  version: string;
  description: string;
  source: string;
  owner: string;
  license: string;
  permission_status: PermissionStatus | '';
  collection_method: string;
  notes: string;
};

const EMPTY: Form = { dataset_id: '', dataset_name: '', dataset_description: '', version: '1.0', description: '', source: '', owner: '', license: '', permission_status: '', collection_method: '', notes: '' };

function UploadForm({ datasets, maxBytes, onDone, onCancel }: { datasets: Dataset[]; maxBytes: number; onDone: (id: string) => void; onCancel: () => void }) {
  const [f, setF] = useState<Form>(EMPTY);
  const [file, setFile] = useState<File | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ sent: number; total: number } | null>(null);
  const abort = useRef<AbortController | null>(null);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!file) return setErr('Choose a .zip archive.');
    if (!file.name.toLowerCase().endsWith('.zip')) return setErr('Only .zip archives are accepted.');
    if (file.size > maxBytes) return setErr(`The archive is ${fmtBytes(file.size)}; the limit is ${fmtBytes(maxBytes)}.`);
    if (!f.dataset_id && !f.dataset_name.trim()) return setErr('Enter a dataset name, or choose an existing dataset.');
    if (!f.permission_status) return setErr('Choose the permission status.');
    if (!confirm) return setErr('Confirm that the provenance information is accurate.');
    try {
      const meta: Record<string, unknown> = { ...f, original_filename: file.name, size_bytes: file.size, confirm_provenance: true };
      if (f.dataset_id) {
        delete meta.dataset_name;
        delete meta.dataset_description;
      } else delete meta.dataset_id;
      const v = await mlAdminApi.createVersion(meta);
      abort.current = new AbortController();
      setProgress({ sent: 0, total: file.size });
      await mlAdminApi.uploadArchive(v.id, file, (sent, total) => setProgress({ sent, total }), abort.current.signal);
      toast('Dataset uploaded', 'The worker is now extracting and validating it.');
      onDone(v.id);
    } catch (e2) {
      setProgress(null);
      setErr(errorMessage(e2));
    }
  };

  const uploading = progress !== null;
  const field = (k: keyof Form, label: string, props: { required?: boolean; placeholder?: string; area?: boolean; hint?: string } = {}) => (
    <div className={props.area ? 'sm:col-span-2' : undefined}>
      <label htmlFor={`dsf-${k}`} className="field-label">
        {label}
        {props.required && <span className="text-danger"> *</span>}
      </label>
      {props.area ? (
        <textarea id={`dsf-${k}`} className="field min-h-[4.5rem]" value={f[k]} onChange={(e) => set(k, e.target.value)} placeholder={props.placeholder} disabled={uploading} />
      ) : (
        <input id={`dsf-${k}`} className="field" value={f[k]} onChange={(e) => set(k, e.target.value)} placeholder={props.placeholder} required={props.required} disabled={uploading} />
      )}
      {props.hint && <p className="mt-1 text-label text-ink-3">{props.hint}</p>}
    </div>
  );

  return (
    <form onSubmit={submit} className="card card-pad space-y-6" noValidate aria-label="Upload a dataset">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-h3">Upload a dataset version</h2>
          <p className="text-sm text-ink-3">Every upload becomes a new, immutable dataset version with its provenance recorded.</p>
        </div>
        <button type="button" className="btn-ghost p-2" onClick={onCancel} aria-label="Close upload form" disabled={uploading}>
          <X className="h-4 w-4" />
        </button>
      </div>

      <Disclosure summary="Supported archive structures" defaultOpen>
        {STRUCTURE_HELP}
      </Disclosure>

      <fieldset className="grid gap-4 sm:grid-cols-2" disabled={uploading}>
        <legend className="eyebrow mb-3">Dataset</legend>
        <div>
          <label htmlFor="dsf-existing" className="field-label">Add to</label>
          <select id="dsf-existing" className="field" value={f.dataset_id} onChange={(e) => set('dataset_id', e.target.value)}>
            <option value="">A new dataset</option>
            {datasets.map((d) => (
              <option key={d.id} value={d.id}>
                New version of “{d.name}”
              </option>
            ))}
          </select>
        </div>
        {field('version', 'Version', { required: true, placeholder: '1.0', hint: 'e.g. 1.0, then 1.1 for added images' })}
        {!f.dataset_id && field('dataset_name', 'Dataset name', { required: true, placeholder: 'e.g. Kisan Disease Dataset' })}
        {!f.dataset_id && field('dataset_description', 'Dataset description')}
        {field('description', 'What changed in this version', { area: true })}
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2" disabled={uploading}>
        <legend className="eyebrow mb-3">Provenance and permission</legend>
        {field('source', 'Source', { required: true, placeholder: 'Where the images came from', hint: 'Enter “Unknown” if you do not know.' })}
        {field('owner', 'Owner', { required: true, placeholder: 'Who owns the images' })}
        {field('license', 'Licence', { required: true, placeholder: 'e.g. CC BY 4.0, written agreement, Unknown' })}
        <div>
          <label htmlFor="dsf-perm" className="field-label">
            Permission status<span className="text-danger"> *</span>
          </label>
          <select id="dsf-perm" className="field" value={f.permission_status} onChange={(e) => set('permission_status', e.target.value as PermissionStatus)} required>
            <option value="">Choose…</option>
            {PERMISSION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-label text-ink-3">“Permission required” or “Unknown” blocks production deployment unless an admin records an override.</p>
        </div>
        {field('collection_method', 'Collection method', { placeholder: 'e.g. field photos by our team, phone camera' })}
        {field('notes', 'Notes', { area: true })}
      </fieldset>

      <div>
        <label htmlFor="dsf-file" className="field-label">
          Archive (.zip, up to {fmtBytes(maxBytes)})<span className="text-danger"> *</span>
        </label>
        <input id="dsf-file" type="file" accept=".zip,application/zip" className="field" disabled={uploading} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        {file && (
          <p className="mt-1 flex items-center gap-1.5 text-label text-ink-3">
            <FileArchive className="h-3.5 w-3.5" aria-hidden /> {file.name} · {fmtBytes(file.size)}
          </p>
        )}
      </div>

      <label className="flex items-start gap-2.5 text-sm text-ink-2">
        <input type="checkbox" className="mt-1 h-4 w-4 accent-[rgb(var(--accent))]" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} disabled={uploading} />
        I confirm the source, owner, licence and permission status above are accurate to the best of my knowledge. Kisan Drishti does not assume any rights that are not recorded here.
      </label>

      {err && <ErrorNote>{err}</ErrorNote>}

      {progress && (
        <div aria-live="polite">
          <div className="mb-1.5 flex justify-between text-sm">
            <span className="text-ink-2">Uploading…</span>
            <span className="tabular">
              {fmtBytes(progress.sent)} / {fmtBytes(progress.total)}
            </span>
          </div>
          <LiveProgress label="Upload progress" value={(100 * progress.sent) / Math.max(progress.total, 1)} tone="ok" />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn-primary" disabled={uploading}>
          <Upload className="h-4 w-4" aria-hidden /> Upload and validate
        </button>
        {uploading ? (
          <button type="button" className="btn-secondary" onClick={() => abort.current?.abort()}>
            Cancel upload
          </button>
        ) : (
          <button type="button" className="btn-ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

export default function Datasets() {
  const navigate = useNavigate();
  const [showForm, setShowForm] = useState(false);
  const { data, error, loading, reload } = useAdminData(
    () => mlAdminApi.datasets(),
    [],
    (d) => (d?.datasets.some((x) => x.versions.some((v) => ['uploading', 'queued', 'validating'].includes(v.status))) ? 3000 : null),
  );

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorNote action={<button type="button" className="btn-secondary" onClick={() => void reload()}>Retry</button>}>{errorMessage(error)}</ErrorNote>;
  if (!data) return null;

  return (
    <div className="space-y-6">
      {showForm ? (
        <UploadForm datasets={data.datasets} maxBytes={data.limits.max_upload_bytes} onCancel={() => setShowForm(false)} onDone={(id) => navigate(`/app/admin/ml/datasets/${id}`)} />
      ) : (
        <div className="flex justify-end">
          <button type="button" className="btn-primary" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" aria-hidden /> Upload dataset
          </button>
        </div>
      )}

      {data.datasets.length === 0 && !showForm ? (
        <EmptyState
          icon={<Database className="h-5 w-5" />}
          title="No datasets yet"
          body="Upload your crop-disease image archive to begin. No public dataset is downloaded or used automatically."
          action={<button type="button" className="btn-primary" onClick={() => setShowForm(true)}>Upload dataset</button>}
        />
      ) : (
        data.datasets.map((d) => (
          <section key={d.id} className="card card-pad">
            <SectionTitle title={d.name} hint={d.description ?? `Created ${fmtDate(d.created_at)} by ${d.created_by}`} />
            <div className="-mx-2 overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="text-label text-ink-3">
                  <tr>
                    <th className="px-2 py-2 font-medium">Version</th>
                    <th className="px-2 py-2 font-medium">Status</th>
                    <th className="px-2 py-2 font-medium">Images</th>
                    <th className="px-2 py-2 font-medium">Classes</th>
                    <th className="px-2 py-2 font-medium">Warnings</th>
                    <th className="px-2 py-2 font-medium">Models</th>
                    <th className="px-2 py-2 font-medium">Uploaded</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {d.versions.map((v) => (
                    <tr key={v.id}>
                      <td className="px-2 py-2.5">
                        <Link to={`/app/admin/ml/datasets/${v.id}`} className="font-semibold text-accent hover:underline">
                          v{v.version}
                        </Link>
                        {v.locked_at && <span className="ml-2 text-label text-ink-3">locked</span>}
                      </td>
                      <td className="px-2 py-2.5">
                        <DatasetStatusBadge status={v.status} />
                        {v.status === 'validating' && v.progress !== null && <span className="ml-2 text-label tabular text-ink-3">{Math.round((v.progress ?? 0) * 100)}%</span>}
                      </td>
                      <td className="px-2 py-2.5 tabular">{fmtInt(v.total_images)}</td>
                      <td className="px-2 py-2.5 tabular">{fmtInt(v.class_count)}</td>
                      <td className="px-2 py-2.5 tabular">{v.warning_count ?? 0}</td>
                      <td className="px-2 py-2.5 tabular">{v.model_count ?? 0}</td>
                      <td className="px-2 py-2.5 text-ink-2">{fmtDate(v.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}
    </div>
  );
}
