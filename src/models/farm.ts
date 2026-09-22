import type { Level } from './common';

export type CropId = 'wheat' | 'rice' | 'maize' | 'chickpea' | 'mustard' | 'potato';
export type SoilType = 'loamy' | 'clay-loam' | 'clay' | 'sandy-loam' | 'sandy' | 'silty';
export type IrrigationType = 'canal' | 'tubewell' | 'drip' | 'sprinkler' | 'rainfed';
export type FarmingMethod = 'organic' | 'transitioning' | 'natural' | 'conventional';

/** Inputs a farmer already has access to — used to rank organic recommendations. */
export type FarmInput =
  | 'cattle-dung'
  | 'crop-residue'
  | 'vermicompost'
  | 'biofertilizers'
  | 'neem'
  | 'green-manure-seed';

export interface Farm {
  id: string;
  name: string;
  location: string;
  areaAcres: number;
  crop: CropId;
  variety: string;
  sowingDate: string; // ISO date
  soilType: SoilType;
  irrigation: IrrigationType;
  method: FarmingMethod;
  availableInputs: FarmInput[];
  createdAt: string;
  isDemo?: boolean;
  /** Demo scenarios are frozen at a date so the story is reproducible. Real farms use today. */
  asOfDate?: string;
}

export type FarmDraft = Omit<Farm, 'id' | 'createdAt' | 'isDemo' | 'asOfDate'>;

export type ObservationKind = 'leaf-colour' | 'pest' | 'growth' | 'disease-scan' | 'irrigation' | 'input-applied';

export interface FieldObservation {
  id: string;
  farmId: string;
  date: string;
  kind: ObservationKind;
  note: string;
  severity?: Level;
  /** Structured tag the engines can read (e.g. 'pale-leaves', 'aphid', 'yellow-rust'). */
  tag?: string;
}

/** A recommendation the farmer chose to act on (drives the "improved farm" state). */
export interface PlannedAction {
  recommendationId: string;
  farmId: string;
  title: string;
  status: 'planned' | 'done';
  updatedAt: string;
}
