import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAuthStore } from '@/state/authStore';
import { LogoMark } from '@/components/layout/brand';

/** Where to go after login. Only same-app paths are allowed (no open redirects). */
export function safeNext(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith('/app') || raw.startsWith('//') || /[\\\r\n]/.test(raw)) return '/app';
  return raw;
}

export function AuthChecking() {
  return (
    <div className="grid min-h-dvh place-items-center bg-bg" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-4">
        <LogoMark className="h-10 w-10 animate-pulse" />
        <p className="text-sm text-ink-3">Checking your session…</p>
      </div>
    </div>
  );
}

/** Route guard: the app shell and its pages are never rendered without a session. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const status = useAuthStore((s) => s.status);
  const location = useLocation();
  if (status === 'loading') return <AuthChecking />;
  if (status !== 'authenticated') {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  return <>{children}</>;
}
