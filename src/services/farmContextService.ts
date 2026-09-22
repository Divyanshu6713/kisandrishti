import type {
  AgroImplication,
  Analysis,
  CropHealthReport,
  CropInfo,
  Farm,
  FieldObservation,
  GrowthStatus,
  OrganicRecommendation,
  PlannedAction,
  RiskInputs,
  RiskResult,
  SoilReport,
  SoilTest,
  WeatherSnapshot,
} from '@/models';
import { cropAnalysisService } from './cropAnalysisService';
import { farmDataService } from './farmDataService';
import { organicRecommendationService } from './organicRecommendationService';
import { recommendationService, type AdvisorReport, type FarmHealth } from './recommendationService';
import { riskPredictionService } from './riskPredictionService';
import { soilAnalysisService } from './soilAnalysisService';
import { weatherService } from './weatherService';
import type { FarmHistory } from './data';

/**
 * One call that assembles everything the app knows about a farm, in dependency order:
 *   records → crop stage → soil → weather → risk → crop health → organic → advisor.
 * Every page reads this same context, so numbers never disagree between screens.
 */
export interface FarmContext {
  farm: Farm;
  crop: CropInfo;
  asOf: string;
  growth: GrowthStatus;
  soilTests: SoilTest[];
  soil: Analysis<SoilReport>;
  soilReport: SoilReport | null;
  moisture: { pct: number; date: string } | null;
  weather: WeatherSnapshot | null;
  implications: AgroImplication[];
  riskInputs: RiskInputs;
  risks: RiskResult[];
  cropHealth: CropHealthReport;
  observations: FieldObservation[];
  organic: Analysis<{ items: OrganicRecommendation[]; notes: string[] }>;
  advice: AdvisorReport;
  health: FarmHealth;
  history: FarmHistory | null;
  plan: PlannedAction[];
}

export async function loadFarmContext(farm: Farm, plan: PlannedAction[]): Promise<FarmContext> {
  const asOf = farmDataService.asOf(farm);
  const [crop, soilTests, moistureLog, observations, weather, history] = await Promise.all([
    cropAnalysisService.getCrop(farm.crop),
    farmDataService.soilTests(farm.id),
    farmDataService.moistureLog(farm.id),
    farmDataService.observations(farm.id),
    weatherService.forecast(farm),
    farmDataService.history(farm.id),
  ]);
  const visibleObs = observations.filter((o) => o.date <= asOf);
  const growth = cropAnalysisService.growthStatus(crop, farm.sowingDate, asOf);

  // The latest field moisture reading is fresher than the lab value — use it when available.
  const latestTest = soilAnalysisService.latest(soilTests.filter((t) => t.date <= asOf));
  const latestMoisture = [...moistureLog].filter((m) => m.date <= asOf).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  const moisture = latestMoisture
    ? { pct: latestMoisture.pct, date: latestMoisture.date }
    : latestTest?.values.moisture !== undefined
      ? { pct: latestTest.values.moisture, date: latestTest.date }
      : null;
  const effectiveTest = latestTest && moisture ? { ...latestTest, values: { ...latestTest.values, moisture: moisture.pct } } : latestTest;

  const soil = await soilAnalysisService.analyze(effectiveTest, farm, crop);
  const soilReport = soil.status === 'ok' ? soil.data : null;

  const riskInputs = riskPredictionService.buildInputs({ crop, growth, weather, soilMoisturePct: moisture?.pct ?? null, observations: visibleObs, asOf });
  const risks = await riskPredictionService.predict(riskInputs, crop);
  const implications = weather ? weatherService.implications(weather, crop, growth, risks) : [];

  const cropHealth = cropAnalysisService.assessHealth({ growth, observations: visibleObs, risks, soil: soilReport, asOf });
  const organic = await organicRecommendationService.recommend({ farm, crop, growth, soil: soilReport, risks });
  const farmPlan = plan.filter((p) => p.farmId === farm.id);
  const advice = recommendationService.advise({ farm, crop, growth, asOf, soil, moisture, weather, risks, cropHealth, observations: visibleObs, organic, plan: farmPlan });
  const health = recommendationService.farmHealth({ soil, cropHealth, risks });

  return {
    farm,
    crop,
    asOf,
    growth,
    soilTests,
    soil,
    soilReport,
    moisture,
    weather,
    implications,
    riskInputs,
    risks,
    cropHealth,
    observations: visibleObs,
    organic,
    advice,
    health,
    history,
    plan: farmPlan,
  };
}
