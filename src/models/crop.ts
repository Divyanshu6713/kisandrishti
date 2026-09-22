import type { Level, Tone } from './common';
import type { CropId, FieldObservation, SoilType } from './farm';

export interface CropStage {
  id: string;
  name: string;
  fromDay: number;
  toDay: number;
  /** Irrigation-critical stage (e.g. wheat CRI, jointing, flowering). */
  waterCritical: boolean;
  focus: string;
}

export interface CropInfo {
  id: CropId;
  name: string;
  localName: string;
  season: 'rabi' | 'kharif' | 'zaid';
  phRange: [number, number];
  preferredSoils: SoilType[];
  saltSensitive: boolean;
  waterNeed: Level;
  /** Volumetric soil moisture (%) below which the crop is likely to need water. Indicative. */
  moistureFloor: number;
  heatStressAboveC: number;
  stages: CropStage[];
  diseaseIds: string[];
}

export interface GrowthStatus {
  daysAfterSowing: number;
  stage: CropStage | null;
  nextStage: CropStage | null;
  progress: number; // 0..1 across whole season
  label: string;
}

export interface CropHealthSignal {
  label: string;
  detail: string;
  tone: Tone;
  source: string;
}

export interface CropHealthReport {
  score: number;
  status: 'healthy' | 'moderate-stress' | 'high-risk';
  statusLabel: string;
  growth: GrowthStatus;
  /** 0..1 — drives the 3D plant (colour + posture). */
  vigor: number;
  signals: CropHealthSignal[];
  recentObservations: FieldObservation[];
}
