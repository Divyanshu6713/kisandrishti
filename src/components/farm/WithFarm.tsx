import { AlertTriangle, CalendarClock, FlaskConical } from 'lucide-react';
import type { ReactNode } from 'react';
import { useFarmContext } from '@/hooks/useFarmContext';
import { formatDate } from '@/lib/utils';
import type { FarmContext } from '@/services';
import { PageSkeleton } from '@/components/layout/AppShell';

/** Renders children with the selected farm's context, handling loading and error states. */
export function WithFarm({ children }: { children: (ctx: FarmContext) => ReactNode }) {
  const state = useFarmContext();
  if (state.ctx) return <>{children(state.ctx)}</>;
  if (state.status === 'error')
    return (
      <div className="card card-pad flex items-start gap-3" role="alert">
        <AlertTriangle className="mt-0.5 h-5 w-5 text-danger" aria-hidden />
        <div>
          <p className="font-semibold">Could not load this farm</p>
          <p className="text-sm text-ink-2">{state.error}</p>
          <button type="button" className="btn-secondary mt-4" onClick={state.reload}>
            Try again
          </button>
        </div>
      </div>
    );
  return <PageSkeleton />;
}

/** One quiet line that keeps the demo honest: which farm, which date, which engine. */
export function ScenarioNote({ ctx }: { ctx: FarmContext }) {
  return (
    <p className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-1 text-label text-ink-3">
      <span className="inline-flex items-center gap-1.5">
        <CalendarClock className="h-3.5 w-3.5" aria-hidden />
        {ctx.farm.isDemo ? `Demo scenario · as of ${formatDate(ctx.asOf)}` : `As of ${formatDate(ctx.asOf)}`}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <FlaskConical className="h-3.5 w-3.5" aria-hidden />
        {ctx.farm.isDemo ? 'Sample data · rule-based engine' : 'Your data · rule-based engine'}
      </span>
    </p>
  );
}
