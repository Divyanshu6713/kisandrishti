/**
 * Authentication contracts. Two providers implement `AuthProvider`:
 *   - `supabase`: real email/phone + password accounts (Supabase Auth), used when
 *     VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set.
 *   - `demo`: no accounts at all — only a clearly labelled Demo Login session kept in the
 *     browser. It gates the UI; it is not security for private data.
 */
export type AuthProviderId = 'demo' | 'supabase';

export interface AuthUser {
  id: string;
  displayName: string;
  /** Masked email/phone for display, or null for demo users. */
  identifier: string | null;
  isDemo: boolean;
}

export interface AuthSession {
  provider: AuthProviderId;
  user: AuthUser;
  /** Epoch ms when the session ends; null when the provider refreshes it (Supabase). */
  expiresAt: number | null;
}

export type Identifier = { kind: 'email'; value: string } | { kind: 'phone'; value: string };

export type AuthErrorCode = 'invalid-credentials' | 'not-configured' | 'network' | 'rate-limited' | 'weak-password' | 'unknown';

export class AuthError extends Error {
  constructor(
    public code: AuthErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

export type SessionEvent = 'signed-in' | 'signed-out' | 'expired' | 'password-recovery';

export interface AuthProvider {
  id: AuthProviderId;
  /** Whether real accounts (email/phone + password) can sign in. */
  accountsEnabled: boolean;
  restore(): Promise<{ session: AuthSession | null; expired: boolean }>;
  signIn(id: Identifier, password: string, remember: boolean): Promise<AuthSession>;
  signInDemo(remember: boolean): Promise<AuthSession>;
  signOut(): Promise<void>;
  requestPasswordReset(email: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  /** Changes that happen outside this tab or outside user action (other tab logout, token refresh failure). */
  subscribe(cb: (session: AuthSession | null, event: SessionEvent) => void): () => void;
}
