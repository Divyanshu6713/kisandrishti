import type { ActionModule, FarmAction, PlannedAction, Recommendation, RecHorizon } from '@/models';

/**
 * Action layer — turns Farm Advisor recommendations into the farmer's to-do list.
 * It adds no new judgement: priority, wording and basis all come from the advisor rules.
 * What it adds is placement: when the rule says it applies, which records it read,
 * which module to open next, and whether the farmer has planned or finished it.
 */

const HORIZON_ORDER: Record<RecHorizon, number> = { now: 0, 'this-week': 1, 'next-season': 2 };

/** Basis factor label → the record it came from, in the farmer's words. Others are context, not signals. */
const SIGNAL: Record<string, string> = {
  'Soil test': 'Soil test',
  Observation: 'Field note',
  'Leaf scan': 'Leaf scan',
  Moisture: 'Moisture reading',
};

function signals(rec: Recommendation): string[] {
  const out = rec.basis.factors.map((f) => (f.label === 'Risk score' ? (rec.category === 'protection' ? 'Pest risk' : 'Disease risk') : SIGNAL[f.label])).filter(Boolean);
  if (rec.basis.sources.includes('sample-forecast')) out.push('Sample forecast');
  if (rec.basis.sources.includes('live-weather')) out.push('Live weather');
  if (rec.basis.sources.includes('user-input')) out.push('Your records');
  return [...new Set(out)];
}

function moduleFor(rec: Recommendation): ActionModule {
  switch (rec.category) {
    case 'nutrient':
      return rec.practiceId ? 'organic' : 'soil';
    case 'monitoring':
      return 'disease';
    case 'water':
      return 'weather';
    case 'protection':
      return 'risk';
    case 'soil':
      return 'soil';
  }
}

export const farmActionService = {
  /** The same "addressed" rule the advisor uses: the item, or the organic practice it points to, is in the plan. */
  planEntry(rec: Recommendation, plan: PlannedAction[]) {
    return plan.find((p) => p.recommendationId === rec.id || (rec.practiceId && p.recommendationId === `organic-${rec.practiceId}`));
  },

  fromAdvice(items: Recommendation[], plan: PlannedAction[]): FarmAction[] {
    return items
      .map((rec, i) => {
        const entry = this.planEntry(rec, plan);
        const action: FarmAction = {
          id: rec.id,
          rec,
          horizon: rec.horizon ?? 'this-week',
          signals: signals(rec),
          area: rec.area,
          // The dashboard marker sits on the patch named in the field notes; disease scouting starts there too.
          fieldTarget: rec.area || rec.category === 'monitoring' ? 'patch' : undefined,
          module: moduleFor(rec),
          plan: entry ? entry.status : 'open',
        };
        return { action, i };
      })
      .sort((a, b) => HORIZON_ORDER[a.action.horizon] - HORIZON_ORDER[b.action.horizon] || a.i - b.i)
      .map(({ action }) => action);
  },
};
