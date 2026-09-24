import type { Identifier } from './types';

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;

/** Accepts an email or an Indian mobile number (10 digits, optional +91 / 0 prefix). */
export function parseIdentifier(raw: string): Identifier | null {
  const v = raw.trim();
  if (v.length > 254) return null;
  if (v.includes('@')) return EMAIL.test(v) ? { kind: 'email', value: v.toLowerCase() } : null;
  const digits = v.replace(/[\s-]/g, '').replace(/^(\+91|0091|91(?=\d{10}$)|0(?=\d{10}$))/, '');
  return /^[6-9]\d{9}$/.test(digits) ? { kind: 'phone', value: `+91${digits}` } : null;
}

export const isEmail = (v: string) => EMAIL.test(v.trim());

/** For display only: "ra•••@gmail.com", "+91 •••••• 3210". */
export function maskIdentifier(v: string | null | undefined): string | null {
  if (!v) return null;
  if (v.includes('@')) {
    const [u, d] = v.split('@');
    return `${u.slice(0, 2)}•••@${d}`;
  }
  return `+91 •••••• ${v.slice(-4)}`;
}
