import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Info } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import type { Level, Tone } from '@/models';
import { cn } from '@/lib/utils';
import { EASE } from './motion';
import { levelTone, priorityTone, toneBg, toneFill, toneText } from './tone';

export function Card({ children, className, as: As = 'section' }: { children: ReactNode; className?: string; as?: 'section' | 'div' | 'article' }) {
  return <As className={cn('card card-pad', className)}>{children}</As>;
}

export function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-col gap-4 sm:mb-10 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-prose">
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h1 className="text-h1 text-balance">{title}</h1>
        {description && <p className="mt-2 text-lead text-ink-2 text-pretty">{description}</p>}
      </div>
      {action && <div className="flex shrink-0 flex-wrap gap-2">{action}</div>}
    </header>
  );
}

export function SectionTitle({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <div>
        <h2 className="text-h3">{title}</h2>
        {hint && <p className="text-sm text-ink-3">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

export function Pill({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cn('chip', toneBg[tone], className)}>{children}</span>;
}

export function LevelBadge({ level, prefix }: { level: Level; prefix?: string }) {
  return (
    <Pill tone={levelTone[level]}>
      <span className={cn('h-1.5 w-1.5 rounded-full', toneFill[levelTone[level]])} />
      {prefix ? `${prefix} ` : ''}
      {level.charAt(0).toUpperCase() + level.slice(1)}
    </Pill>
  );
}

export function PriorityBadge({ level }: { level: Level }) {
  const label = level === 'high' ? 'High priority' : level === 'medium' ? 'Medium priority' : 'Low priority';
  return <Pill tone={priorityTone[level]}>{label}</Pill>;
}

export function Dot({ tone }: { tone: Tone }) {
  return <span className={cn('inline-block h-2 w-2 shrink-0 rounded-full', toneFill[tone])} aria-hidden />;
}

/** Accessible expand/collapse with a height animation. */
export function Disclosure({
  summary,
  children,
  defaultOpen = false,
  className,
  buttonClassName,
}: {
  summary: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  buttonClassName?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className={cn('flex w-full items-center justify-between gap-3 text-left text-sm font-semibold text-ink-2 transition-colors hover:text-ink', buttonClassName)}
      >
        <span className="min-w-0">{summary}</span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform duration-300 ease-calm', open && 'rotate-180')} aria-hidden />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={id}
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: EASE }}
            className="overflow-hidden"
          >
            <div className="pt-3">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Segmented control (tabs). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label: string;
  className?: string;
}) {
  const layoutId = useId();
  return (
    <div role="tablist" aria-label={label} className={cn('inline-flex max-w-full overflow-x-auto rounded-ctl border border-line bg-sunken/60 p-1 scrollbar-none', className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn('relative whitespace-nowrap rounded-[0.55rem] px-3.5 py-1.5 text-sm font-semibold transition-colors', active ? 'text-ink' : 'text-ink-3 hover:text-ink-2')}
          >
            {active && <motion.span layoutId={layoutId} className="absolute inset-0 rounded-[0.55rem] bg-surface shadow-soft" transition={{ duration: 0.35, ease: EASE }} />}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-ctl bg-sunken', className)} aria-hidden />;
}

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-card border border-dashed border-line px-6 py-12 text-center">
      {icon && <div className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-sunken text-ink-3">{icon}</div>}
      <h3 className="text-h3">{title}</h3>
      {body && <p className="mt-1.5 max-w-sm text-sm text-ink-2">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** The standard "we will not guess" state. */
export function InsufficientData({ missing, message, action }: { missing: string[]; message: string; action?: ReactNode }) {
  return (
    <div className="rounded-card border border-line bg-sunken/50 p-5">
      <div className="flex gap-3">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-ink-3" aria-hidden />
        <div>
          <p className="font-semibold text-ink">{message}</p>
          {missing.length > 0 && <p className="mt-1 text-sm text-ink-2">Needed: {missing.join(', ')}</p>}
          {action && <div className="mt-4">{action}</div>}
        </div>
      </div>
    </div>
  );
}

export function Stat({ label, value, unit, hint, tone }: { label: string; value: ReactNode; unit?: string; hint?: ReactNode; tone?: Tone }) {
  return (
    <div>
      <p className="text-label font-medium text-ink-3">{label}</p>
      <p className={cn('mt-1 text-h2 font-semibold tabular', tone ? toneText[tone] : 'text-ink')}>
        {value}
        {unit && <span className="ml-1 text-sm font-medium text-ink-3">{unit}</span>}
      </p>
      {hint && <p className="mt-0.5 text-sm text-ink-3">{hint}</p>}
    </div>
  );
}
