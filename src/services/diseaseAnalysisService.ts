import type {
  Analysis,
  CropInfo,
  DiseaseAnalysisResult,
  DiseaseInfo,
  Farm,
  Level,
  PreprocessedImage,
  Recommendation,
  RiskResult,
} from '@/models';
import { insufficient } from '@/models';
import { round } from '@/lib/utils';
import { knowledge } from './data';
import { activeClassifier } from './disease/classifiers';
import { preprocess } from './disease/imagePreprocessing';

/**
 * Disease analysis pipeline:
 *   image → preprocessing → classifier (demo | trained model) → prediction + confidence
 *         → knowledge lookup → recommendation engine → result
 */

const MIN_LEAF_COVERAGE = 0.12;
const MIN_CONFIDENT_SCORE = 0.6;

export const PIPELINE_STEPS = ['Check photo', 'Resize to 224 × 224', 'Measure leaf colours', 'Classify', 'Build guidance'] as const;

function describe(f: PreprocessedImage['features']): string {
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const parts = [`${pct(f.green)} green`];
  if (f.yellow > 0.03) parts.push(`${pct(f.yellow)} yellow`);
  if (f.brown > 0.03) parts.push(`${pct(f.brown)} brown/orange`);
  if (f.pale > 0.03) parts.push(`${pct(f.pale)} whitish patches`);
  return `Leaf fills ${pct(f.leafCoverage)} of the frame — ${parts.join(', ')}.`;
}

function recsFor(d: DiseaseInfo, level: Level, crop: CropInfo, score: number | null, simulated: boolean): Recommendation[] {
  const basis = {
    factors: [
      { label: 'Crop', value: crop.name },
      { label: 'Result', value: d.name },
      { label: simulated ? 'Simulated score' : 'Model confidence', value: score === null ? '—' : `${round(score * 100)}%` },
    ],
    sources: [simulated ? 'demo-rules' : 'model-api'] as Recommendation['basis']['sources'],
  };
  return [
    {
      id: `scan-confirm-${d.id}`,
      category: 'monitoring',
      priority: level,
      title: 'Confirm in the field',
      observation: `The photo matches ${d.name.toLowerCase()}.`,
      risk: `If confirmed, ${d.kind === 'pest' ? 'the pest' : 'the disease'} can spread under the current weather.`,
      action: d.nextSteps[0],
      why: 'A single photo is not a diagnosis. Field symptoms across many plants confirm it.',
      nextStep: d.nextSteps[1] ?? d.nextSteps[0],
      basis,
      engine: 'demo-rules',
    },
    {
      id: `scan-prevent-${d.id}`,
      category: 'protection',
      priority: level === 'high' ? 'medium' : 'low',
      title: 'Prevention',
      observation: d.favourable,
      risk: 'Recurring conditions can bring the problem back.',
      action: d.prevention[0],
      why: 'Prevention is the most reliable option under organic management.',
      nextStep: d.prevention[1] ?? d.prevention[0],
      basis,
      engine: 'demo-rules',
    },
  ];
}

export const diseaseAnalysisService = {
  classifierId: activeClassifier.id,
  usesTrainedModel: activeClassifier.isTrainedModel,
  preprocess,

  async analyze(args: { image: PreprocessedImage; farm: Farm; crop: CropInfo; risks: RiskResult[] }): Promise<Analysis<DiseaseAnalysisResult>> {
    const { image, crop, risks } = args;
    const f = image.features;
    if (f.leafCoverage < MIN_LEAF_COVERAGE)
      return insufficient(['A clear leaf in the photo'], 'We could not find enough leaf in this photo. Take a close-up of a single leaf in daylight and try again.');

    const prediction = await activeClassifier.classify(image, { crop: crop.id });
    const catalogue = await knowledge.diseases();
    const disease = catalogue.find((d) => d.id === prediction.label) ?? null;
    const isHealthy = prediction.label === 'healthy';
    const caveats: string[] = [];

    if (prediction.simulated)
      caveats.push(
        image.sampleId
          ? 'Demo sample: the result is the sample’s reference label with a simulated score — not a trained-model prediction.'
          : 'No trained model is connected yet, so the disease cannot be identified from your photo. The colour measurements above are real.',
      );
    if (prediction.score !== null && prediction.score < MIN_CONFIDENT_SCORE) caveats.push('Low confidence — treat as a hint and confirm in the field.');
    caveats.push('Always confirm with a local agriculture officer / KVK before acting on a disease result.');

    let riskLevel: Level = 'low';
    if (disease) {
      const farmRisk = risks.find((r) => r.kind === 'disease' && r.status === 'ok' && r.subject === disease.name);
      riskLevel = farmRisk?.level === 'high' || (prediction.score ?? 0) >= 0.85 ? 'high' : 'medium';
    }

    const result: DiseaseAnalysisResult = {
      prediction,
      disease,
      isHealthy,
      riskLevel,
      features: f,
      observedPattern: describe(f),
      recommendations: disease ? recsFor(disease, riskLevel, crop, prediction.score, prediction.simulated) : [],
      caveats,
    };

    return {
      status: 'ok',
      data: result,
      basis: {
        factors: [
          { label: 'Classifier', value: prediction.modelId },
          { label: 'Input', value: `${image.tensorSize}×${image.tensorSize} px` },
          { label: 'Crop', value: crop.name },
        ],
        sources: prediction.simulated ? ['demo-rules'] : ['model-api'],
      },
    };
  },
};
