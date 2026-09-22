import { create } from 'zustand';

export interface Toast {
  id: number;
  title: string;
  detail?: string;
  tone: 'success' | 'info' | 'error';
}

interface ToastState {
  toasts: Toast[];
  push: (t: Omit<Toast, 'id'>) => void;
  dismiss: (id: number) => void;
}

let next = 1;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push: (t) => {
    const id = next++;
    set({ toasts: [...get().toasts.slice(-2), { ...t, id }] });
    window.setTimeout(() => get().dismiss(id), 4200);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

export const toast = (title: string, detail?: string, tone: Toast['tone'] = 'success') => useToastStore.getState().push({ title, detail, tone });
