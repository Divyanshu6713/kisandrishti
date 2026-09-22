import type {
  CropInfo,
  DiseaseInfo,
  Farm,
  FieldObservation,
  NutrientReference,
  OrganicPractice,
  SoilTest,
  WeatherSnapshot,
} from '@/models';

/**
 * The contract between services and wherever data lives.
 * Services never import JSON files or call fetch() directly — they ask a repository.
 * Swap the adapter (local JSON ↔ REST/FastAPI) in ./index.ts without touching UI or services.
 */

export interface KnowledgeRepository {
  crops(): Promise<CropInfo[]>;
  diseases(): Promise<DiseaseInfo[]>;
  soilReferences(): Promise<NutrientReference[]>;
  organicPractices(): Promise<OrganicPractice[]>;
}

export interface MoistureReading {
  date: string;
  pct: number;
}

export interface WeeklyHistoryPoint {
  week: string;
  cropHealth: number;
  diseaseRisk: number;
  moisture: number;
}

export interface InputLogEntry {
  date: string;
  input: string;
  type: string;
  area: string;
}

export interface SeasonRecord {
  season: string;
  method: string;
  yieldQPerAcre: number | null;
  recommendationsOffered: number;
  recommendationsFollowed: number;
}

export interface FarmHistory {
  weekly: WeeklyHistoryPoint[];
  inputs: InputLogEntry[];
  seasons: SeasonRecord[];
}

export interface FarmRecordsRepository {
  farms(): Promise<Farm[]>;
  soilTests(farmId: string): Promise<SoilTest[]>;
  moistureLog(farmId: string): Promise<MoistureReading[]>;
  observations(farmId: string): Promise<FieldObservation[]>;
  history(farmId: string): Promise<FarmHistory | null>;
  /** Weather for the farm. Local adapter returns the bundled sample forecast. */
  weather(farm: Farm): Promise<WeatherSnapshot | null>;
}
