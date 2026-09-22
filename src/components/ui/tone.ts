import type { Level, Tone } from '@/models';

/** Semantic colour classes — the only place tones/levels map to palette tokens. */
export const toneText: Record<Tone, string> = {
  good: 'text-accent',
  ok: 'text-info',
  warn: 'text-warn',
  bad: 'text-danger',
  neutral: 'text-ink-3',
};

export const toneBg: Record<Tone, string> = {
  good: 'bg-accent-soft text-accent',
  ok: 'bg-info-soft text-info',
  warn: 'bg-warn-soft text-warn',
  bad: 'bg-danger-soft text-danger',
  neutral: 'bg-sunken text-ink-2',
};

export const toneFill: Record<Tone, string> = {
  good: 'bg-accent',
  ok: 'bg-info',
  warn: 'bg-warn',
  bad: 'bg-danger',
  neutral: 'bg-ink-3',
};

/** CSS colour string usable in SVG / canvas. */
export const toneVar: Record<Tone, string> = {
  good: 'rgb(var(--accent))',
  ok: 'rgb(var(--info))',
  warn: 'rgb(var(--warn))',
  bad: 'rgb(var(--danger))',
  neutral: 'rgb(var(--ink-3))',
};

export const levelTone: Record<Level, Tone> = { low: 'good', medium: 'warn', high: 'bad' };
export const priorityTone: Record<Level, Tone> = { low: 'neutral', medium: 'warn', high: 'bad' };

export function scoreTone(score: number): Tone {
  if (score >= 75) return 'good';
  if (score >= 55) return 'warn';
  return 'bad';
}
