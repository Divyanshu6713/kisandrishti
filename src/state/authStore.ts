import { create } from 'zustand';
import { AuthError, authProvider, type AuthSession, type Identifier } from '@/services/auth';
import { useLiveWeather } from './liveWeatherStore';
import { useTourStore } from './tourStore';
import { useUiStore } from './uiStore';

/**
 * Session state for the whole app. `status` starts as 'loading' until the provider has
 * restored (or not) a saved session, so guarded routes never flash protected content.
 */
export type EndReason = 'signed-out' | 'expired' | null;

interface AuthState {
  status: 'loading' | 'authenticated' | 'unauthenticated';
  session: AuthSession | null;
  endReason: EndReason;
  /** Supabase password-recovery link was opened: show the "set a new password" form. */
  recovery: boolean;

  init: () => void;
  signIn: (id: Identifier, password: string, remember: boolean) => Promise<void>;
  signInDemo: (remember: boolean) => Promise<void>;
  signOut: () => Promise<void>;
  clearEndReason: () => void;
  finishRecovery: () => void;
}

/** Forget per-user browser state (not the bundled demo farm records). */
function clearUserState() {
  useLiveWeather.getState().reset();
  useTourStore.getState().stop();
  useUiStore.getState().closeAssistant();
  useUiStore.getState().setNav(false);
}

let started = false;
let expiryTimer = 0;

export const useAuthStore = create<AuthState>((set, get) => {
  const end = (reason: EndReason) => {
    window.clearTimeout(expiryTimer);
    if (get().status === 'authenticated') clearUserState();
    set({ status: 'unauthenticated', session: null, endReason: reason });
  };

  /** Ends the session exactly when it expires (and re-checks when the tab becomes visible). */
  const armExpiry = (s: AuthSession) => {
    window.clearTimeout(expiryTimer);
    if (s.expiresAt === null) return;
    const ms = s.expiresAt - Date.now();
    if (ms <= 0) {
      void authProvider.signOut();
      end('expired');
      return;
    }
    expiryTimer = window.setTimeout(() => armExpiry(s), Math.min(ms, 2 ** 31 - 1));
  };

  const begin = (s: AuthSession) => {
    set({ status: 'authenticated', session: s, endReason: null });
    armExpiry(s);
  };

  return {
    status: 'loading',
    session: null,
    endReason: null,
    recovery: false,

    init() {
      if (started) return;
      started = true;
      authProvider
        .restore()
        .then(({ session, expired }) => (session ? begin(session) : set({ status: 'unauthenticated', endReason: expired ? 'expired' : null })))
        .catch(() => set({ status: 'unauthenticated' }));

      authProvider.subscribe((session, event) => {
        if (event === 'password-recovery') set({ recovery: true });
        if (session) {
          if (get().status !== 'authenticated' || get().session?.user.id !== session.user.id) begin(session);
          else set({ session });
        } else if (get().status === 'authenticated') end(event === 'expired' ? 'expired' : 'signed-out');
      });

      document.addEventListener('visibilitychange', () => {
        const s = get().session;
        if (document.visibilityState === 'visible' && s) armExpiry(s);
      });
    },

    async signIn(id, password, remember) {
      begin(await authProvider.signIn(id, password, remember));
    },

    async signInDemo(remember) {
      begin(await authProvider.signInDemo(remember));
    },

    async signOut() {
      try {
        await authProvider.signOut();
      } finally {
        end('signed-out');
      }
    },

    clearEndReason: () => set({ endReason: null }),
    finishRecovery: () => set({ recovery: false }),
  };
});

export { AuthError };
