import { motion, useReducedMotion } from 'framer-motion';
import type { Level, Tone } from '@/models';
import { cn } from '@/lib/utils';
import { Counter, EASE } from './motion';
import { levelTone, toneText, toneVar } from './tone';

/** Circular score (0–100) with an animated arc. */
export function ScoreRing({
  score,
  tone,
  size = 148,
  stroke = 10,
  label,
  sub,
}: {
  score: number | null;
  tone: Tone;
  size?: number;
  stroke?: number;
  label?: string;
  sub?: string;
}) {
  const reduce = useReducedMotion();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = score === null ? 0 : score / 100;
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--line))" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={toneVar[tone]}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: reduce ? c * (1 - pct) : c }}
          whileInView={{ strokeDashoffset: c * (1 - pct) }}
          viewport={{ once: true }}
          transition={{ duration: 1.4, ease: EASE }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          {score === null ? (
            <span className="text-h2 font-semibold text-ink-3">—</span>
          ) : (
            <Counter value={score} className="tabular block text-[2.4rem] font-semibold leading-none tracking-tight text-ink" />
          )}
          {label && <span className={cn('mt-1.5 block font-semibold leading-tight', size < 140 ? 'max-w-[5.5rem] text-label' : 'text-sm', toneText[tone])}>{label}</span>}
          {sub && <span className="block text-label text-ink-3">{sub}</span>}
        </div>
      </div>
    </div>
  );
}

/** Half-circle risk meter with LOW / MEDIUM / HIGH zones. */
export function RiskMeter({ score, level, size = 180, insufficient }: { score: number; level: Level; size?: number; insufficient?: boolean }) {
  const reduce = useReducedMotion();
  const stroke = 12;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const pct = insufficient ? 0 : score / 100;
  const zone = (from: number, to: number) => {
    const a0 = Math.PI * (1 - from);
    const a1 = Math.PI * (1 - to);
    return `M ${cx + r * Math.cos(a0)} ${cy - r * Math.sin(a0)} A ${r} ${r} 0 0 1 ${cx + r * Math.cos(a1)} ${cy - r * Math.sin(a1)}`;
  };
  return (
    <div className="relative" style={{ width: size, height: size / 2 + 34 }}>
      <svg width={size} height={size / 2 + stroke} viewBox={`0 0 ${size} ${size / 2 + stroke}`} aria-hidden>
        <path d={zone(0, 0.355)} stroke="rgb(var(--accent) / 0.22)" strokeWidth={stroke} fill="none" />
        <path d={zone(0.365, 0.655)} stroke="rgb(var(--warn) / 0.25)" strokeWidth={stroke} fill="none" />
        <path d={zone(0.665, 1)} stroke="rgb(var(--danger) / 0.25)" strokeWidth={stroke} fill="none" />
        {!insufficient && (
          <motion.path
            d={zone(0, 1)}
            stroke={toneVar[levelTone[level]]}
            strokeWidth={stroke}
            strokeLinecap="round"
            fill="none"
            initial={{ pathLength: reduce ? pct : 0 }}
            animate={{ pathLength: Math.max(0.02, pct) }}
            transition={{ duration: 1.2, ease: EASE }}
          />
        )}
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center">
        {insufficient ? (
          <span className="text-sm font-semibold text-ink-3">Not enough data</span>
        ) : (
          <>
            <span className={cn('block text-lead font-bold tracking-[0.14em]', toneText[levelTone[level]])}>{level.toUpperCase()}</span>
            <span className="tabular text-label text-ink-3">{score} / 100</span>
          </>
        )}
      </div>
    </div>
  );
}

/** Horizontal scale with coloured bands and a marker (e.g. soil nutrient). */
export function BandBar({ position, bands, tone }: { position: number; bands: { width: number; tone: Tone }[]; tone: Tone }) {
  const reduce = useReducedMotion();
  return (
    <div className="relative h-2 w-full" aria-hidden>
      <div className="flex h-full w-full overflow-hidden rounded-full">
        {bands.map((b, i) => (
          <div key={i} style={{ width: `${b.width * 100}%`, background: toneVar[b.tone], opacity: 0.22 }} />
        ))}
      </div>
      <motion.span
        className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface shadow-soft"
        style={{ background: toneVar[tone] }}
        initial={{ left: reduce ? `${position * 100}%` : '0%' }}
        whileInView={{ left: `${position * 100}%` }}
        viewport={{ once: true }}
        transition={{ duration: 1, ease: EASE }}
      />
    </div>
  );
}

/** Thin progress line. */
export function Progress({ value, tone = 'good', className }: { value: number; tone?: Tone; className?: string }) {
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-sunken', className)}>
      <motion.div
        className="h-full rounded-full"
        style={{ background: toneVar[tone] }}
        initial={{ width: 0 }}
        whileInView={{ width: `${Math.max(2, Math.min(100, value))}%` }}
        viewport={{ once: true }}
        transition={{ duration: 1, ease: EASE }}
      />
    </div>
  );
}
