import { motion } from 'framer-motion';
import { Check, Droplets, Eye, Leaf, Plus, ShieldCheck, Sprout } from 'lucide-react';
import type { Recommendation } from '@/models';
import { cn } from '@/lib/utils';
import { useFarmStore } from '@/state/farmStore';
import { toast } from '@/state/toastStore';
import { BasisList } from '@/components/ui/provenance';
import { Disclosure, PriorityBadge } from '@/components/ui/primitives';
import { rise } from '@/components/ui/motion';

export const CATEGORY_ICON = {
  nutrient: Sprout,
  protection: ShieldCheck,
  soil: Leaf,
  water: Droplets,
  monitoring: Eye,
} as const;

export const CATEGORY_LABEL = {
  nutrient: 'Nutrition',
  protection: 'Crop protection',
  soil: 'Soil building',
  water: 'Water',
  monitoring: 'Scouting',
} as const;

export function usePlanned(farmId: string, recId: string) {
  const planned = useFarmStore((s) => s.plan.find((p) => p.farmId === farmId && p.recommendationId === recId));
  const setPlan = useFarmStore((s) => s.setPlan);
  const removePlan = useFarmStore((s) => s.removePlan);
  return {
    planned,
    toggle: (title: string) => {
      if (planned) {
        removePlan(farmId, recId);
        toast('Removed from plan', title, 'info');
      } else {
        setPlan({ farmId, recommendationId: recId, title, status: 'planned', updatedAt: new Date().toISOString() });
        toast('Added to your plan', title);
      }
    },
  };
}

export function PlanButton({ farmId, rec, compact }: { farmId: string; rec: Recommendation; compact?: boolean }) {
  const { planned, toggle } = usePlanned(farmId, rec.id);
  return (
    <button
      type="button"
      onClick={() => toggle(rec.title)}
      aria-pressed={Boolean(planned)}
      className={cn(planned ? 'btn bg-accent-soft text-accent hover:brightness-95' : 'btn-secondary', compact && 'px-3 py-1.5 text-label')}
    >
      {planned ? <Check className="h-4 w-4" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
      {planned ? 'In plan' : 'Add to plan'}
    </button>
  );
}

/**
 * Observation → Risk → Recommendation → Priority → Why → Basis.
 * The action is visible; the reasoning is one click away.
 */
export function RecommendationCard({ rec, farmId, showPlan = true, defaultOpen = false }: { rec: Recommendation; farmId: string; showPlan?: boolean; defaultOpen?: boolean }) {
  const Icon = CATEGORY_ICON[rec.category];
  return (
    <motion.article variants={rise} className="card card-pad card-hover">
      <div className="flex items-start gap-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sunken text-ink-2">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <p className="eyebrow">{CATEGORY_LABEL[rec.category]}</p>
            <PriorityBadge level={rec.priority} />
          </div>
          <h3 className="mt-1.5 text-h3">{rec.title}</h3>
          <p className="mt-1 text-ink-2 text-pretty">{rec.action}</p>
        </div>
      </div>

      <Disclosure summary="Why this recommendation" defaultOpen={defaultOpen} className="mt-5 border-t border-line/70 pt-4">
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="eyebrow mb-1">Observation</dt>
            <dd className="text-ink-2">{rec.observation}</dd>
          </div>
          <div>
            <dt className="eyebrow mb-1">Risk</dt>
            <dd className="text-ink-2">{rec.risk}</dd>
          </div>
          <div>
            <dt className="eyebrow mb-1">Why</dt>
            <dd className="text-ink-2">{rec.why}</dd>
          </div>
          <div>
            <dt className="eyebrow mb-1">Next step</dt>
            <dd className="text-ink-2">{rec.nextStep}</dd>
          </div>
        </dl>
        <div className="mt-5 rounded-ctl bg-sunken/60 p-4">
          <p className="eyebrow mb-3">Based on</p>
          <BasisList basis={rec.basis} />
        </div>
      </Disclosure>

      {showPlan && (
        <div className="mt-4 flex justify-end">
          <PlanButton farmId={farmId} rec={rec} />
        </div>
      )}
    </motion.article>
  );
}
