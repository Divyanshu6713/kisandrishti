import { create } from 'zustand';

interface UiState {
  assistantOpen: boolean;
  /** Question to pre-fill when the assistant opens (e.g. from a page shortcut). */
  assistantSeed: string | null;
  navOpen: boolean;
  openAssistant: (seed?: string) => void;
  closeAssistant: () => void;
  setNav: (open: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  assistantOpen: false,
  assistantSeed: null,
  navOpen: false,
  openAssistant: (seed) => set({ assistantOpen: true, assistantSeed: seed ?? null }),
  closeAssistant: () => set({ assistantOpen: false, assistantSeed: null }),
  setNav: (open) => set({ navOpen: open }),
}));
