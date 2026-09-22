import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Farm, FieldObservation, PlannedAction, SoilTest } from '@/models';
import { DEMO_FARM_ID } from '@/services/data/constants';

/**
 * Farmer-entered records, persisted in the browser. The local data adapter merges these
 * with the bundled demo dataset; a REST adapter would send them to the backend instead.
 */
interface FarmState {
  userFarms: Farm[];
  selectedFarmId: string;
  soilTests: SoilTest[];
  observations: FieldObservation[];
  plan: PlannedAction[];
  /** Bumped on every write so derived farm context reloads. */
  revision: number;

  selectFarm: (id: string) => void;
  addFarm: (farm: Farm) => void;
  removeFarm: (id: string) => void;
  addSoilTest: (test: SoilTest) => void;
  addObservation: (obs: FieldObservation) => void;
  setPlan: (action: PlannedAction) => void;
  removePlan: (farmId: string, recommendationId: string) => void;
  resetDemo: () => void;
}

export const useFarmStore = create<FarmState>()(
  persist(
    (set) => ({
      userFarms: [],
      selectedFarmId: DEMO_FARM_ID,
      soilTests: [],
      observations: [],
      plan: [],
      revision: 0,

      selectFarm: (id) => set({ selectedFarmId: id }),
      addFarm: (farm) => set((s) => ({ userFarms: [...s.userFarms, farm], selectedFarmId: farm.id, revision: s.revision + 1 })),
      removeFarm: (id) =>
        set((s) => ({
          userFarms: s.userFarms.filter((f) => f.id !== id),
          soilTests: s.soilTests.filter((t) => t.farmId !== id),
          observations: s.observations.filter((o) => o.farmId !== id),
          plan: s.plan.filter((p) => p.farmId !== id),
          selectedFarmId: s.selectedFarmId === id ? DEMO_FARM_ID : s.selectedFarmId,
          revision: s.revision + 1,
        })),
      addSoilTest: (test) => set((s) => ({ soilTests: [...s.soilTests, test], revision: s.revision + 1 })),
      addObservation: (obs) => set((s) => ({ observations: [obs, ...s.observations], revision: s.revision + 1 })),
      setPlan: (action) =>
        set((s) => ({
          plan: [...s.plan.filter((p) => !(p.farmId === action.farmId && p.recommendationId === action.recommendationId)), action],
          revision: s.revision + 1,
        })),
      removePlan: (farmId, recommendationId) =>
        set((s) => ({
          plan: s.plan.filter((p) => !(p.farmId === farmId && p.recommendationId === recommendationId)),
          revision: s.revision + 1,
        })),
      resetDemo: () =>
        set((s) => ({
          soilTests: s.soilTests.filter((t) => t.farmId !== DEMO_FARM_ID),
          observations: s.observations.filter((o) => o.farmId !== DEMO_FARM_ID),
          plan: s.plan.filter((p) => p.farmId !== DEMO_FARM_ID),
          selectedFarmId: DEMO_FARM_ID,
          revision: s.revision + 1,
        })),
    }),
    {
      name: 'kd-farm-store',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        userFarms: s.userFarms,
        selectedFarmId: s.selectedFarmId,
        soilTests: s.soilTests,
        observations: s.observations,
        plan: s.plan,
      }),
    },
  ),
);
