import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/** The guided 2–3 minute demo route (mirrors the judges' demo script). */
export interface TourStep {
  path: string;
  title: string;
  hint: string;
}

export const TOUR_STEPS: TourStep[] = [
  { path: '/app', title: 'Farm overview', hint: 'One calm view: farm health, the main alert and today’s action.' },
  { path: '/app/soil', title: 'Soil health', hint: 'Select a nutrient to see where it acts in the soil.' },
  { path: '/app/crop', title: 'Crop health', hint: 'Health comes from field observations, soil and risk — each signal is listed.' },
  { path: '/app/organic', title: 'Organic farming', hint: 'Recommendations matched to this soil, crop stage and the inputs you have.' },
  { path: '/app/disease', title: 'Disease analysis', hint: 'Pick the “yellow stripes” sample, analyse it, then save it to the field log.' },
  { path: '/app/risk', title: 'Risk intelligence', hint: 'The saved scan now raises disease risk. Try the sliders.' },
  { path: '/app/advisor', title: 'Farm Advisor', hint: 'Everything combined. Add the top actions to your plan.' },
  { path: '/app', title: 'Back to overview', hint: 'With a plan in place, the farm status moves to “on track”.' },
];

interface TourState {
  active: boolean;
  step: number;
  start: () => void;
  go: (step: number) => void;
  stop: () => void;
}

export const useTourStore = create<TourState>()(
  persist(
    (set) => ({
      active: false,
      step: 0,
      start: () => set({ active: true, step: 0 }),
      go: (step) => set({ step: Math.max(0, Math.min(TOUR_STEPS.length - 1, step)) }),
      stop: () => set({ active: false, step: 0 }),
    }),
    { name: 'kd-tour', storage: createJSONStorage(() => sessionStorage) },
  ),
);
