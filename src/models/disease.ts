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
  /** The original photo, sent unchanged to the trained model (the server applies the model's own preprocessing). */
  source?: Blob;
}

export interface ClassifierPrediction {
  label: string; // knowledge id (diseases.json) | 'healthy' | 'unidentified' | raw model class id when unmapped
  score: number | null; // null = model gave no score
  alternatives: { label: string; score: number }[];
  modelId: string;
  simulated: boolean;
  // ---- Trained-model fields (VITE_DISEASE_MODEL=remote). All come straight from the model API.
  /** 'uncertain' = top probability below the admin-set threshold: shown as a possibility, never as a diagnosis. */
  status?: 'ok' | 'uncertain';
  classId?: string;
  displayName?: string;
  /** Crop parsed from the class name ("Tomato___Early_blight" → "Tomato"), or null. */
  crop?: string | null;
  isHealthy?: boolean;
  topPredictions?: { classId: string; displayName: string; probability: number }[];
  model?: { id: string; version: string; name: string; architecture: string; datasetName: string | null; datasetVersion: string | null };
  threshold?: number;
  inferenceMs?: number;
  notice?: string;
}

/** Public card of the deployed disease model (GET /v1/disease/model). */
export type DiseaseModelCard =
  | { deployed: false; message: string }
  | {
      deployed: true;
      model: { model_id: string; model_version: string; name: string; dataset_name: string; dataset_version: string; deployed_at: string; trained_at: string | null };
      classes: { class_id: string; display_name: string; crop: string | null; is_healthy: boolean }[];
      threshold: number;
      notice: string;
    };

export interface DiseaseAnalysisResult {
  prediction: ClassifierPrediction;
  disease: DiseaseInfo | null;
  isHealthy: boolean;
  riskLevel: Level;
  features: ImageFeatures;
  observedPattern: string;
  recommendations: Recommendation[];
  caveats: string[];
  /** Model confidence below the threshold — the UI must not present a diagnosis. */
  uncertain: boolean;
  /** Set when the image looks like a different crop than the farm's crop. */
  cropMismatch: string | null;
  /** False when the predicted class has no verified knowledge entry (no advice is invented). */
  guidanceAvailable: boolean;
}
