import { create } from 'zustand';
import type { FieldTarget } from '@/models';

/**
 * Which part of the dashboard field view is being pointed at (e.g. while an action is hovered
 * or focused). The 3D marker reads it; nothing else re-renders when it changes.
 */
interface FieldFocusState {
  target: FieldTarget | null;
  focus: (target: FieldTarget) => void;
  clear: () => void;
}

export const useFieldFocus = create<FieldFocusState>((set) => ({
  target: null,
  focus: (target) => set({ target }),
  clear: () => set({ target: null }),
}));
