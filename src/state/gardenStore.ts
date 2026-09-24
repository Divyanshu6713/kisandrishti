import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { RooftopGarden } from '@/models';
import { DEMO_GARDEN_ID } from '@/services/gardenService';

/**
 * Rooftop gardens the grower created, edits to any garden (including the demo — undone by
 * "Reset demo rooftop"), and which of today's garden tasks were marked done. Browser-only,
 * like the field plan; a REST adapter would sync it later.
 */
interface GardenState {
  userGardens: RooftopGarden[];
  selectedGardenId: string;
  /** Changes layered over a garden (demo or user): sun hours, area, plants… */
  patches: Record<string, Partial<RooftopGarden>>;
  /** `${gardenId}:${taskId}:${date}` → true. Daily tasks come back the next day. */
  done: Record<string, true>;

  selectGarden: (id: string) => void;
  addGarden: (g: RooftopGarden) => void;
  updateGarden: (id: string, patch: Partial<RooftopGarden>) => void;
  removeGarden: (id: string) => void;
  setDone: (key: string, done: boolean) => void;
  resetDemo: () => void;
}

export const useGardenStore = create<GardenState>()(
  persist(
    (set) => ({
      userGardens: [],
      selectedGardenId: DEMO_GARDEN_ID,
      patches: {},
      done: {},

      selectGarden: (id) => set({ selectedGardenId: id }),
      addGarden: (g) => set((s) => ({ userGardens: [...s.userGardens, g], selectedGardenId: g.id })),
      updateGarden: (id, patch) => set((s) => ({ patches: { ...s.patches, [id]: { ...s.patches[id], ...patch } } })),
      removeGarden: (id) =>
        set((s) => {
          const { [id]: _, ...patches } = s.patches;
          return {
            userGardens: s.userGardens.filter((g) => g.id !== id),
            patches,
            selectedGardenId: s.selectedGardenId === id ? DEMO_GARDEN_ID : s.selectedGardenId,
          };
        }),
      setDone: (key, done) =>
        set((s) => {
          const next = { ...s.done };
          if (done) next[key] = true;
          else delete next[key];
          return { done: next };
        }),
      resetDemo: () =>
        set((s) => {
          const { [DEMO_GARDEN_ID]: _, ...patches } = s.patches;
          const done = Object.fromEntries(Object.entries(s.done).filter(([k]) => !k.startsWith(`${DEMO_GARDEN_ID}:`))) as Record<string, true>;
          return { patches, done, selectedGardenId: DEMO_GARDEN_ID };
        }),
    }),
    {
      name: 'kd-garden-store',
      version: 1,
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

/** Which planting the rooftop scene should emphasise (hover/focus on a garden task or plant row). */
interface GardenFocusState {
  entryId: string | null;
  focus: (id: string) => void;
  clear: () => void;
}

export const useGardenFocus = create<GardenFocusState>((set) => ({
  entryId: null,
  focus: (entryId) => set({ entryId }),
  clear: () => set({ entryId: null }),
}));
