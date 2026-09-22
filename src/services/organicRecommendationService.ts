import type {
  Analysis,
  CropInfo,
  Farm,
  GrowthStatus,
  Level,
  OrganicPractice,
  OrganicRecommendation,
  Recommendation,
  RiskResult,
  SoilReport,
} from '@/models';
import { round } from '@/lib/utils';
import { knowledge } from './data';

/**
 * Organic recommendation engine.
 *   farm context → condition tags → match practices in the organic dataset → rank → explain
 * Nothing here is written for a specific crop or UI; the practices and their conditions
 * come from data/organic-practices.json (to be replaced by the verified dataset).
 */

interface Condition {
  tag: string;
  weight: number; // relative importance for ranking
  priority: Level;
  label: string; // human-readable reason
  source: string;
}

// Practices that need an empty field or pre-sowing application — deferred when a crop is standing.
const NEXT_SEASON_PRACTICES = new Set(['fym', 'green-manure', 'legume-rotation', 'rhizobium', 'trichoderma', 'residue-mulch', 'enriched-compost']);
const PRIORITY_RANK: Record<Level, number> = { high: 0, medium: 1, low: 2 };

function conditionsFrom(soil: SoilReport | null, risks: RiskResult[]): Condition[] {
  const out: Condition[] = [];
  if (soil) {
    const r = (k: string) => soil.readings.find((x) => x.key === k);
    const push = (tag: string, key: string, weight: number, priority: Level) => {
      const reading = r(key);
      if (soil.conditions.includes(tag) && reading)
        out.push({ tag, weight, priority, label: `${reading.label} is ${reading.band.label.toLowerCase()} (${reading.value}${reading.unit ? ` ${reading.unit}` : ''})`, source: 'Soil test' });
    };
    push('low-nitrogen', 'nitrogen', 1, 'medium');
    push('low-organic-carbon', 'organicCarbon', 0.9, 'medium');
    push('low-phosphorus', 'phosphorus', 0.8, 'medium');
    push('low-potassium', 'potassium', 0.8, 'medium');
    push('low-zinc', 'zinc', 0.6, 'low');
    push('low-sulphur', 'sulphur', 0.5, 'low');
    push('alkaline', 'ph', 0.6, 'low');
    push('dry-soil', 'moisture', 0.5, 'medium');
  }
  for (const risk of risks) {
    if (risk.status !== 'ok' || risk.level === 'low') continue;
    const pr: Level = risk.level;
    const subject = risk.subject?.toLowerCase() ?? '';
    if (risk.kind === 'disease' && subject.includes('rust'))
      out.push({ tag: 'rust-risk', weight: pr === 'high' ? 1.2 : 0.8, priority: pr, label: `Weather favours ${subject} (${risk.level} risk)`, source: 'Risk engine' });
    if (risk.kind === 'disease' && subject.includes('mildew'))
      out.push({ tag: 'mildew-risk', weight: 0.7, priority: pr, label: `Conditions favour ${subject}`, source: 'Risk engine' });
    if (risk.kind === 'pest' && subject.includes('aphid'))
      out.push({ tag: 'aphid-risk', weight: pr === 'high' ? 1 : 0.7, priority: pr === 'high' ? 'high' : 'medium', label: `Aphid build-up possible (${risk.level} risk)`, source: 'Risk engine' });
    if (risk.kind === 'water' && !out.some((c) => c.tag === 'dry-soil'))
      out.push({ tag: 'dry-soil', weight: 0.5, priority: 'medium', label: 'Soil moisture is getting low', source: 'Risk engine' });
  }
  return out;
}

function toRecommendation(p: OrganicPractice, matched: Condition[], when: 'now' | 'next-season', crop: CropInfo, growth: GrowthStatus, soil: SoilReport | null): Recommendation {
  const priorities: Level[] = matched.map((m) => m.priority);
  const priority: Level = when === 'next-season' ? 'low' : priorities.includes('high') ? 'high' : priorities.includes('medium') ? 'medium' : 'low';
  return {
    id: `organic-${p.id}`,
    category: p.category === 'protection' ? 'protection' : p.category === 'soil' ? 'soil' : 'nutrient',
    priority,
    title: p.name,
    observation: matched.map((m) => m.label).join('; '),
    risk:
      p.category === 'protection'
        ? 'Problems caught late are harder to manage without synthetic inputs.'
        : p.category === 'soil'
          ? 'Soil structure and organic matter decline slowly if not rebuilt.'
          : 'Crop growth may be limited if the deficiency persists.',
    action: p.summary,
    why: `Matches ${matched.length} condition${matched.length > 1 ? 's' : ''} on this farm: ${matched.map((m) => m.label.toLowerCase()).join('; ')}.`,
    nextStep: when === 'now' ? p.howTo[0] : `Plan for next season — ${p.timing.toLowerCase()}`,
    basis: {
      factors: [
        { label: 'Crop', value: crop.name },
        { label: 'Stage', value: growth.stage?.name ?? '—' },
        ...(soil ? [{ label: 'Soil test', value: soil.testDate }] : []),
        ...matched.map((m) => ({ label: m.source, value: m.label })),
      ],
      sources: soil ? ['demo-dataset', 'reference-ranges', 'demo-rules'] : ['demo-rules'],
      note: p.evidence,
    },
    practiceId: p.id,
    engine: 'demo-rules',
  };
}

export const organicRecommendationService = {
  practices: () => knowledge.organicPractices(),

  async recommend(args: {
    farm: Farm;
    crop: CropInfo;
    growth: GrowthStatus;
    soil: SoilReport | null;
    risks: RiskResult[];
  }): Promise<Analysis<{ items: OrganicRecommendation[]; notes: string[] }>> {
    const { farm, crop, growth, soil, risks } = args;
    const practices = await knowledge.organicPractices();
    const conditions = conditionsFrom(soil, risks);
    const notes: string[] = [];

    if (!soil) notes.push('No soil test — nutrient recommendations are withheld until one is added.');
    if (farm.method === 'conventional') notes.push('This farm is managed conventionally. These organic practices can complement the current plan.');
    if (!conditions.length) {
      return soil
        ? { status: 'ok', data: { items: [], notes: [...notes, 'No soil or risk conditions currently call for an intervention.'] }, basis: { factors: [], sources: ['demo-rules'] } }
        : { status: 'insufficient', missing: ['Soil test', 'Weather / risk data'], message: 'Insufficient data for a reliable recommendation.' };
    }

    const stageId = growth.stage?.id ?? '';
    const standingCrop = growth.daysAfterSowing > 20 && growth.progress < 1;
    const items: OrganicRecommendation[] = [];

    for (const p of practices) {
      if (!p.crops.includes('*') && !p.crops.includes(crop.id)) continue;
      const matched = conditions.filter((c) => p.addresses.includes(c.tag));
      if (!matched.length) continue;

      const stageFits = p.stages.includes('*') || p.stages.includes(stageId);
      const when: 'now' | 'next-season' = standingCrop && (NEXT_SEASON_PRACTICES.has(p.id) || !stageFits) ? 'next-season' : 'now';
      const hasInputs = p.usesInputs.length === 0 || p.usesInputs.some((i) => farm.availableInputs.includes(i as Farm['availableInputs'][number]));

      const base = matched.reduce((a, m) => a + m.weight, 0);
      const relevance = base * (when === 'now' ? 1 : 0.55) * (hasInputs ? 1 : 0.8);
      items.push({
        practice: p,
        relevance,
        matched: matched.map((m) => m.label),
        hasInputs,
        when,
        recommendation: toRecommendation(p, matched, when, crop, growth, soil),
      });
    }

    const max = Math.max(...items.map((i) => i.relevance), 1);
    items.forEach((i) => (i.relevance = round(i.relevance / max, 2)));
    // Act-now first, then urgency, then rule relevance.
    items.sort(
      (a, b) =>
        (a.when === b.when ? 0 : a.when === 'now' ? -1 : 1) ||
        PRIORITY_RANK[a.recommendation.priority] - PRIORITY_RANK[b.recommendation.priority] ||
        b.relevance - a.relevance,
    );

    return {
      status: 'ok',
      data: { items, notes },
      basis: {
        factors: [
          { label: 'Crop', value: `${crop.name} · ${growth.stage?.name ?? '—'}` },
          { label: 'Method', value: farm.method },
          { label: 'Conditions found', value: String(conditions.length) },
          { label: 'Inputs on farm', value: farm.availableInputs.length ? farm.availableInputs.join(', ') : 'none listed' },
        ],
        sources: ['demo-rules', ...(soil ? (['reference-ranges'] as const) : [])],
        note: 'Ranking = matched farm conditions × timing fit × input availability. It is a rule score, not a probability.',
      },
    };
  },
};
