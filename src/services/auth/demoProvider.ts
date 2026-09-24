import { AuthError, type AuthProvider, type AuthSession } from './types';

/**
 * Demo-only provider (used when Supabase is not configured).
 * There are no accounts and no passwords: the only way in is the labelled Demo Login,
 * which opens the bundled sample farm. The session is a small flag in browser storage
 * with an expiry — it keeps the prototype's routes behind a login step; it does not
 * protect data (all data in this mode is public demo data).
 */
const KEY = 'kd-session';
const SHORT_MS = 8 * 3_600_000; //  this browser tab/session
const LONG_MS = 7 * 86_400_000; //  "remember me"

function read(store: Storage): AuthSession | null {
  try {
    const raw = store.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as AuthSession;
    if (s?.provider !== 'demo' || typeof s.expiresAt !== 'number' || !s.user?.isDemo) {
      store.removeItem(KEY);
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

function clear() {
  try {
    localStorage.removeItem(KEY);
    sessionStorage.removeItem(KEY);
  } catch {
    /* storage blocked */
  }
}

const notEnabled = () =>
  new AuthError('not-configured', 'Account sign-in is not enabled on this demo deployment. Use Demo Login to explore the sample farm.');

export const demoProvider: AuthProvider = {
  id: 'demo',
  accountsEnabled: false,

  async restore() {
    let s: AuthSession | null = null;
    try {
      s = read(sessionStorage) ?? read(localStorage);
    } catch {
      s = null;
    }
    if (s && s.expiresAt! <= Date.now()) {
      clear();
      return { session: null, expired: true };
    }
    return { session: s, expired: false };
  },

  async signIn() {
    throw notEnabled();
  },

  async signInDemo(remember) {
    const session: AuthSession = {
      provider: 'demo',
      user: { id: 'demo-farmer', displayName: 'Demo farmer', identifier: null, isDemo: true },
      expiresAt: Date.now() + (remember ? LONG_MS : SHORT_MS),
    };
    clear();
    try {
      (remember ? localStorage : sessionStorage).setItem(KEY, JSON.stringify(session));
    } catch {
      /* storage blocked: session lasts until this page is closed */
    }
    return session;
  },

  async signOut() {
    clear();
  },

  async requestPasswordReset() {
    throw notEnabled();
  },

  async updatePassword() {
    throw notEnabled();
  },

  subscribe(cb) {
    // Logging out in another tab ends this tab's session too.
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY && e.newValue === null) cb(null, 'signed-out');
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  },
};
