import type { SourceTag } from './common';

/**
 * Rooftop farming. Same Basis/provenance contract as the field side; different subject:
 * containers on a roof, measured in pots and square feet instead of acres.
 */

export type PlantId = 'tomato' | 'chilli' | 'brinjal' | 'okra' | 'spinach' | 'methi' | 'coriander' | 'mint';
export type PlantKind = 'fruiting' | 'leafy' | 'herb';
export type GardenStageId = 'growing' | 'flowering' | 'fruit' | 'harvest';
export type ContainerKind = 'clay' | 'plastic' | 'grow-bag';

export interface GardenSource {
  id: string;
  title: string;
  publisher: string;
  url: string;
}

export interface PlantInfo {
  id: PlantId;
  name: string;
  localName: string;
  nameHi: string;
  kind: PlantKind;
  startsFrom: 'transplant' | 'seed' | 'cutting';
  /** Hours of direct sun: below `min` it struggles; `ideal` and above it does best. */
  sun: { min: number; ideal: number };
  /** Fruiting plants are counted in pots; greens are counted in square feet of trough/bed. */
  unit: 'pot' | 'bed';
  container: { minLitres?: number; minDepthCm: number; footprintSqFt: number };
  /** Days from planting. Approximate — see the dataset note. */
  stages: { id: GardenStageId; from: number; to: number }[];
  nutrients: Partial<Record<GardenStageId, { focus: string; watch: string[] }>>;
  harvestNote: string;
  sources: string[];
}

export interface GardenInsight {
  id: string;
  title: string;
  body: string;
  source: string;
  plants?: PlantId[];
  containers?: ContainerKind[];
}

export interface GardenPlant {
  id: string;
  plantId: PlantId;
  /** Pots, or sq ft of bed for greens (see PlantInfo.unit). */
  count: number;
  /** ISO date; null until the grower adds it (no stage is guessed without it). */
  plantedOn: string | null;
}

export interface RooftopGarden {
  id: string;
  name: string;
  location: string;
  /** Space usable for pots, as the grower estimated it. */
  areaSqFt: number;
  /** Hours of direct sun on a clear day, as the grower observed it. */
  sunHours: number;
  containers: ContainerKind;
  plants: GardenPlant[];
  createdAt: string;
  isDemo?: boolean;
}

export type GardenDraft = Pick<RooftopGarden, 'name' | 'location' | 'areaSqFt' | 'sunHours' | 'containers'> & { plantIds: PlantId[] };

export type SunFit = 'good' | 'workable' | 'poor';

/** Where one planting is on the way from roof to plate. */
export interface PlantStatus {
  entry: GardenPlant;
  plant: PlantInfo;
  /** null when no planting date was given. */
  days: number | null;
  stage: GardenStageId | 'finished' | null;
  /** Index into `path` (0 = planted). */
  step: number | null;
  path: ('planted' | GardenStageId)[];
  harvestFrom: string | null;
  sunFit: SunFit;
}

export type GardenAdviser = 'sunlight' | 'nutrients' | 'quantity' | 'harvest' | 'weather';

/** One thing to do in the garden today. Same idea as a field FarmAction, sized for pots. */
export interface GardenTask {
  id: string;
  title: string;
  why: string;
  priority: 'today' | 'soon' | 'monitor';
  adviser: GardenAdviser;
  /** Which planting it is about — the 3D rooftop highlights its pots. */
  entryId?: string;
  sources: SourceTag[];
  /** Records the rule read, in plain words. */
  signals: string[];
}

export interface SpaceLine {
  entry: GardenPlant;
  plant: PlantInfo;
  sqFt: number;
  litres: number;
}

export interface SpacePlan {
  available: number;
  used: number;
  free: number;
  litres: number;
  lines: SpaceLine[];
  /** How many more of each plant would fit in the free space. */
  roomFor: { plant: PlantInfo; more: number }[];
}
