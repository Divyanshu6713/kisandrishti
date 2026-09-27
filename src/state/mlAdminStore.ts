import { create } from 'zustand';
import type { AdminIdentity } from '@/models/mlAdmin';
import { clearAdminSession, MlApiError, mlAdminApi, mlApiConfigured, storedAdmin } from '@/services/mlAdmin/api';

/**
 * Whether this browser currently holds a server-verified ML-admin session. Used only to decide what to
 * show (e.g. the "AI Model Training" nav entry) — the backend checks the token on every request.
 */
interface MlAdminState {
  status: 'unknown' | 'checking' | 'signed-in' | 'signed-out';
  admin: AdminIdentity | null;
  error: string | null;
  check: () => Promise<void>;
  signInWithKey: (key: string) => Promise<void>;
  signInWithAccount: () => Promise<void>;
  signOut: () => void;
}

export const useMlAdmin = create<MlAdminState>((set, get) => ({
  status: storedAdmin() ? 'signed-in' : 'unknown',
  admin: storedAdmin(),
  error: null,

  async check() {
    if (!mlApiConfigured() || get().status === 'checking') return;
    set({ status: 'checking' });
    try {
      set({ status: 'signed-in', admin: await mlAdminApi.me(), error: null });
    } catch {
      set({ status: 'signed-out', admin: null });
    }
  },

  async signInWithKey(key) {
    set({ error: null });
    try {
      const admin = await mlAdminApi.signInWithKey(key);
      set({ status: 'signed-in', admin });
    } catch (e) {
      set({ status: 'signed-out', error: e instanceof MlApiError ? e.message : 'Sign-in failed.' });
    }
  },

  async signInWithAccount() {
    set({ error: null, status: 'checking' });
    try {
      set({ status: 'signed-in', admin: await mlAdminApi.me() });
    } catch (e) {
      set({ status: 'signed-out', error: e instanceof MlApiError ? e.message : 'This account is not allowed to manage AI models.' });
    }
  },

  signOut() {
    clearAdminSession();
    set({ status: 'signed-out', admin: null, error: null });
  },
}));
