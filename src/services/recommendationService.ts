import type {
  Analysis,
  CropHealthReport,
  CropInfo,
  Farm,
  FieldObservation,
  GrowthStatus,
  Level,
  OrganicRecommendation,
  PlannedAction,
  Recommendation,
  RiskResult,
  SoilReport,
  WeatherSnapshot,
} from '@/models';
import { daysBetween, formatShortDate, formatWeekday } from '@/lib/utils';

/**
 * Farm Advisor — combines SOIL + CROP + WEATHER + DISEASE + METHOD + STAGE into a short,
 * prioritised list. Each item states observation → risk → action → priority → why → basis.
 * It only speaks when a signal exists; missing inputs are reported, not guessed.
 */

export interface DataCheck {
  label: string;
  status: 'ok' | 'stale' | 'missing';
  detail: string;
}

export interface AdvisorReport {
  headline: string;
  items: Recommendation[];
  completeness: DataCheck[];
  openIssues: number;
  addressed: number;
  status: 'needs-attention' | 'on-track' | 'all-clear' | 'insufficient';
  topAction: Recommendation | null;
}

export interface FarmHealth {
  score: number | null;
  label: string;
  components: { key: 'soil' | 'crop' | 'water'; label: string; score: number | null; weight: number }[];
  missing: string[];
}

interface Ctx {
  farm: Farm;
  crop: CropInfo;
  growth: GrowthStatus;
  asOf: string;
  soil: Analysis<SoilReport>;
  moisture: { pct: number; date: string } | null;
  weather: WeatherSnapshot | null;
  risks: RiskResult[];
  cropHealth: CropHealthReport;
  observations: FieldObservation[];
  organic: Analysis<{ items: OrganicRecommendation[]; notes: string[] }>;
  plan: PlannedAction[];
}

const PRIORITY_ORDER: Record<Level, number> = { high: 0, medium: 1, low: 2 };
const SOIL_TEST_STALE_DAYS = 365;
const MOISTURE_STALE_DAYS = 7;

const recentObs = (obs: FieldObservation[], asOf: string, tag: string, days = 21) =>
  obs.find((o) => o.tag === tag && daysBetween(o.date, asOf) >= 0 && daysBetween(o.date, asOf) <= days);

export const recommendationService = {
  farmHealth(ctx: Pick<Ctx, 'soil' | 'cropHealth' | 'risks'>): FarmHealth {
    const soil = ctx.soil.status === 'ok' ? ctx.soil.data.score : null;
    const water = ctx.risks.find((r) => r.kind === 'water');
    const waterScore = water && water.status === 'ok' ? 100 - water.score : null;
    const components: FarmHealth['components'] = [
      { key: 'soil', label: 'Soil', score: soil, weight: 0.35 },
      { key: 'crop', label: 'Crop', score: ctx.cropHealth.score, weight: 0.45 },
      { key: 'water', label: 'Water', score: waterScore, weight: 0.2 },
    ];
    const known = components.filter((c) => c.score !== null);
    const missing = components.filter((c) => c.score === null).map((c) => c.label);
    if (known.length < 2) return { score: null, label: 'Not enough data', components, missing };
    const w = known.reduce((a, c) => a + c.weight, 0);
    const score = Math.round(known.reduce((a, c) => a + (c.score as number) * c.weight, 0) / w);
    return { score, label: score >= 75 ? 'Good' : score >= 55 ? 'Fair' : 'Needs attention', components, missing };
  },

  advise(ctx: Ctx): AdvisorReport {
    const { crop, growth, asOf, soil, moisture, weather, risks, observations, organic, plan, farm } = ctx;
    const items: (Recommendation & { phrase: string })[] = [];
    const organicNow = organic.status === 'ok' ? organic.data.items.filter((i) => i.when === 'now') : [];
    const stageName = growth.stage?.name.toLowerCase() ?? 'current stage';
    const isOrganic = farm.method !== 'conventional';
    const soilReport = soil.status === 'ok' ? soil.data : null;

    // 1 — Nutrition
    const lowN = soilReport?.readings.find((r) => r.key === 'nitrogen' && r.band.status === 'low');
    if (lowN && soilReport) {
      const pale = recentObs(observations, asOf, 'pale-leaves');
      const option = organicNow.find((o) => o.practice.addresses.includes('low-nitrogen'));
      items.push({
        id: 'adv-nitrogen',
        phrase: 'low soil nitrogen',
        category: 'nutrient',
        priority: pale?.severity === 'high' ? 'high' : 'medium',
        title: 'Support nitrogen supply',
        observation: `Soil nitrogen is low (${lowN.value} kg/ha, below 280)${pale ? ` and older leaves look pale (${formatShortDate(pale.date)})` : ''}.`,
        risk: `Growth may be reduced if the deficiency persists through ${stageName}.`,
        action: isOrganic
          ? `Consider an organic nitrogen intervention${option ? ` — e.g. ${option.practice.name.toLowerCase()}` : ''} on the weaker patch.`
          : 'Consider a nitrogen correction based on your soil test and local recommendation.',
        why: pale
          ? 'Two independent signals agree: the soil test and your field observation.'
          : 'The soil test places nitrogen in the low category. No field symptom has been recorded yet.',
        nextStep: option ? option.practice.howTo[0] : 'Discuss the quantity with your local agriculture officer.',
        basis: {
          factors: [
            { label: 'Soil test', value: `${soilReport.testDate} · N ${lowN.value} kg/ha` },
            ...(pale ? [{ label: 'Observation', value: pale.note }] : []),
            { label: 'Stage', value: growth.stage?.name ?? '—' },
            { label: 'Method', value: farm.method },
          ],
          sources: ['demo-dataset', 'reference-ranges', 'demo-rules'],
          note: daysBetween(soilReport.testDate, asOf) > 60 ? `Soil test is ${daysBetween(soilReport.testDate, asOf)} days old — levels may have changed.` : undefined,
        },
        practiceId: option?.practice.id,
        horizon: 'this-week',
        area: pale?.area,
        engine: 'demo-rules',
      });
    }

    // 2 — Disease
    const disease = risks.find((r) => r.kind === 'disease' && r.status === 'ok');
    if (disease && disease.level !== 'low') {
      const scan = observations.find((o) => o.kind === 'disease-scan' && o.tag && disease.subject && o.note.toLowerCase().includes(disease.subject.toLowerCase()));
      const next3 = weather?.days.slice(0, 3) ?? [];
      items.push({
        id: 'adv-disease',
        phrase: `weather that favours ${disease.subject?.toLowerCase()}`,
        category: 'monitoring',
        priority: disease.level,
        title: scan ? `Confirm and report ${disease.subject?.toLowerCase()}` : `Scout for ${disease.subject?.toLowerCase()} this week`,
        observation: next3.length
          ? `Next 3 days: ${Math.min(...next3.map((d) => d.tMin))}–${Math.max(...next3.map((d) => d.tMax))} °C, ~${Math.round(next3.reduce((a, d) => a + d.humidity, 0) / next3.length)}% humidity; crop at ${stageName}.${scan ? ` A leaf scan on ${formatShortDate(scan.date)} matched it.` : ''}`
          : disease.headline,
        risk: 'It can spread quickly while these conditions last. Early patches are much easier to manage.',
        action: scan
          ? 'Mark affected patches and report them to your local agriculture officer / KVK for approved options.'
          : 'Walk the field in a W-pattern twice this week and check 20+ plants for early symptoms.',
        why: disease.drivers.slice(0, 3).map((d) => d.label).join('; ') + '.',
        nextStep: 'Upload a close-up photo of any suspicious leaf in Disease Analysis.',
        basis: {
          factors: [
            { label: 'Risk score', value: `${disease.score}/100 (${disease.level})` },
            { label: 'Stage', value: growth.stage?.name ?? '—' },
            ...(weather ? [{ label: 'Weather', value: weather.source === 'sample-forecast' ? 'Sample forecast' : 'Live forecast' }] : []),
            ...(scan ? [{ label: 'Leaf scan', value: scan.note }] : []),
          ],
          sources: [weather?.source ?? 'sample-forecast', 'demo-rules'],
        },
        horizon: scan ? 'now' : 'this-week',
        area: scan?.area,
        engine: 'demo-rules',
      });
    }

    // 3 — Water
    const water = risks.find((r) => r.kind === 'water' && r.status === 'ok');
    if (water && water.level !== 'low' && moisture) {
      const rainDays = weather?.days.filter((d) => d.rainMm > 0) ?? [];
      const rain = rainDays.reduce((a, d) => a + d.rainMm, 0);
      items.push({
        id: 'adv-water',
        phrase: 'soil moisture near the limit',
        category: 'water',
        priority: water.level,
        title: rain > 0 ? 'Re-check moisture after the rain' : 'Plan the next irrigation',
        observation: `Soil moisture ${moisture.pct}% (${formatShortDate(moisture.date)}) against ~${crop.moistureFloor}% for ${crop.name.toLowerCase()}; ${growth.stage?.waterCritical ? 'current stage is irrigation-critical' : 'stage is not irrigation-critical'}.`,
        risk: 'Water stress at critical stages can reduce tillers and grain set.',
        action:
          rain > 0
            ? `Hold irrigation until after ${rain} mm rain on ${rainDays.map((d) => formatWeekday(d.date)).join('/')}; irrigate if moisture is still below ~${crop.moistureFloor}%.`
            : `Irrigate within the next few days if moisture stays below ~${crop.moistureFloor}%.`,
        why: water.drivers.map((d) => d.label).join('; ') + '.',
        nextStep: 'Check moisture by hand-feel or a probe at root depth after the rain.',
        basis: {
          factors: [
            { label: 'Moisture', value: `${moisture.pct}% on ${moisture.date}` },
            { label: 'Rain expected', value: `${rain} mm` },
            { label: 'Irrigation', value: farm.irrigation },
          ],
          sources: ['demo-dataset', weather?.source ?? 'sample-forecast', 'demo-rules'],
          note: 'The moisture floor is an indicative value for loamy soils.',
        },
        horizon: 'now',
        engine: 'demo-rules',
      });
    }

    // 4 — Pest
    const pest = risks.find((r) => r.kind === 'pest' && r.status === 'ok');
    if (pest && pest.level !== 'low') {
      const traps = organicNow.find((o) => o.practice.id === 'sticky-traps');
      items.push({
        id: 'adv-pest',
        phrase: `${pest.subject?.toLowerCase()} pressure`,
        category: 'protection',
        priority: pest.level === 'high' ? 'high' : 'low',
        title: `Monitor ${pest.subject?.toLowerCase()} — don’t spray by calendar`,
        observation: pest.drivers[0]?.label ?? pest.headline,
        risk: 'Populations can build up in cool, cloudy weather.',
        action: traps ? 'Place yellow sticky traps and count aphids and ladybirds twice a week.' : 'Count pests on 10 tillers at several spots, twice a week.',
        why: 'Monitoring tells you whether the numbers justify any action, which also protects natural enemies.',
        nextStep: 'Ask your local expert for the economic threshold before any spray.',
        basis: { factors: [{ label: 'Risk score', value: `${pest.score}/100` }, { label: 'Stage', value: growth.stage?.name ?? '—' }], sources: ['demo-rules'] },
        practiceId: traps?.practice.id,
        horizon: 'this-week',
        engine: 'demo-rules',
      });
    }

    // 5 — Long-term soil
    const lowOC = soilReport?.readings.find((r) => r.key === 'organicCarbon' && r.band.status === 'low');
    const alkaline = soilReport?.conditions.includes('alkaline');
    if (soilReport && (lowOC || alkaline)) {
      items.push({
        id: 'adv-soil-building',
        phrase: 'low organic carbon',
        category: 'soil',
        priority: 'low',
        title: 'Rebuild organic carbon next season',
        observation: [lowOC && `Organic carbon is ${lowOC.value}% (low)`, alkaline && `pH ${soilReport.readings.find((r) => r.key === 'ph')?.value} is slightly alkaline`].filter(Boolean).join('; ') + '.',
        risk: 'Low organic matter limits water holding, nutrient supply and soil life.',
        action: 'Retain crop residue, apply decomposed FYM before sowing, and use the summer window for green manure.',
        why: 'These practices build organic carbon over seasons. Green manure is also commonly used on alkaline soils.',
        nextStep: 'Add green-manure seed to the plan for after this harvest.',
        basis: { factors: [{ label: 'Soil test', value: soilReport.testDate }], sources: ['demo-dataset', 'reference-ranges', 'demo-rules'] },
        practiceId: 'green-manure',
        horizon: 'next-season',
        engine: 'demo-rules',
      });
    }

    if (!soilReport) {
      items.push({
        id: 'adv-soil-test',
        phrase: 'no soil test',
        category: 'soil',
        priority: 'medium',
        title: 'Add a soil test',
        observation: 'No soil test is available for this farm.',
        risk: 'Nutrient advice without a soil test would be guesswork.',
        action: 'Get a soil test (pH, N, P, K, organic carbon) from a soil-testing lab and enter it on the Soil page.',
        why: 'Insufficient data for a reliable nutrient recommendation.',
        nextStep: 'Open Soil → Add soil test.',
        basis: { factors: [], sources: ['demo-rules'] },
        horizon: 'this-week',
        engine: 'demo-rules',
      });
    }

    items.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);

    // Data completeness — what the advice is (and isn't) based on.
    const completeness: DataCheck[] = [];
    if (soilReport) {
      const age = daysBetween(soilReport.testDate, asOf);
      completeness.push({ label: 'Soil test', status: age > SOIL_TEST_STALE_DAYS ? 'stale' : 'ok', detail: `${formatShortDate(soilReport.testDate)} · ${age} days old` });
      if (soilReport.missing.length) completeness.push({ label: 'Soil parameters', status: 'missing', detail: `Not tested: ${soilReport.missing.join(', ')}` });
    } else completeness.push({ label: 'Soil test', status: 'missing', detail: 'Needed for nutrient advice' });
    if (moisture) {
      const age = daysBetween(moisture.date, asOf);
      completeness.push({ label: 'Soil moisture', status: age > MOISTURE_STALE_DAYS ? 'stale' : 'ok', detail: `${moisture.pct}% · ${formatShortDate(moisture.date)}` });
    } else completeness.push({ label: 'Soil moisture', status: 'missing', detail: 'Needed for water advice' });
    completeness.push(
      weather
        ? { label: 'Weather', status: weather.source === 'sample-forecast' ? 'stale' : 'ok', detail: weather.source === 'sample-forecast' ? 'Sample forecast, not live' : 'Live forecast' }
        : { label: 'Weather', status: 'missing', detail: 'Needed for risk estimates' },
    );
    const obsCount = observations.filter((o) => daysBetween(o.date, asOf) >= 0 && daysBetween(o.date, asOf) <= 14).length;
    completeness.push({ label: 'Field observations', status: obsCount ? 'ok' : 'missing', detail: obsCount ? `${obsCount} in the last 14 days` : 'None in the last 14 days' });
    const scan = observations.find((o) => o.kind === 'disease-scan' && daysBetween(o.date, asOf) <= 14);
    completeness.push({ label: 'Leaf scan', status: scan ? 'ok' : 'missing', detail: scan ? `${formatShortDate(scan.date)}` : 'No scan this fortnight' });

    const open = items.filter((i) => i.priority !== 'low');
    // An issue counts as addressed when its advisor item — or the organic practice it points to — is in the plan.
    const addressed = open.filter((i) => plan.some((p) => p.recommendationId === i.id || (i.practiceId && p.recommendationId === `organic-${i.practiceId}`))).length;
    const phrases = items.slice(0, 2).map((i) => i.phrase);
    const headline = items.length
      ? `Your ${crop.name.toLowerCase()} field (${stageName}, day ${growth.daysAfterSowing}) shows ${phrases.join(' and ')}.`
      : `Your ${crop.name.toLowerCase()} field shows no issues that need action right now.`;

    return {
      headline,
      items: items.map(({ phrase: _phrase, ...rec }) => rec),
      completeness,
      openIssues: open.length,
      addressed,
      status: !soilReport && !weather ? 'insufficient' : open.length === 0 ? 'all-clear' : addressed === open.length ? 'on-track' : 'needs-attention',
      topAction: items[0] ?? null,
    };
  },
};
