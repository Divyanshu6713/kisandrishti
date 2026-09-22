export const clamp = (v: number, min = 0, max = 100) => Math.min(max, Math.max(min, v));
export const round = (v: number, dp = 0) => {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
};

export const DAY_MS = 86_400_000;

export function toDate(iso: string): Date {
  // Treat plain dates as local noon to avoid timezone day-shifts.
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00`) : new Date(iso);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((toDate(toIso).getTime() - toDate(fromIso).getTime()) / DAY_MS);
}

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const fmtDate = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtShort = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' });
const fmtWeekday = new Intl.DateTimeFormat('en-IN', { weekday: 'short' });

export const formatDate = (iso: string) => fmtDate.format(toDate(iso));
export const formatShortDate = (iso: string) => fmtShort.format(toDate(iso));
export const formatWeekday = (iso: string) => fmtWeekday.format(toDate(iso));

export function uid(prefix = 'id'): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
}

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
