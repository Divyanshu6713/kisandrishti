import type {
  CropHealthReport,
  CropHealthSignal,
  CropInfo,
  CropId,
  FieldObservation,
  GrowthStatus,
  Level,
  RiskResult,
  SoilReport,
} from '@/models';
import { clamp, daysBetween } from '@/lib/utils';
import { knowledge } from './data';

/**
 * Crop intelligence: growth stage from sowing date, and a crop-health score built from
 * field observations, scan results and current risks. The weights below are prototype
 * rules — a trained model would replace `assessHealth` behind the same signature.
 */

const SEVERITY_PENALTY: Record<string, Record<Level, number>> = {
  'pale-leaves': { low: 4, medium: 9, high: 16 },
  aphid: { low: 3, medium: 7, high: 14 },
  'disease-confirmed': { low: 8, medium: 14, high: 22 },
};

const RECENT_DAYS = 21;

export const cropAnalysisService = {
  async crops(): Promise<CropInfo[]> {
    return knowledge.crops();
  },

  async getCrop(id: CropId): Promise<CropInfo> {
    const crop = (await knowledge.crops()).find((c) => c.id === id);
    if (!crop) throw new Error(`Unknown crop "${id}" in knowledge base`);
    return crop;
  },

  growthStatus(crop: CropInfo, sowingDate: string, asOf: string): GrowthStatus {
    const das = daysBetween(sowingDate, asOf);
    const last = crop.stages[crop.stages.length - 1];
    if (das < 0) return { daysAfterSowing: das, stage: null, nextStage: crop.stages[0], progress: 0, label: 'Not sown yet' };
    if (das >= last.toDay)
      return { daysAfterSowing: das, stage: last, nextStage: null, progress: 1, label: 'Season complete / harvest due' };
    const idx = crop.stages.findIndex((s) => das >= s.fromDay && das < s.toDay);
    const stage = crop.stages[idx];
    return {
      daysAfterSowing: das,
      stage,
      nextStage: crop.stages[idx + 1] ?? null,
      progress: das / last.toDay,
      label: `${stage.name} · day ${das}`,
    };
  },

  assessHealth(args: {
    growth: GrowthStatus;
    observations: FieldObservation[];
    risks: RiskResult[];
    soil: SoilReport | null;
    asOf: string;
  }): CropHealthReport {
    const { growth, observations, risks, soil, asOf } = args;
    const signals: CropHealthSignal[] = [];
    let score = 90;

    const recent = observations.filter((o) => {
      const age = daysBetween(o.date, asOf);
      return age >= 0 && age <= RECENT_DAYS;
    });

    for (const o of recent) {
      const sev = o.severity ?? 'low';
      if (o.tag === 'pale-leaves') {
        score -= SEVERITY_PENALTY['pale-leaves'][sev];
        signals.push({ label: 'Pale older leaves', detail: o.note, tone: sev === 'low' ? 'ok' : 'warn', source: 'Field observation' });
      } else if (o.tag === 'aphid') {
        score -= SEVERITY_PENALTY.aphid[sev];
        signals.push({ label: 'Aphids seen', detail: o.note, tone: sev === 'high' ? 'bad' : 'ok', source: 'Field observation' });
      } else if (o.kind === 'disease-scan' && o.tag && o.tag !== 'healthy') {
        score -= SEVERITY_PENALTY['disease-confirmed'][sev];
        signals.push({ label: 'Leaf scan flagged a problem', detail: o.note, tone: 'bad', source: 'Leaf scan · demo engine' });
      } else if (o.tag === 'good-stand') {
        signals.push({ label: 'Good, even stand', detail: o.note, tone: 'good', source: 'Field observation' });
      }
    }

    const disease = risks.find((r) => r.kind === 'disease' && r.status === 'ok');
    if (disease && disease.level !== 'low') {
      score -= disease.level === 'high' ? 6 : 3;
      signals.push({ label: `${disease.subject ?? 'Disease'} conditions`, detail: disease.headline, tone: disease.level === 'high' ? 'warn' : 'ok', source: 'Risk engine' });
    }
    const water = risks.find((r) => r.kind === 'water' && r.status === 'ok');
    if (water && water.level !== 'low') {
      score -= water.level === 'high' ? 8 : 3;
      signals.push({ label: 'Water stress possible', detail: water.headline, tone: 'warn', source: 'Risk engine' });
    }
    const lowN = soil?.deficiencies.find((d) => d.key === 'nitrogen');
    if (lowN) {
      score -= 3;
      signals.push({ label: 'Low soil nitrogen', detail: `Soil test: ${lowN.value} ${lowN.unit} (${lowN.band.label.toLowerCase()})`, tone: 'warn', source: 'Soil test' });
    }

    score = Math.round(clamp(score));
    const status = score >= 75 ? 'healthy' : score >= 55 ? 'moderate-stress' : 'high-risk';
    const statusLabel = status === 'healthy' ? 'Healthy' : status === 'moderate-stress' ? 'Moderate stress' : 'High risk';

    return {
      score,
      status,
      statusLabel,
      growth,
      vigor: score / 100,
      signals,
      recentObservations: recent.slice(0, 5),
    };
  },
};
