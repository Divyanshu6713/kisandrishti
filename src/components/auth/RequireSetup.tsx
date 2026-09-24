import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { usePrefs } from '@/state/prefsStore';

/** Signed-in users choose a language and a farming type once before the app opens. */
export function RequireSetup({ children }: { children: ReactNode }) {
  const language = usePrefs((s) => s.language);
  const mode = usePrefs((s) => s.mode);
  const location = useLocation();
  if (!language || !mode) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/welcome${language ? '/type' : ''}?next=${next}`} replace />;
  }
  return <>{children}</>;
}

/** /app itself: the field overview, or the rooftop garden for rooftop growers. */
export function ModeHome({ field }: { field: ReactNode }) {
  const mode = usePrefs((s) => s.mode);
  return mode === 'rooftop' ? <Navigate to="/app/garden" replace /> : <>{field}</>;
}
