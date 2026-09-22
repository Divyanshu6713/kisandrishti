import { motion, useReducedMotion } from 'framer-motion';
import { useId, useMemo, useState } from 'react';
import { EASE } from '@/components/ui/motion';

export interface Series {
  name: string;
  color: string; // CSS colour, e.g. 'rgb(var(--accent))'
  values: (number | null)[];
  dashed?: boolean;
  area?: boolean;
}

/**
 * Lightweight animated SVG line chart (no chart library).
 * Hover/focus shows values; the last point can be highlighted as "today".
 */
export function LineChart({
  labels,
  series,
  height = 220,
  min = 0,
  max = 100,
  unit = '',
  highlightLast,
  ariaLabel,
}: {
  labels: string[];
  series: Series[];
  height?: number;
  min?: number;
  max?: number;
  unit?: string;
  highlightLast?: string;
  ariaLabel: string;
}) {
  const reduce = useReducedMotion();
  const gid = useId().replace(/:/g, '');
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = height;
  const pad = { l: 34, r: 14, t: 14, b: 28 };
  const n = labels.length;
  const x = (i: number) => pad.l + (n <= 1 ? 0 : (i / (n - 1)) * (W - pad.l - pad.r));
  const y = (v: number) => pad.t + (1 - (v - min) / (max - min)) * (H - pad.t - pad.b);
  const ticks = useMemo(() => [min, min + (max - min) / 2, max], [min, max]);

  const pathFor = (vals: (number | null)[]) =>
    vals.reduce((d, v, i) => (v === null ? d : `${d}${d === '' || vals[i - 1] === null ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)} `), '');

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full overflow-visible" role="img" aria-label={ariaLabel} onMouseLeave={() => setHover(null)}>
        <defs>
          {series.map((s, i) => (
            <linearGradient key={i} id={`${gid}-g${i}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity={0.18} />
              <stop offset="100%" stopColor={s.color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="rgb(var(--line))" strokeDasharray="3 5" />
            <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="rgb(var(--ink-3))">
              {Math.round(t)}
            </text>
          </g>
        ))}
        {labels.map((l, i) =>
          i % Math.ceil(n / 6) === 0 || i === n - 1 ? (
            <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize="11" fill={i === n - 1 && highlightLast ? 'rgb(var(--ink))' : 'rgb(var(--ink-3))'} fontWeight={i === n - 1 && highlightLast ? 600 : 400}>
              {i === n - 1 && highlightLast ? highlightLast : l}
            </text>
          ) : null,
        )}
        {series.map((s, si) => {
          const d = pathFor(s.values);
          const firstIdx = s.values.findIndex((v) => v !== null);
          const lastIdx = s.values.length - 1 - [...s.values].reverse().findIndex((v) => v !== null);
          return (
            <g key={s.name}>
              {s.area && firstIdx >= 0 && (
                <motion.path
                  d={`${d} L${x(lastIdx)},${y(min)} L${x(firstIdx)},${y(min)} Z`}
                  fill={`url(#${gid}-g${si})`}
                  initial={{ opacity: reduce ? 1 : 0 }}
                  whileInView={{ opacity: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 1, delay: 0.5 }}
                />
              )}
              <motion.path
                d={d}
                fill="none"
                stroke={s.color}
                strokeWidth={2.25}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={s.dashed ? '5 6' : undefined}
                initial={{ pathLength: reduce || s.dashed ? 1 : 0 }}
                whileInView={{ pathLength: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 1.4, ease: EASE, delay: si * 0.15 }}
              />
              {highlightLast && lastIdx >= 0 && s.values[lastIdx] !== null && (
                <circle cx={x(lastIdx)} cy={y(s.values[lastIdx] as number)} r={4.5} fill="rgb(var(--surface))" stroke={s.color} strokeWidth={2.5} />
              )}
            </g>
          );
        })}
        {labels.map((_, i) => (
          <rect key={i} x={x(i) - (W - pad.l - pad.r) / Math.max(1, n - 1) / 2} y={pad.t} width={(W - pad.l - pad.r) / Math.max(1, n - 1)} height={H - pad.t - pad.b} fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke="rgb(var(--ink-3) / 0.4)" />}
      </svg>
      {hover !== null && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-ctl border border-line bg-surface px-3 py-2 text-sm shadow-lift"
          style={{ left: `${(x(hover) / W) * 100}%` }}
        >
          <p className="mb-1 text-label text-ink-3">{hover === n - 1 && highlightLast ? highlightLast : labels[hover]}</p>
          {series.map((s) =>
            s.values[hover] === null ? null : (
              <p key={s.name} className="flex items-center gap-2 whitespace-nowrap">
                <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                <span className="text-ink-2">{s.name}</span>
                <span className="tabular font-semibold">
                  {s.values[hover]}
                  {unit}
                </span>
              </p>
            ),
          )}
        </div>
      )}
      <ul className="mt-3 flex flex-wrap gap-4">
        {series.map((s) => (
          <li key={s.name} className="flex items-center gap-2 text-sm text-ink-2">
            <span className="h-0.5 w-4 rounded" style={{ background: s.color }} />
            {s.name}
          </li>
        ))}
      </ul>
    </div>
  );
}
