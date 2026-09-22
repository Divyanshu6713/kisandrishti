import type { Tone } from './common';
import type { CropId } from './farm';

export type NutrientKey =
  | 'ph'
  | 'nitrogen'
  | 'phosphorus'
  | 'potassium'
  | 'organicCarbon'
  | 'moisture'
  | 'ec'
  | 'sulphur'
  | 'zinc';

export const CORE_NUTRIENTS: NutrientKey[] = ['ph', 'nitrogen', 'phosphorus', 'potassium', 'organicCarbon'];

/** Layer of the soil cross-section a parameter is visualised on. */
export type SoilLayerId = 'surface' | 'roots' | 'topsoil' | 'nutrient' | 'subsoil';

export interface SoilTest {
  id: string;
  farmId: string;
  date: string;
  lab?: string;
  source: 'demo-dataset' | 'user-input';
  values: Partial<Record<NutrientKey, number>>;
}

export interface RangeBand {
  /** Upper bound (exclusive). The last band uses null = no upper bound. */
  max: number | null;
  status: string; // 'low' | 'medium' | 'high' | 'neutral' ...
  label: string;
  tone: Tone;
}

export interface NutrientReference {
  key: NutrientKey;
  label: string;
  short: string;
  unit: string;
  layer: SoilLayerId;
  scale: [number, number];
  bands: RangeBand[];
  weight: number;
  whyItMatters: string;
  reference: string;
}

export interface NutrientReading {
  key: NutrientKey;
  label: string;
  short: string;
  unit: string;
  value: number;
  band: RangeBand;
  /** 0..1 position on the display scale. */
  position: number;
  layer: SoilLayerId;
  whyItMatters: string;
  reference: string;
}

export interface CropSuitability {
  crop: CropId;
  cropName: string;
  fit: 'good' | 'fair' | 'poor';
  reasons: string[];
}

export interface SoilReport {
  testDate: string;
  score: number;
  grade: 'Good' | 'Fair' | 'Needs care';
  readings: NutrientReading[];
  deficiencies: NutrientReading[];
  missing: NutrientKey[];
  suitableCrops: CropSuitability[];
  /** Condition tags consumed by the organic recommendation engine, e.g. 'low-nitrogen'. */
  conditions: string[];
}
