import cropsJson from '@/data/crops.json';
import diseasesJson from '@/data/diseases.json';
import soilRangesJson from '@/data/soil-ranges.json';
import organicJson from '@/data/organic-practices.json';
import demoFarmJson from '@/data/demo-farm.json';
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
import { useFarmStore } from '@/state/farmStore';
import { serviceConfig } from '../config';
import { sleep } from '@/lib/utils';
import { DEMO_FARM_ID } from './constants';
import type { FarmHistory, FarmRecordsRepository, KnowledgeRepository, MoistureReading } from './repository';

/**
 * Local adapter: bundled JSON datasets + farmer records saved in the browser.
 * This is the only file that knows the JSON layout. When the dataset moves to CSV,
 * a database or an API, write another adapter with the same interface.
 */

const latency = () => (serviceConfig.demoLatencyMs > 0 ? sleep(serviceConfig.demoLatencyMs) : Promise.resolve());

export const localKnowledge: KnowledgeRepository = {
  async crops() {
    return cropsJson.items as CropInfo[];
  },
  async diseases() {
    return diseasesJson.items as DiseaseInfo[];
  },
  async soilReferences() {
    return soilRangesJson.items as NutrientReference[];
  },
  async organicPractices() {
    return organicJson.items as OrganicPractice[];
  },
};

const demoFarm = demoFarmJson.farm as Farm;
const byDate = <T extends { date: string }>(a: T, b: T) => (a.date < b.date ? 1 : -1);

export const localRecords: FarmRecordsRepository = {
  async farms() {
    return [demoFarm, ...useFarmStore.getState().userFarms];
  },
  async soilTests(farmId) {
    await latency();
    const saved = useFarmStore.getState().soilTests.filter((t) => t.farmId === farmId);
    const bundled = farmId === DEMO_FARM_ID ? (demoFarmJson.soilTests as SoilTest[]) : [];
    return [...bundled, ...saved].sort((a, b) => (a.date < b.date ? -1 : 1));
  },
  async moistureLog(farmId) {
    return farmId === DEMO_FARM_ID ? (demoFarmJson.moistureLog as MoistureReading[]) : [];
  },
  async observations(farmId) {
    const saved = useFarmStore.getState().observations.filter((o) => o.farmId === farmId);
    const bundled = farmId === DEMO_FARM_ID ? (demoFarmJson.observations as FieldObservation[]) : [];
    return [...saved, ...bundled].sort(byDate);
  },
  async history(farmId) {
    return farmId === DEMO_FARM_ID ? (demoFarmJson.history as FarmHistory) : null;
  },
  async weather(farm) {
    await latency();
    const w = demoFarmJson.weather;
    const isDemo = farm.id === DEMO_FARM_ID;
    return {
      location: isDemo ? w.location : `${w.location} — sample`,
      current: w.current as WeatherSnapshot['current'],
      days: w.days as WeatherSnapshot['days'],
      source: 'sample-forecast',
      sourceNote: isDemo
        ? 'Sample forecast bundled with the demo scenario — not live weather.'
        : 'Sample forecast only — not for this farm’s location. Connect a weather provider for live data.',
    };
  },
};
