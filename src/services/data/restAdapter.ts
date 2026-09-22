import type { Farm } from '@/models';
import { serviceConfig } from '../config';
import type { FarmRecordsRepository, KnowledgeRepository } from './repository';

/**
 * REST adapter — ready for the Kisan Drishti backend (e.g. Python FastAPI).
 * Expected endpoints (JSON, same shapes as src/models):
 *
 *   GET /v1/knowledge/crops | /diseases | /soil-references | /organic-practices
 *   GET /v1/farms
 *   GET /v1/farms/:id/soil-tests | /moisture | /observations | /history | /weather
 *
 * Enable with VITE_DATA_SOURCE=rest and VITE_API_BASE=https://…
 */

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${serviceConfig.apiBase}${path}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`API ${path} failed with ${res.status}`);
  return (await res.json()) as T;
}

export const restKnowledge: KnowledgeRepository = {
  crops: () => get('/v1/knowledge/crops'),
  diseases: () => get('/v1/knowledge/diseases'),
  soilReferences: () => get('/v1/knowledge/soil-references'),
  organicPractices: () => get('/v1/knowledge/organic-practices'),
};

export const restRecords: FarmRecordsRepository = {
  farms: () => get('/v1/farms'),
  soilTests: (id) => get(`/v1/farms/${encodeURIComponent(id)}/soil-tests`),
  moistureLog: (id) => get(`/v1/farms/${encodeURIComponent(id)}/moisture`),
  observations: (id) => get(`/v1/farms/${encodeURIComponent(id)}/observations`),
  history: (id) => get(`/v1/farms/${encodeURIComponent(id)}/history`),
  weather: (farm: Farm) => get(`/v1/farms/${encodeURIComponent(farm.id)}/weather`),
};
