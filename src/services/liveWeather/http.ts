/**
 * Small fetch wrapper for public, key-less APIs: timeout, caller cancellation, JSON parsing
 * and error codes the UI can translate into calm messages (never raw stack traces).
 */
export type HttpErrorCode = 'timeout' | 'network' | 'http' | 'invalid' | 'aborted';

export class HttpError extends Error {
  constructor(
    public code: HttpErrorCode,
    public status?: number,
  ) {
    super(code);
    this.name = 'HttpError';
  }
}

export const isAbort = (e: unknown) => e instanceof HttpError && e.code === 'aborted';

export async function fetchJson(url: string, { signal, timeoutMs = 10_000 }: { signal?: AbortSignal; timeoutMs?: number } = {}): Promise<unknown> {
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = window.setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, timeoutMs);
  const onAbort = () => ctrl.abort();
  if (signal) {
    if (signal.aborted) ctrl.abort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' }, credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!res.ok) throw new HttpError('http', res.status);
    try {
      return await res.json();
    } catch {
      throw new HttpError('invalid');
    }
  } catch (e) {
    if (e instanceof HttpError) throw e;
    if (ctrl.signal.aborted) throw new HttpError(timedOut ? 'timeout' : 'aborted');
    throw new HttpError('network');
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

// ---- tiny response validators (no schema library needed for three endpoints) ----
export const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
export const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
export const isStr = (v: unknown): v is string => typeof v === 'string';
