import type { Level } from './common';
import type { CropId } from './farm';

export type RiskKind = 'disease' | 'water' | 'pest' | 'environment';

export interface RiskInputs {
  crop: CropId;
  stageId: string | null;
  temperatureC: number | null;
  humidityPct: number | null;
  rainfallMm: number | null; // next 7 days
  soilMoisturePct: number | null;
  maxTempC?: number | null;
  minTempC?: number | null;
  windKmh?: number | null;
  foggyDays?: number;
  recentObservationTags: string[];
}

export interface RiskDriver {
  label: string;
  effect: 'raises' | 'lowers' | 'neutral';
}

export interface RiskResult {
  kind: RiskKind;
  title: string;
  status: 'ok' | 'insufficient';
  /** Inputs that were missing when status is 'insufficient'. */
  missing?: string[];
  score: number; // 0..100 (0 when insufficient)
  level: Level;
  headline: string;
  /** e.g. the disease or pest the score is about. */
  subject?: string;
  drivers: RiskDriver[];
}
