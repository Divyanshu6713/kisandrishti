import samplesJson from '@/data/disease-samples.json';
import classMapJson from '@/data/disease-class-map.json';
import type { ClassifierPrediction, CropId, DiseaseModelCard, PreprocessedImage } from '@/models';
import { ImageInputError } from './imagePreprocessing';
import { serviceConfig } from '../config';

/**
 * Step 2 of the pipeline — the model seam.
 * Replace `demoClassifier` with our trained model by setting VITE_DISEASE_MODEL=remote
 * (backend endpoint) or by adding an in-browser implementation (e.g. ONNX / TF.js).
 */
export interface DiseaseClassifier {
  id: string;
  isTrainedModel: boolean;
  classify(image: PreprocessedImage, ctx: { crop: CropId }): Promise<ClassifierPrediction>;
}

export interface DiseaseSample {
  id: string;
  title: string;
  crop: CropId;
  art: string;
  label: string;
  simulatedScore: number;
  alternatives: { label: string; score: number }[];
}

export const DISEASE_SAMPLES = samplesJson.items as DiseaseSample[];

/**
 * Demo classifier. It does NOT look at the pixels to decide the disease:
 *  - bundled samples → returns the sample's reference annotation with a simulated score
 *  - any other photo → 'unidentified' (no trained model is connected)
 */
export const demoClassifier: DiseaseClassifier = {
  id: 'demo-reference-lookup',
  isTrainedModel: false,
  async classify(image) {
    const sample = DISEASE_SAMPLES.find((s) => s.id === image.sampleId);
    if (sample) {
      return { label: sample.label, score: sample.simulatedScore, alternatives: sample.alternatives, modelId: this.id, simulated: true };
    }
    return { label: 'unidentified', score: null, alternatives: [], modelId: this.id, simulated: true };
  },
};

/** The trained model is not deployed, not reachable, or failed to load. Never replaced by demo output. */
export class ModelUnavailableError extends Error {}

const CLASS_MAP = (classMapJson as { map: Record<string, string> }).map;

interface ApiPrediction {
  status: 'ok' | 'uncertain';
  prediction: { class_id: string; display_name: string; crop: string | null; is_healthy: boolean; confidence: number };
  top_predictions: { class_id: string; display_name: string; probability: number }[];
  threshold: number;
  model: { model_id: string; model_version: string; name: string; architecture: string; dataset_name: string | null; dataset_version: string | null };
  metadata: { inference_ms: number };
  notice: string;
}

async function apiError(res: Response): Promise<Error> {
  let msg = '';
  try {
    msg = ((await res.json()) as { error?: { message?: string } })?.error?.message ?? '';
  } catch {
    /* not JSON */
  }
  if (res.status === 503 || res.status >= 500) return new ModelUnavailableError(msg || 'Disease identification is temporarily unavailable.');
  return new ImageInputError(msg || 'This photo could not be analysed. Try another photo.');
}

/**
 * Trained model served by the Kisan Drishti ML API (backend/). The ORIGINAL photo is sent — the server
 * applies the model's own saved preprocessing, so browser resizing can never cause train/serve skew.
 * The response carries the model's real probabilities; advice is added later by the knowledge layer.
 */
export const remoteClassifier: DiseaseClassifier = {
  id: 'kd-disease-remote',
  isTrainedModel: true,
  async classify(image) {
    if (!image.source) throw new ImageInputError('Demo samples are not used with the trained model. Upload a photo of a leaf.');
    let res: Response;
    try {
      res = await fetch(`${serviceConfig.apiBase}/v1/disease/predict`, {
        method: 'POST',
        headers: { 'Content-Type': image.source.type || 'image/jpeg', Accept: 'application/json' },
        body: image.source,
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      });
    } catch {
      throw new ModelUnavailableError('Could not reach the disease identification service. Check your connection and try again.');
    }
    if (!res.ok) throw await apiError(res);
    const b = (await res.json()) as ApiPrediction;
    const mapped = (id: string) => CLASS_MAP[id] ?? id;
    return {
      label: mapped(b.prediction.class_id),
      score: b.prediction.confidence,
      alternatives: b.top_predictions.slice(1).map((t) => ({ label: t.display_name, score: t.probability })),
      modelId: `${b.model.name} v${b.model.model_version}`,
      simulated: false,
      status: b.status,
      classId: b.prediction.class_id,
      displayName: b.prediction.display_name,
      crop: b.prediction.crop,
      isHealthy: b.prediction.is_healthy,
      topPredictions: b.top_predictions.map((t) => ({ classId: t.class_id, displayName: t.display_name, probability: t.probability })),
      model: { id: b.model.model_id, version: b.model.model_version, name: b.model.name, architecture: b.model.architecture, datasetName: b.model.dataset_name, datasetVersion: b.model.dataset_version },
      threshold: b.threshold,
      inferenceMs: b.metadata.inference_ms,
      notice: b.notice,
    };
  },
};

/** Which trained model (if any) is serving predictions right now. */
export async function fetchDiseaseModelCard(): Promise<DiseaseModelCard> {
  let res: Response;
  try {
    res = await fetch(`${serviceConfig.apiBase}/v1/disease/model`, { headers: { Accept: 'application/json' }, credentials: 'omit', referrerPolicy: 'no-referrer' });
  } catch {
    throw new ModelUnavailableError('Could not reach the disease identification service.');
  }
  if (!res.ok) throw await apiError(res);
  return (await res.json()) as DiseaseModelCard;
}

export const activeClassifier: DiseaseClassifier = serviceConfig.diseaseModel === 'remote' ? remoteClassifier : demoClassifier;
