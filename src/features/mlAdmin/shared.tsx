import { AlertTriangle, CircleAlert, Info, KeyRound, Loader2, LogOut, ShieldCheck } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { NavLink } from 'react-router';
import type { Tone } from '@/models';
import type { DatasetStatus, JobStatus, ModelStatus, ValidationWarning } from '@/models/mlAdmin';
import { cn } from '@/lib/utils';
import { MlApiError, mlApiConfigured } from '@/services/mlAdmin/api';
import { authProvider } from '@/services/auth';
import { useAuthStore } from '@/state/authStore';
import { useMlAdmin } from '@/state/mlAdminStore';
import { Pill } from '@/components/ui/primitives';
import { toneText } from '@/components/ui/tone';

// ------------------------------------------------------------------ formatting (never invents values)

export const NA = 'Not available';

export function fmtPct(v: number | null | undefined, digits = 1): string {
  return v === null || v === undefined || Number.isNaN(v) ? NA : `${(v * 100).toFixed(digits)}%`;
}

export function fmtNum(v: number | null | undefined, digits = 4): string {
  return v === null || v === undefined || Number.isNaN(v) ? NA : Number(v.toFixed(digits)).toString();
}

export function fmtInt(v: number | null | undefined): string {
  return v === null || v === undefined ? NA : v.toLocaleString('en-IN');
}

export function fmtBytes(v: number | null | undefined): string {
  if (v === null || v === undefined) return NA;
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let x = v;
  while (x >= 1024 && i < u.length - 1) {
    x /= 1024;
    i++;
  }
  return `${x.toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return NA;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? NA : d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function fmtDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || seconds < 0) return NA;
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h ? `${h} h ${m} min` : m ? `${m} min ${r} s` : `${r} s`;
}

export function elapsedSince(iso: string | null | undefined, until?: string | null): number | null {
  if (!iso) return null;
  const end = until ? new Date(until).getTime() : Date.now();
  return (end - new Date(iso).getTime()) / 1000;
}

export function errorMessage(e: unknown): string {
  if (e instanceof MlApiError) return e.message;
  return 'Something went wrong. Please try again.';
}

// ------------------------------------------------------------------ status badges

const DATASET_STATUS: Record<DatasetStatus, [string, Tone]> = {
  awaiting_upload: ['Not validated · awaiting upload', 'neutral'],
  uploading: ['Not validated · uploading', 'ok'],
  upload_failed: ['Upload failed', 'bad'],
  queued: ['Not validated · queued', 'ok'],
  validating: ['Validating', 'ok'],
  ready: ['Ready', 'good'],
  ready_with_warnings: ['Ready with warnings', 'warn'],
  invalid: ['Invalid', 'bad'],
  failed: ['Validation failed', 'bad'],
};

const JOB_STATUS: Record<JobStatus, [string, Tone]> = {
  queued: ['Queued', 'neutral'],
  preparing: ['Preparing', 'ok'],
  training: ['Training', 'ok'],
  validating: ['Validating', 'ok'],
  evaluating: ['Evaluating', 'ok'],
  completed: ['Completed', 'good'],
  failed: ['Failed', 'bad'],
  cancel_requested: ['Cancelling…', 'warn'],
  cancelled: ['Cancelled', 'neutral'],
};

const MODEL_STATUS: Record<ModelStatus, [string, Tone]> = {
  training: ['Training', 'ok'],
  ready: ['Ready', 'good'],
  deployed: ['Deployed', 'good'],
  archived: ['Archived', 'neutral'],
  failed: ['Failed', 'bad'],
  evaluation_failed: ['Evaluation failed', 'bad'],
  cancelled: ['Cancelled', 'neutral'],
};

function Badge([label, tone]: [string, Tone]) {
  return <Pill tone={tone}>{label}</Pill>;
}

export const DatasetStatusBadge = ({ status }: { status: DatasetStatus }) => Badge(DATASET_STATUS[status] ?? [status, 'neutral']);
export const JobStatusBadge = ({ status }: { status: JobStatus }) => Badge(JOB_STATUS[status] ?? [status, 'neutral']);
export const ModelStatusBadge = ({ status }: { status: ModelStatus }) => Badge(MODEL_STATUS[status] ?? [status, 'neutral']);
export const isJobRunning = (s: JobStatus) => ['queued', 'preparing', 'training', 'validating', 'evaluating', 'cancel_requested'].includes(s);

// ------------------------------------------------------------------ small building blocks

export function KV({ rows, className }: { rows: [string, ReactNode][]; className?: string }) {
  return (
    <dl className={cn('grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm', className)}>
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-ink-3">{k}</dt>
          <dd className="min-w-0 break-words text-ink">{v ?? NA}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Metric({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="rounded-ctl border border-line/70 bg-surface p-4">
      <p className="text-label font-medium text-ink-3">{label}</p>
      <p className="mt-1 text-h3 font-semibold tabular text-ink">{value}</p>
      {hint && <p className="mt-0.5 text-label text-ink-3">{hint}</p>}
    </div>
  );
}

/** Accessible progress bar that follows live updates (the shared `Progress` animates once on view). */
export function LiveProgress({ value, label, tone = 'good' }: { value: number; label: string; tone?: Tone }) {
  const v = Math.max(0, Math.min(100, value));
  const fill = { good: 'bg-accent', ok: 'bg-info', warn: 'bg-warn', bad: 'bg-danger', neutral: 'bg-ink-3' }[tone];
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v)} className="h-2 w-full overflow-hidden rounded-full bg-sunken">
      <div className={cn('h-full rounded-full transition-[width] duration-700 ease-calm', fill)} style={{ width: `${v}%` }} />
    </div>
  );
}

export function ErrorNote({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-card border border-danger/30 bg-danger-soft/60 p-4 text-sm">
      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />
      <div className="min-w-0 flex-1 text-ink">
        <span className="font-semibold">Error: </span>
        {children}
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
  );
}

const SEVERITY: Record<ValidationWarning['severity'], { icon: typeof Info; tone: Tone; label: string }> = {
  error: { icon: CircleAlert, tone: 'bad', label: 'Error' },
  warning: { icon: AlertTriangle, tone: 'warn', label: 'Warning' },
  info: { icon: Info, tone: 'ok', label: 'Note' },
};

export function WarningList({ warnings, empty = 'No warnings.' }: { warnings: ValidationWarning[]; empty?: string }) {
  if (!warnings.length) return <p className="text-sm text-ink-3">{empty}</p>;
  const order = { error: 0, warning: 1, info: 2 };
  return (
    <ul className="space-y-2">
      {[...warnings]
        .sort((a, b) => order[a.severity] - order[b.severity])
        .map((w, i) => {
          const s = SEVERITY[w.severity];
          const Icon = s.icon;
          return (
            <li key={`${w.code}-${i}`} className="flex items-start gap-2.5 text-sm">
              <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', toneText[s.tone])} aria-hidden />
              <span className="text-ink-2">
                <span className={cn('font-semibold', toneText[s.tone])}>{s.label}: </span>
                {w.message}
              </span>
            </li>
          );
        })}
    </ul>
  );
}

// ------------------------------------------------------------------ data hooks

/** Loads data and optionally re-polls while `pollMs(data)` returns a number (e.g. while training runs). */
export function useAdminData<T>(load: () => Promise<T>, deps: unknown[], pollMs?: (data: T | null) => number | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const loadRef = useRef(load);
  loadRef.current = load;
  const pollRef = useRef(pollMs);
  pollRef.current = pollMs;

  const reload = useCallback(async () => {
    try {
      const d = await loadRef.current();
      setData(d);
      setError(null);
      return d;
    } catch (e) {
      setError(e);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    let timer = 0;
    setLoading(true);
    const tick = async () => {
      const d = await reload();
      if (!alive) return;
      const ms = pollRef.current?.(d);
      if (ms) timer = window.setTimeout(tick, ms);
    };
    void tick();
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  return { data, error, loading, reload, setData };
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <p className="flex items-center gap-2 py-8 text-sm text-ink-3" role="status">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {label}
    </p>
  );
}

// ------------------------------------------------------------------ navigation + sign-in gate

const TABS = [
  { to: '/app/admin/ml', label: 'Dashboard', end: true },
  { to: '/app/admin/ml/datasets', label: 'Datasets & validation' },
  { to: '/app/admin/ml/training', label: 'Training' },
  { to: '/app/admin/ml/models', label: 'Models & evaluation' },
  { to: '/app/admin/ml/test', label: 'Test prediction' },
  { to: '/app/admin/ml/deployment', label: 'Deployment' },
];

export function AdminSubNav() {
  const admin = useMlAdmin((s) => s.admin);
  const signOut = useMlAdmin((s) => s.signOut);
  return (
    <div className="mb-8 flex flex-col gap-3 border-b border-line pb-3 lg:flex-row lg:items-end lg:justify-between">
      <nav aria-label="AI Model Training" className="-mx-1 flex gap-1 overflow-x-auto px-1 scrollbar-none">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              cn('whitespace-nowrap rounded-ctl px-3 py-2 text-sm font-semibold transition-colors', isActive ? 'bg-surface text-ink shadow-soft' : 'text-ink-3 hover:bg-sunken hover:text-ink-2')
            }
          >
            {t.label}
          </NavLink>
        ))}
      </nav>
      {admin && (
        <div className="flex shrink-0 items-center gap-2 text-label text-ink-3">
          <ShieldCheck className="h-4 w-4 text-accent" aria-hidden />
          <span>
            ML admin: <span className="font-semibold text-ink-2">{admin.name}</span>
          </span>
          {admin.method === 'key' && (
            <button type="button" className="btn-ghost px-2 py-1 text-label" onClick={signOut}>
              <LogOut className="h-3.5 w-3.5" aria-hidden /> Leave admin
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Nothing inside renders until the server has confirmed this browser holds an ML-admin session. */
export function AdminGate({ children }: { children: ReactNode }) {
  const { status, error, check, signInWithKey, signInWithAccount } = useMlAdmin();
  const session = useAuthStore((s) => s.session);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const accountPossible = authProvider.id === 'supabase' && session && !session.user.isDemo;

  useEffect(() => {
    if (status === 'unknown') void check();
  }, [status, check]);

  if (!mlApiConfigured())
    return (
      <div className="card card-pad max-w-xl">
        <h2 className="text-h3">ML backend not configured</h2>
        <p className="mt-2 text-sm text-ink-2">
          AI Model Training needs the Kisan Drishti ML backend. Set <code className="rounded bg-sunken px-1">VITE_API_BASE</code> (for example <code className="rounded bg-sunken px-1">http://127.0.0.1:8000</code>) and restart the site. See <code className="rounded bg-sunken px-1">docs/ML_TRAINING_SYSTEM.md</code>.
        </p>
      </div>
    );
  if (status === 'unknown' || status === 'checking') return <Loading label="Checking administrator access…" />;
  if (status === 'signed-in') return <>{children}</>;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!key.trim()) return;
    setBusy(true);
    await signInWithKey(key.trim());
    setKey('');
    setBusy(false);
  };

  return (
    <div className="card card-pad max-w-lg">
      <div className="tile-icon mb-4">
        <KeyRound className="h-5 w-5" aria-hidden />
      </div>
      <h2 className="text-h3">Administrator sign-in</h2>
      <p className="mt-1.5 text-sm text-ink-2">AI Model Training is only for Kisan Drishti administrators. Access is checked by the server on every action.</p>
      <form onSubmit={submit} className="mt-5 space-y-3">
        <div>
          <label htmlFor="ml-admin-key" className="field-label">
            Admin key
          </label>
          <input id="ml-admin-key" type="password" autoComplete="current-password" className="field" value={key} onChange={(e) => setKey(e.target.value)} data-autofocus />
        </div>
        {error && <p className="text-sm text-danger" role="alert">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="submit" className="btn-primary" disabled={busy || !key.trim()}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Sign in
          </button>
          {accountPossible && (
            <button type="button" className="btn-secondary" onClick={() => void signInWithAccount()}>
              Use my Kisan Drishti account
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
