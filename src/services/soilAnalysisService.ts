import type {
  Analysis,
  CropInfo,
  CropSuitability,
  Farm,
  NutrientKey,
  NutrientReading,
  NutrientReference,
  RangeBand,
  SoilReport,
  SoilTest,
  Tone,
} from '@/models';
import { CORE_NUTRIENTS, insufficient } from '@/models';
import { clamp, round } from '@/lib/utils';
import { knowledge } from './data';

/**
 * Soil intelligence: classifies each soil-test value against reference ranges, scores
 * overall soil health, derives condition tags for the recommendation engine and checks
 * crop suitability. Ranges come from the soil-reference dataset, never from components.
 */

const TONE_POINTS: Record<Tone, number> = { good: 100, ok: 72, warn: 45, bad: 20, neutral: 60 };
const MIN_CORE_VALUES = 3;

function bandFor(ref: NutrientReference, value: number): RangeBand {
  return ref.bands.find((b) => b.max === null || value < b.max) ?? ref.bands[ref.bands.length - 1];
}

function conditionTags(readings: NutrientReading[], cropMoistureFloor: number): string[] {
  const tags = new Set<string>();
  for (const r of readings) {
    const s = r.band.status;
    if (r.key === 'nitrogen' && s === 'low') tags.add('low-nitrogen');
    if (r.key === 'phosphorus' && s === 'low') tags.add('low-phosphorus');
    if (r.key === 'potassium' && s === 'low') tags.add('low-potassium');
    if (r.key === 'organicCarbon' && s === 'low') tags.add('low-organic-carbon');
    if (r.key === 'zinc' && s === 'low') tags.add('low-zinc');
    if (r.key === 'sulphur' && s === 'low') tags.add('low-sulphur');
    if (r.key === 'ph' && (s === 'alkaline' || s === 'strongly-alkaline')) tags.add('alkaline');
    if (r.key === 'ph' && (s === 'acidic' || s === 'strongly-acidic')) tags.add('acidic');
    if (r.key === 'ec' && s !== 'normal') tags.add('saline');
    if (r.key === 'moisture' && r.value < cropMoistureFloor) tags.add('dry-soil');
  }
  return [...tags];
}

function suitability(crops: CropInfo[], farm: Farm, values: SoilTest['values']): CropSuitability[] {
  const ph = values.ph;
  const ec = values.ec;
  return crops
    .map((c): CropSuitability => {
      const reasons: string[] = [];
      let points = 0;
      if (ph === undefined) reasons.push('pH not tested');
      else if (ph >= c.phRange[0] && ph <= c.phRange[1]) {
        points += 2;
        reasons.push(`pH ${ph} within ${c.phRange[0]}–${c.phRange[1]}`);
      } else if (ph >= c.phRange[0] - 0.5 && ph <= c.phRange[1] + 0.5) {
        points += 1;
        reasons.push(`pH ${ph} slightly outside ${c.phRange[0]}–${c.phRange[1]}`);
      } else reasons.push(`pH ${ph} outside preferred ${c.phRange[0]}–${c.phRange[1]}`);

      if (c.preferredSoils.includes(farm.soilType)) {
        points += 1;
        reasons.push(`${farm.soilType.replace('-', ' ')} soil suits it`);
      }
      if (ec !== undefined && ec > 1 && c.saltSensitive) {
        points -= 1;
        reasons.push('sensitive to soil salts');
      }
      const fit = points >= 3 ? 'good' : points >= 2 ? 'fair' : 'poor';
      return { crop: c.id, cropName: c.name, fit, reasons };
    })
    .sort((a, b) => ['good', 'fair', 'poor'].indexOf(a.fit) - ['good', 'fair', 'poor'].indexOf(b.fit));
}

export const soilAnalysisService = {
  references: () => knowledge.soilReferences(),

  latest(tests: SoilTest[]): SoilTest | null {
    return tests.length ? [...tests].sort((a, b) => (a.date < b.date ? 1 : -1))[0] : null;
  },

  async analyze(test: SoilTest | null, farm: Farm, crop: CropInfo): Promise<Analysis<SoilReport>> {
    if (!test) return insufficient(['Soil test'], 'No soil test yet. Add a soil test to see soil health and nutrient guidance.');

    const refs = await knowledge.soilReferences();
    const crops = await knowledge.crops();
    const present = CORE_NUTRIENTS.filter((k) => test.values[k] !== undefined);
    const missingCore = CORE_NUTRIENTS.filter((k) => test.values[k] === undefined);
    if (present.length < MIN_CORE_VALUES) {
      const labels = missingCore.map((k) => refs.find((r) => r.key === k)?.label ?? k);
      return insufficient(labels);
    }

    const readings: NutrientReading[] = [];
    let weighted = 0;
    let weights = 0;
    for (const ref of refs) {
      const value = test.values[ref.key];
      if (value === undefined || Number.isNaN(value)) continue;
      const band = bandFor(ref, value);
      readings.push({
        key: ref.key,
        label: ref.label,
        short: ref.short,
        unit: ref.unit,
        value,
        band,
        position: clamp((value - ref.scale[0]) / (ref.scale[1] - ref.scale[0]), 0, 1),
        layer: ref.layer,
        whyItMatters: ref.whyItMatters,
        reference: ref.reference,
      });
      weighted += TONE_POINTS[band.tone] * ref.weight;
      weights += ref.weight;
    }

    const score = Math.round(weighted / weights);
    const report: SoilReport = {
      testDate: test.date,
      score,
      grade: score >= 70 ? 'Good' : score >= 50 ? 'Fair' : 'Needs care',
      readings,
      deficiencies: readings.filter((r) => r.band.tone === 'bad' || (r.key === 'ph' && r.band.tone === 'warn')),
      missing: refs.map((r) => r.key).filter((k) => test.values[k] === undefined) as NutrientKey[],
      suitableCrops: suitability(crops, farm, test.values),
      conditions: conditionTags(readings, crop.moistureFloor),
    };

    return {
      status: 'ok',
      data: report,
      basis: {
        factors: [
          { label: 'Soil test', value: `${test.date}${test.lab ? ` · ${test.lab}` : ''}` },
          { label: 'Values used', value: `${readings.length} parameters` },
          { label: 'Soil type', value: farm.soilType.replace('-', ' ') },
        ],
        sources: [test.source === 'user-input' ? 'user-input' : 'demo-dataset', 'reference-ranges'],
        note: 'Ranges follow common Soil Health Card categories; confirm with your lab’s method.',
      },
    };
  },

  /** Values of one parameter across tests, oldest first — for trend charts. */
  trend(tests: SoilTest[], key: NutrientKey): { date: string; value: number }[] {
    return tests
      .filter((t) => t.values[key] !== undefined)
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .map((t) => ({ date: t.date, value: round(t.values[key] as number, 2) }));
  },
};
