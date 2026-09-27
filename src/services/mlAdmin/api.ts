import type {
  AdminIdentity,
  AuditEntry,
  Dataset,
  DatasetVersion,
  DeploymentState,
  ModelDetail,
  ModelSummary,
  Overview,
  PredictionResult,
  Split,
  TrainingConfig,
  TrainingJob,
  TrainingOptions,
  WorkerStatus,
  ActiveDeployment,
} from '@/models/mlAdmin';
import { authProvider } from '@/services/auth';
import { serviceConfig } from '../config';

/**
 * Client for the admin-only ML API (backend/kd_backend/api/admin.py).
 * Authorisation is enforced by the server on every call; this client only attaches the token.
 *
 * Token sources, in order:
 *   1. an admin-key session (issued by POST /v1/admin/session, kept in sessionStorage — ends with the tab)
 *   2. the signed-in Supabase account's access token (server grants admin by role/allow-list)
 */
const KEY = 'kd-ml-admin';

interface StoredSession {
  token: string;
  expiresAt: number; // epoch seconds
  admin: AdminIdentity;
}

export class MlApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'MlApiError';
  }
}

export const mlApiConfigured = () => Boolean(serviceConfig.apiBase);

function readSession(): StoredSession | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as StoredSession;
    if (!s?.token || typeof s.expiresAt !== 'number' || s.expiresAt * 1000 <= Date.now()) {
      sessionStorage.removeItem(KEY);
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

export function storedAdmin(): AdminIdentity | null {
  return readSession()?.admin ?? null;
}

export function clearAdminSession() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* storage blocked */
  }
}

async function token(): Promise<string | null> {
  const s = readSession();
  if (s) return s.token;
  try {
    return await authProvider.accessToken();
  } catch {
    return null;
  }
}

async function parseError(res: Response): Promise<MlApiError> {
  try {
    const body = (await res.json()) as { error?: { code?: string; message?: string; details?: Record<string, unknown> } };
    if (body?.error?.message) return new MlApiError(res.status, body.error.code ?? 'error', body.error.message, body.error.details);
  } catch {
    /* not JSON */
  }
  return new MlApiError(res.status, 'http_error', res.status >= 500 ? 'The ML server had a problem. Try again.' : `Request failed (${res.status}).`);
}

type Opts = { json?: unknown; body?: BodyInit; contentType?: string; signal?: AbortSignal; auth?: boolean };

async function request<T>(method: string, path: string, opts: Opts = {}): Promise<T> {
  if (!serviceConfig.apiBase) throw new MlApiError(0, 'not_configured', 'The ML backend is not configured (set VITE_API_BASE).');
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts.auth !== false) {
    const t = await token();
    if (t) headers.Authorization = `Bearer ${t}`;
  }
  let body = opts.body;
  if (opts.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.json);
  } else if (opts.contentType) headers['Content-Type'] = opts.contentType;
  let res: Response;
  try {
    res = await fetch(`${serviceConfig.apiBase}${path}`, { method, headers, body, signal: opts.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e;
    throw new MlApiError(0, 'network', 'Could not reach the ML server. Check that the backend is running.');
  }
  if (!res.ok) {
    const err = await parseError(res);
    if (res.status === 401 && readSession()) clearAdminSession();
    throw err;
  }
  return (await res.json()) as T;
}

/** XHR so the admin sees real upload progress for multi-GB archives. */
function uploadWithProgress(path: string, file: File, onProgress: (sent: number, total: number) => void, signal?: AbortSignal): Promise<DatasetVersion> {
  return new Promise((resolve, reject) => {
    void token().then((t) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', `${serviceConfig.apiBase}${path}`);
      if (t) xhr.setRequestHeader('Authorization', `Bearer ${t}`);
      xhr.setRequestHeader('Content-Type', 'application/zip');
      xhr.upload.onprogress = (e) => onProgress(e.loaded, e.lengthComputable ? e.total : file.size);
      xhr.onload = () => {
        let body: { error?: { code?: string; message?: string } } | DatasetVersion | null = null;
        try {
          body = JSON.parse(xhr.responseText);
        } catch {
          /* ignore */
        }
        if (xhr.status >= 200 && xhr.status < 300) resolve(body as DatasetVersion);
        else {
          const err = (body as { error?: { code?: string; message?: string } })?.error;
          reject(new MlApiError(xhr.status, err?.code ?? 'upload_failed', err?.message ?? `Upload failed (${xhr.status}).`));
        }
      };
      xhr.onerror = () => reject(new MlApiError(0, 'network', 'The upload was interrupted. Check the connection and try again.'));
      xhr.onabort = () => reject(new MlApiError(0, 'aborted', 'Upload cancelled.'));
      signal?.addEventListener('abort', () => xhr.abort(), { once: true });
      xhr.send(file);
    });
  });
}

export const mlAdminApi = {
  async signInWithKey(key: string): Promise<AdminIdentity> {
    const r = await request<{ token: string; expires_at: number; admin: AdminIdentity }>('POST', '/v1/admin/session', { json: { key }, auth: false });
    try {
      sessionStorage.setItem(KEY, JSON.stringify({ token: r.token, expiresAt: r.expires_at, admin: r.admin } satisfies StoredSession));
    } catch {
      /* storage blocked: session lasts for this page only */
    }
    return r.admin;
  },
  me: () => request<{ admin: AdminIdentity }>('GET', '/v1/admin/me').then((r) => r.admin),
  overview: () => request<Overview>('GET', '/v1/admin/overview'),

  datasets: () => request<{ datasets: Dataset[]; limits: { max_upload_bytes: number } }>('GET', '/v1/admin/datasets'),
  createVersion: (meta: Record<string, unknown>) => request<DatasetVersion>('POST', '/v1/admin/datasets/versions', { json: meta }),
  uploadArchive: (id: string, file: File, onProgress: (sent: number, total: number) => void, signal?: AbortSignal) =>
    uploadWithProgress(`/v1/admin/datasets/versions/${encodeURIComponent(id)}/archive`, file, onProgress, signal),
  version: (id: string) => request<DatasetVersion>('GET', `/v1/admin/datasets/versions/${encodeURIComponent(id)}`),
  updateProvenance: (id: string, changes: Record<string, unknown>) => request<DatasetVersion>('PATCH', `/v1/admin/datasets/versions/${encodeURIComponent(id)}`, { json: changes }),
  deleteVersion: (id: string, confirm: string) => request<{ deleted: boolean }>('POST', `/v1/admin/datasets/versions/${encodeURIComponent(id)}/delete`, { json: { confirm } }),
  createSplit: (id: string, s: { train_pct: number; val_pct: number; test_pct: number; seed: number }) =>
    request<Split>('POST', `/v1/admin/datasets/versions/${encodeURIComponent(id)}/splits`, { json: s }),

  trainingOptions: (datasetVersionId?: string, architecture?: string) => {
    const q = new URLSearchParams();
    if (datasetVersionId) q.set('dataset_version_id', datasetVersionId);
    if (architecture) q.set('architecture', architecture);
    return request<TrainingOptions>('GET', `/v1/admin/training/options?${q}`);
  },
  createJob: (body: { dataset_version_id: string; split_id: string; model_version: string; model_name: string; config: TrainingConfig }) =>
    request<TrainingJob>('POST', '/v1/admin/training/jobs', { json: body }),
  jobs: () => request<{ jobs: TrainingJob[]; worker: WorkerStatus }>('GET', '/v1/admin/training/jobs'),
  job: (id: string) => request<TrainingJob>('GET', `/v1/admin/training/jobs/${encodeURIComponent(id)}`),
  cancelJob: (id: string) => request<TrainingJob>('POST', `/v1/admin/training/jobs/${encodeURIComponent(id)}/cancel`),

  models: () => request<{ models: ModelSummary[]; active: ActiveDeployment | null }>('GET', '/v1/admin/models'),
  model: (id: string) => request<ModelDetail>('GET', `/v1/admin/models/${encodeURIComponent(id)}`),
  archiveModel: (id: string) => request<ModelDetail>('POST', `/v1/admin/models/${encodeURIComponent(id)}/archive`),
  unarchiveModel: (id: string) => request<ModelDetail>('POST', `/v1/admin/models/${encodeURIComponent(id)}/unarchive`),
  deleteModel: (id: string, confirm: string) => request<{ deleted: boolean }>('POST', `/v1/admin/models/${encodeURIComponent(id)}/delete`, { json: { confirm } }),
  testPredict: (id: string, file: File) => request<PredictionResult>('POST', `/v1/admin/models/${encodeURIComponent(id)}/predict`, { body: file, contentType: file.type }),
  async exportModel(id: string, version: string): Promise<void> {
    const t = await token();
    const res = await fetch(`${serviceConfig.apiBase}/v1/admin/models/${encodeURIComponent(id)}/export`, { headers: t ? { Authorization: `Bearer ${t}` } : {}, credentials: 'omit' });
    if (!res.ok) throw await parseError(res);
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    a.href = url;
    a.download = `kd-disease-model-v${version.replace(/[^0-9A-Za-z._-]/g, '_')}.zip`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  },

  deployment: () => request<DeploymentState>('GET', '/v1/admin/deployment'),
  deploy: (body: { model_id: string; confirm_override?: boolean; override_reason?: string; note?: string }) => request<DeploymentState>('POST', '/v1/admin/deployment/deploy', { json: body }),
  rollback: (body: { deployment_id?: string; confirm_override?: boolean; override_reason?: string; note?: string }) => request<DeploymentState>('POST', '/v1/admin/deployment/rollback', { json: body }),
  turnOff: (reason: string) => request<DeploymentState>('POST', '/v1/admin/deployment/turn-off', { json: { reason } }),
  setThreshold: (value: number) => request<DeploymentState>('PUT', '/v1/admin/settings/confidence-threshold', { json: { confidence_threshold: value } }),
  audit: (limit = 100) => request<{ entries: AuditEntry[] }>('GET', `/v1/admin/audit?limit=${limit}`),
};
