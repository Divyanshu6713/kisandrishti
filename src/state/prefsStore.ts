import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type Lang = 'en' | 'hi';
/** How this person farms. Same brand and design system; different density and features. */
export type FarmingMode = 'field' | 'rooftop';

/**
 * Device preferences chosen during onboarding. `null` means "not chosen yet", which is what
 * sends a signed-in user through /welcome. Kept on logout: they describe the device's user.
 */
interface PrefsState {
  language: Lang | null;
  mode: FarmingMode | null;
  setLanguage: (l: Lang) => void;
  setMode: (m: FarmingMode) => void;
}

export const usePrefs = create<PrefsState>()(
  persist(
    (set) => ({
      language: null,
      mode: null,
      setLanguage: (language) => set({ language }),
      setMode: (mode) => set({ mode }),
    }),
    { name: 'kd-prefs', version: 1, storage: createJSONStorage(() => localStorage) },
  ),
);
