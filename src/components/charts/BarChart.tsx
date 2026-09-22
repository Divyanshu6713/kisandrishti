import { motion, useReducedMotion } from 'framer-motion';
import { EASE } from '@/components/ui/motion';

/** Simple animated vertical bars (e.g. yield per season). Null values render as "in progress". */
export function BarChart({
  data,
  unit,
  max,
  ariaLabel,
}: {
  data: { label: string; value: number | null; sub?: string; color?: string }[];
  unit: string;
  max: number;
  ariaLabel: string;
}) {
  const reduce = useReducedMotion();
  return (
    <div role="img" aria-label={ariaLabel} className="flex h-56 items-end gap-4 sm:gap-8">
      {data.map((d, i) => (
        <div key={d.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end">
          <span className="tabular mb-2 text-sm font-semibold">{d.value === null ? '—' : `${d.value} ${unit}`}</span>
          <div className="relative w-full max-w-[4.5rem] flex-1">
            {d.value === null ? (
              <div className="absolute inset-x-0 bottom-0 h-1/3 rounded-t-lg border border-dashed border-line" />
            ) : (
              <motion.div
                className="absolute inset-x-0 bottom-0 rounded-t-lg"
                style={{ background: d.color ?? 'rgb(var(--accent))', height: `${(d.value / max) * 100}%`, transformOrigin: 'bottom' }}
                initial={{ scaleY: reduce ? 1 : 0 }}
                whileInView={{ scaleY: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 1, ease: EASE, delay: i * 0.12 }}
              />
            )}
          </div>
          <span className="mt-2 text-sm font-medium">{d.label}</span>
          {d.sub && <span className="text-center text-label text-ink-3">{d.sub}</span>}
        </div>
      ))}
    </div>
  );
}

/** Tiny inline trend line. */
export function Sparkline({ values, color = 'rgb(var(--accent))', width = 96, height = 28 }: { values: number[]; color?: string; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${((i / (values.length - 1)) * (width - 4) + 2).toFixed(1)},${(height - 3 - ((v - min) / span) * (height - 6)).toFixed(1)}`).join(' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
