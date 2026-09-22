import type { Farm, FarmDraft, FieldObservation, SoilTest } from '@/models';
import { useFarmStore } from '@/state/farmStore';
import { todayIso, uid } from '@/lib/utils';
import { records } from './data';

/**
 * Farm records: listing, validation and saving. Writes go to the browser store in the
 * prototype; with a REST backend these become POST calls with identical payloads.
 */

export type FieldErrors<T> = Partial<Record<keyof T, string>>;

export function validateFarm(draft: FarmDraft): FieldErrors<FarmDraft> {
  const errors: FieldErrors<FarmDraft> = {};
  if (!draft.name.trim()) errors.name = 'Give the farm a name.';
  if (!draft.location.trim()) errors.location = 'Add a village, district or state.';
  if (!Number.isFinite(draft.areaAcres) || draft.areaAcres <= 0) errors.areaAcres = 'Area must be more than 0.';
  else if (draft.areaAcres > 10_000) errors.areaAcres = 'That looks too large — check the unit (acres).';
  if (!draft.sowingDate) errors.sowingDate = 'Add the sowing date so growth stage can be estimated.';
  else if (draft.sowingDate > todayIso()) errors.sowingDate = 'Sowing date cannot be in the future.';
  return errors;
}

export const farmDataService = {
  listFarms: () => records.farms(),

  async getFarm(id: string): Promise<Farm | null> {
    return (await records.farms()).find((f) => f.id === id) ?? null;
  },

  createFarm(draft: FarmDraft): Farm {
    const farm: Farm = { ...draft, name: draft.name.trim(), location: draft.location.trim(), id: uid('farm'), createdAt: new Date().toISOString() };
    useFarmStore.getState().addFarm(farm);
    return farm;
  },

  soilTests: (farmId: string) => records.soilTests(farmId),
  moistureLog: (farmId: string) => records.moistureLog(farmId),
  observations: (farmId: string) => records.observations(farmId),
  history: (farmId: string) => records.history(farmId),

  addSoilTest(farmId: string, values: SoilTest['values'], date: string): SoilTest {
    const test: SoilTest = { id: uid('soil'), farmId, date, source: 'user-input', values };
    useFarmStore.getState().addSoilTest(test);
    return test;
  },

  addObservation(obs: Omit<FieldObservation, 'id'>): FieldObservation {
    const full = { ...obs, id: uid('obs') };
    useFarmStore.getState().addObservation(full);
    return full;
  },

  /** The date the analysis should be run for (frozen for the demo scenario). */
  asOf(farm: Farm): string {
    return farm.asOfDate ?? todayIso();
  },
};
