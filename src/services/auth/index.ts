import { demoProvider } from './demoProvider';
import { createSupabaseProvider } from './supabaseProvider';
import type { AuthProvider } from './types';

/**
 * Picks the auth provider from public build-time configuration.
 *   VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY  → Supabase Auth (real accounts)
 *   neither                                      → Demo mode (Demo Login only)
 * Only public values belong here. A service-role key in the browser would bypass all
 * database security, so it is refused outright.
 */
type Env = Record<string, string | undefined>;
const env = import.meta.env as unknown as Env;

const url = env.VITE_SUPABASE_URL?.trim();
const anonKey = env.VITE_SUPABASE_ANON_KEY?.trim();

function looksLikeServiceRole(key: string): boolean {
  if (key.startsWith('sb_secret_')) return true;
  try {
    const payload = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload?.role === 'service_role';
  } catch {
    return false;
  }
}

function pick(): { provider: AuthProvider; misconfigured: boolean } {
  if (!url || !anonKey) return { provider: demoProvider, misconfigured: Boolean(url || anonKey) };
  if (!/^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)+\/?$/i.test(url) || looksLikeServiceRole(anonKey)) return { provider: demoProvider, misconfigured: true };
  return { provider: createSupabaseProvider(url.replace(/\/$/, ''), anonKey), misconfigured: false };
}

const picked = pick();
export const authProvider = picked.provider;
/** True when Supabase variables were set but rejected (e.g. a secret key) — shown as a quiet note. */
export const authMisconfigured = picked.misconfigured;

export { parseIdentifier, isEmail, maskIdentifier } from './identifier';
export { AuthError } from './types';
export type { AuthSession, AuthUser, AuthProvider, Identifier } from './types';
