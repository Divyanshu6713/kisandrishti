import samplesJson from '@/data/disease-samples.json';
import type { ClassifierPrediction, CropId, PreprocessedImage } from '@/models';
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

function toBase64(image: PreprocessedImage): string {
  return image.previewUrl.split(',')[1] ?? '';
}

export const remoteClassifier: DiseaseClassifier = {
  id: 'kd-disease-remote',
  isTrainedModel: true,
  async classify(image, ctx) {
    const res = await fetch(`${serviceConfig.apiBase}/v1/models/disease/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ crop: ctx.crop, size: image.tensorSize, imageBase64: toBase64(image) }),
    });
    if (!res.ok) throw new Error(`Disease model API failed (${res.status})`);
    const body = (await res.json()) as Omit<ClassifierPrediction, 'simulated'>;
    return { ...body, simulated: false };
  },
};

export const activeClassifier: DiseaseClassifier = serviceConfig.diseaseModel === 'remote' ? remoteClassifier : demoClassifier;
