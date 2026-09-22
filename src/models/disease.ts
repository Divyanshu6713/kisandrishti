import type { Level } from './common';
import type { CropId } from './farm';
import type { Recommendation } from './recommendation';

export interface ConditionWindow {
  tempC: [number, number];
  /** Optimal temperature sub-range. */
  optimumC: [number, number];
  minHumidity: number;
  needsLeafWetness: boolean;
  susceptibleStages: string[];
}

export interface DiseaseInfo {
  id: string;
  kind: 'disease' | 'pest';
  name: string;
  otherNames: string[];
  crops: CropId[];
  cause: string;
  symptoms: string[];
  favourable: string;
  window: ConditionWindow;
  prevention: string[];
  nextSteps: string[];
  /** Field-observation / scan tag that maps to this entry. */
  tag: string;
}

/** Output of image preprocessing — real measurements computed in the browser. */
export interface ImageFeatures {
  width: number;
  height: number;
  leafCoverage: number; // share of pixels that look like plant tissue
  green: number; // shares of leaf pixels
  yellow: number;
  brown: number;
  pale: number;
  brightness: number;
}

export interface PreprocessedImage {
  tensorSize: number; // model input edge (e.g. 224)
  pixels: ImageData; // resized RGBA
  previewUrl: string;
  features: ImageFeatures;
  /** Only set for bundled demo samples — the sample's reference annotation. */
  sampleId?: string;
}

export interface ClassifierPrediction {
  label: string; // disease id | 'healthy' | 'unidentified'
  score: number | null; // null = model gave no calibrated score
  alternatives: { label: string; score: number }[];
  modelId: string;
  simulated: boolean;
}

export interface DiseaseAnalysisResult {
  prediction: ClassifierPrediction;
  disease: DiseaseInfo | null;
  isHealthy: boolean;
  riskLevel: Level;
  features: ImageFeatures;
  observedPattern: string;
  recommendations: Recommendation[];
  caveats: string[];
}
