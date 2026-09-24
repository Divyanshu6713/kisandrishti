/**
 * Service layer — the only API the UI uses for data and intelligence.
 *
 *   UI  →  services (this folder)  →  repositories (data/)  →  JSON | REST | model endpoints
 */
export { serviceConfig, ENGINE } from './config';
export { farmDataService, validateFarm } from './farmDataService';
export { cropAnalysisService } from './cropAnalysisService';
export { soilAnalysisService } from './soilAnalysisService';
export { riskPredictionService } from './riskPredictionService';
export { diseaseAnalysisService, PIPELINE_STEPS } from './diseaseAnalysisService';
export { organicRecommendationService } from './organicRecommendationService';
export { weatherService } from './weatherService';
export { recommendationService } from './recommendationService';
export type { AdvisorReport, DataCheck, FarmHealth } from './recommendationService';
export { farmActionService } from './farmActionService';
export { assistantService, SUGGESTED_QUESTIONS } from './assistantService';
export type { AssistantAnswer } from './assistantService';
export { loadFarmContext } from './farmContextService';
export type { FarmContext } from './farmContextService';
export { DISEASE_SAMPLES } from './disease/classifiers';
export type { DiseaseSample } from './disease/classifiers';
export { ImageInputError } from './disease/imagePreprocessing';
export { DEMO_FARM_ID } from './data';
