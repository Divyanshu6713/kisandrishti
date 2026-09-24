import type { AuthChangeEvent, Session, SupabaseClient } from '@supabase/supabase-js';
import { maskIdentifier } from './identifier';
import { AuthError, type AuthProvider, type AuthSession, type SessionEvent } from './types';

/**
 * Supabase Auth provider. Only the public project URL and anon key reach the browser;
 * the service-role key must never be set in any VITE_* variable. Data access must be
 * protected by Row Level Security on the Supabase side — the route guard is UX only.
 *
 * "Remember session": tokens go to localStorage; otherwise to sessionStorage (ends with the tab).
 * Demo Login uses Supabase anonymous sign-in, so no demo password ships in the bundle.
 */
const REMEMBER_KEY = 'kd-auth-remember';
const STORAGE_KEY = 'kd-sb-auth';

const remembered = () => {
  try {
    return localStorage.getItem(REMEMBER_KEY) === '1';
  } catch {
    return false;
  }
};

/** Routes Supabase's token storage to local- or sessionStorage based on "Remember session". */
const routedStorage = {
  getItem: (k: string) => {
    try {
      return sessionStorage.getItem(k) ?? localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  setItem: (k: string, v: string) => {
    try {
      (remembered() ? localStorage : sessionStorage).setItem(k, v);
      (remembered() ? sessionStorage : localStorage).removeItem(k);
    } catch {
      /* storage blocked */
    }
  },
  removeItem: (k: string) => {
    try {
      localStorage.removeItem(k);
      sessionStorage.removeItem(k);
    } catch {
      /* storage blocked */
    }
  },
};

function toSession(s: Session): AuthSession {
  const u = s.user;
  const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
  const named = typeof meta.full_name === 'string' ? meta.full_name : typeof meta.name === 'string' ? meta.name : null;
  const isDemo = Boolean(u.is_anonymous);
  return {
    provider: 'supabase',
    user: {
      id: u.id,
      isDemo,
      displayName: isDemo ? 'Demo farmer' : (named?.slice(0, 60) ?? u.email?.split('@')[0] ?? 'Farmer'),
      identifier: isDemo ? null : maskIdentifier(u.email ?? u.phone),
    },
    expiresAt: null,
  };
}

function mapError(e: { status?: number; message?: string; code?: string } | null | undefined): AuthError {
  const status = e?.status ?? 0;
  const msg = (e?.message ?? '').toLowerCase();
  if (status === 429 || msg.includes('rate limit')) return new AuthError('rate-limited', 'Too many attempts. Please wait a minute and try again.');
  if (msg.includes('anonymous sign-ins are disabled'))
    return new AuthError('not-configured', 'Demo Login is not enabled for this Supabase project (anonymous sign-ins are off).');
  if (msg.includes('password') && (msg.includes('weak') || msg.includes('at least')))
    return new AuthError('weak-password', 'Choose a stronger password (at least 8 characters).');
  if (status === 400 || msg.includes('invalid login')) return new AuthError('invalid-credentials', 'The email/mobile or password is incorrect.');
  if (status === 0 || msg.includes('fetch')) return new AuthError('network', 'Could not reach the sign-in service. Check your connection.');
  return new AuthError('unknown', 'Sign-in failed. Please try again.');
}

export function createSupabaseProvider(url: string, anonKey: string): AuthProvider {
  let clientP: Promise<SupabaseClient> | null = null;
  // Loaded on demand so the demo build does not carry the Supabase client.
  const client = () =>
    (clientP ??= import('@supabase/supabase-js').then(({ createClient }) =>
      createClient(url, anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storage: routedStorage, storageKey: STORAGE_KEY, flowType: 'pkce' },
      }),
    ));
  let userSignedOut = false;

  const setRemember = (remember: boolean) => {
    try {
      localStorage.setItem(REMEMBER_KEY, remember ? '1' : '0');
    } catch {
      /* storage blocked */
    }
  };

  return {
    id: 'supabase',
    accountsEnabled: true,

    async restore() {
      const { data, error } = await (await client()).auth.getSession();
      if (error) return { session: null, expired: true };
      return { session: data.session ? toSession(data.session) : null, expired: false };
    },

    async signIn(id, password, remember) {
      setRemember(remember);
      const sb = await client();
      const { data, error } = await sb.auth.signInWithPassword(id.kind === 'email' ? { email: id.value, password } : { phone: id.value, password });
      if (error || !data.session) throw mapError(error);
      return toSession(data.session);
    },

    async signInDemo(remember) {
      setRemember(remember);
      const { data, error } = await (await client()).auth.signInAnonymously();
      if (error || !data.session) throw mapError(error);
      return toSession(data.session);
    },

    async signOut() {
      userSignedOut = true;
      // Revokes this session's refresh token on the server, then clears local tokens.
      await (await client()).auth.signOut({ scope: 'local' }).catch(() => undefined);
      routedStorage.removeItem(STORAGE_KEY);
    },

    async requestPasswordReset(email) {
      const { error } = await (await client()).auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/login?mode=recovery` });
      // Same response whether or not the account exists (no account enumeration).
      if (error && (error.status === 429 || error.status === 0)) throw mapError(error);
    },

    async updatePassword(password) {
      const { error } = await (await client()).auth.updateUser({ password });
      if (error) throw mapError(error);
    },

    subscribe(cb) {
      let unsub = () => {};
      let closed = false;
      void client().then((sb) => {
        if (closed) return;
        const { data } = sb.auth.onAuthStateChange((event: AuthChangeEvent, s: Session | null) => {
          let ev: SessionEvent | null = null;
          if (event === 'PASSWORD_RECOVERY') ev = 'password-recovery';
          else if (event === 'SIGNED_OUT') {
            ev = userSignedOut ? 'signed-out' : 'expired';
            userSignedOut = false;
          } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') ev = 'signed-in';
          if (ev) setTimeout(() => cb(s ? toSession(s) : null, ev!), 0); // never await inside the Supabase callback
        });
        unsub = () => data.subscription.unsubscribe();
      });
      return () => {
        closed = true;
        unsub();
      };
    },
  };
}
