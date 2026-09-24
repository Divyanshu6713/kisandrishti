import { motion } from 'framer-motion';
import { ArrowRight, ArrowUpRight, BookOpen, CalendarClock, CheckCircle2, CloudSun, FlaskConical, Info, Ruler, RotateCcw, Scissors, Sprout, Sun, Salad } from 'lucide-react';
import type { FocusEvent, ReactNode } from 'react';
import { Link } from 'react-router';
import type { GardenAdviser, GardenTask, PlantStatus } from '@/models';
import { cn, formatShortDate } from '@/lib/utils';
import type { GardenContext } from '@/hooks/useGarden';
import { gardenService, STAGE_LABEL } from '@/services/gardenService';
import { useGardenFocus, useGardenStore } from '@/state/gardenStore';
import { toast } from '@/state/toastStore';
import { rise } from '@/components/ui/motion';

/* ── shared ─────────────────────────────────────────────────────────────── */

export const ADVISER_META: Record<GardenAdviser, { icon: typeof Sun; to: string; label: string }> = {
  sunlight: { icon: Sun, to: '/app/garden/sunlight', label: 'Sunlight Adviser' },
  nutrients: { icon: Sprout, to: '/app/garden/nutrients', label: 'Nutrient Adviser' },
  quantity: { icon: Ruler, to: '/app/garden/quantity', label: 'Quantity Analyser' },
  harvest: { icon: Scissors, to: '/app/garden/setup', label: 'Plants & dates' },
  weather: { icon: CloudSun, to: '/app/weather', label: 'Weather' },
};

const PRIORITY: Record<GardenTask['priority'], { label: string; cls: string }> = {
  today: { label: 'Today', cls: 'bg-warn-soft text-warn' },
  soon: { label: 'This week', cls: 'bg-info-soft text-info' },
  monitor: { label: 'Keep an eye', cls: 'bg-sunken text-ink-2' },
};

/** One quiet line that keeps the rooftop honest: demo or yours, and what drives the advice. */
export function GardenScenarioNote({ g }: { g: GardenContext }) {
  return (
    <p className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-1 text-label text-ink-3">
      <span className="inline-flex items-center gap-1.5">
        <CalendarClock className="h-3.5 w-3.5" aria-hidden />
        {g.garden.isDemo ? 'Demo rooftop · sample plants, planting dates set relative to today' : `Your garden · as of ${formatShortDate(g.asOf)}`}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <FlaskConical className="h-3.5 w-3.5" aria-hidden />
        Rule-based guidance · growing guide{g.weatherPlace ? ` · live weather (${g.weatherPlace})` : ''}
      </span>
    </p>
  );
}

/** Where rooftop guidance comes from — the cited sources, with links. */
export function GardenSources({ ids, className }: { ids?: string[]; className?: string }) {
  const list = ids ? gardenService.sources().filter((s) => ids.includes(s.id)) : gardenService.sources();
  return (
    <section className={cn('rounded-card border border-line/80 bg-sunken/40 p-5', className)} aria-labelledby="garden-sources">
      <h2 id="garden-sources" className="flex items-center gap-2 text-sm font-semibold text-ink">
        <BookOpen className="h-4 w-4 text-ink-3" aria-hidden /> Growing guide sources
      </h2>
      <ul className="mt-3 space-y-1.5 text-sm">
        {list.map((s) => (
          <li key={s.id}>
            <a href={s.url} target="_blank" rel="noopener noreferrer" className="group inline-flex items-start gap-1 text-ink-2 hover:text-ink">
              <span>
                <span className="font-medium">{s.title}</span> — {s.publisher}
              </span>
              <ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-3 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-label text-ink-3">{gardenService.datasetNote}</p>
    </section>
  );
}

/* ── Today's garden ─────────────────────────────────────────────────────── */

function TaskRow({ task, gardenId, asOf }: { task: GardenTask; gardenId: string; asOf: string }) {
  const key = `${gardenId}:${task.id}:${asOf}`;
  const done = useGardenStore((s) => Boolean(s.done[key]));
  const setDone = useGardenStore((s) => s.setDone);
  const focus = useGardenFocus((s) => s.focus);
  const clear = useGardenFocus((s) => s.clear);
  const meta = ADVISER_META[task.adviser];
  const Icon = done ? CheckCircle2 : meta.icon;
  const pr = PRIORITY[task.priority];
  const pointer = task.entryId
    ? {
        onMouseEnter: () => focus(task.entryId!),
        onMouseLeave: clear,
        onFocus: () => focus(task.entryId!),
        onBlur: (e: FocusEvent<HTMLLIElement>) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) clear();
        },
      }
    : {};
  return (
    <li {...pointer} className="flex gap-3.5 px-5 py-3.5 transition-colors duration-200 hover:bg-sunken/45 focus-within:bg-sunken/45 sm:px-6">
      <span className={cn('mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl', done ? 'bg-accent-soft text-accent' : task.adviser === 'harvest' ? 'bg-clay-soft text-clay' : 'bg-sunken text-ink-2')}>
        <Icon className="h-[18px] w-[18px]" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <h3 className={cn('font-semibold', done ? 'text-ink-3 line-through decoration-line' : 'text-ink')}>{task.title}</h3>
          <span className={cn('chip', done ? 'bg-accent-soft text-accent' : pr.cls)}>{done ? 'Done' : pr.label}</span>
        </div>
        {!done && <p className="mt-0.5 text-sm text-ink-2 text-pretty">{task.why}</p>}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="text-label text-ink-3">
            <span className="sr-only">Based on: </span>
            {task.signals.join(' · ')}
          </p>
          <div className="ml-auto flex items-center gap-1.5">
            <Link to={meta.to} className="group/link inline-flex items-center gap-1 whitespace-nowrap rounded-ctl px-2 py-1.5 text-label font-semibold text-accent hover:bg-accent-soft/60">
              {meta.label}
              <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover/link:translate-x-0.5" aria-hidden />
            </Link>
            <button
              type="button"
              className="btn-ghost px-2.5 py-1.5 text-label"
              aria-pressed={done}
              onClick={() => {
                setDone(key, !done);
                if (!done) toast('Marked as done', task.title);
              }}
            >
              {done ? <RotateCcw className="h-3.5 w-3.5" aria-hidden /> : <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />}
              {done ? 'Undo' : 'Done'}
            </button>
          </div>
        </div>
      </div>
    </li>
  );
}

export function TodaysGarden({ g, className }: { g: GardenContext; className?: string }) {
  const open = g.tasks.filter((t) => t.priority !== 'monitor').length;
  return (
    <motion.section variants={rise} aria-labelledby="garden-today" className={cn('card flex flex-col overflow-hidden', className)}>
      <header className="px-5 pb-2 pt-5 sm:px-6 sm:pt-6">
        <h2 id="garden-today" className="eyebrow">
          Today&apos;s garden
        </h2>
        <p className="mt-1.5 text-sm text-ink-2 text-pretty">
          {g.garden.plants.length === 0
            ? 'Add your first plant to start receiving garden guidance.'
            : open
              ? `${open} thing${open === 1 ? '' : 's'} to do, then routine checks.`
              : 'Nothing urgent on the roof today — just the routine checks.'}
        </p>
      </header>
      <ul className="divide-y divide-line/60 pb-1.5">
        {g.tasks.map((t) => (
          <TaskRow key={t.id} task={t} gardenId={g.garden.id} asOf={g.asOf} />
        ))}
      </ul>
      <footer className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-line/70 px-5 py-3 text-label text-ink-3">
        <span className="inline-flex items-center gap-1.5">
          <FlaskConical className="h-3.5 w-3.5" aria-hidden />
          Rule-based · {g.weatherPlace ? `live weather for ${g.weatherPlace}` : 'weather rules run once live weather loads'}
        </span>
        <span>Done marks reset each day</span>
      </footer>
    </motion.section>
  );
}

/* ── Advisers ───────────────────────────────────────────────────────────── */

function AdviserCard({ kind, eyebrow, value, text, cta }: { kind: 'sunlight' | 'nutrients' | 'quantity'; eyebrow: string; value: string; text: string; cta: string }) {
  const meta = ADVISER_META[kind];
  const Icon = meta.icon;
  return (
    <motion.div variants={rise}>
      <Link to={meta.to} className="card group flex h-full flex-col p-5 transition-[transform,box-shadow,border-color] duration-300 ease-calm hover:-translate-y-0.5 hover:border-accent/30 hover:shadow-lift">
        <span className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-sunken text-ink-2 transition-colors group-hover:bg-accent-soft group-hover:text-accent">
            <Icon className="h-4 w-4" aria-hidden />
          </span>
          <span className="eyebrow">{eyebrow}</span>
        </span>
        <span className="mt-4 block text-h3 font-semibold leading-snug text-ink">{value}</span>
        <span className="mt-1 block text-sm text-ink-2 text-pretty">{text}</span>
        <span className="mt-auto inline-flex items-center gap-1 pt-4 text-sm font-semibold text-accent">
          {cta}
          <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" aria-hidden />
        </span>
      </Link>
    </motion.div>
  );
}

export function AdviserCards({ g }: { g: GardenContext }) {
  const poor = g.statuses.filter((s) => s.sunFit === 'poor').map((s) => s.plant.name.toLowerCase());
  const sunText = !g.statuses.length ? 'Add plants to check them against your sun.' : poor.length ? `Short for ${poor.join(' and ')}; fine for the rest.` : 'Enough for everything you grow.';
  const active = g.statuses.find((s) => s.stage === 'flowering' || s.stage === 'fruit') ?? g.statuses.find((s) => s.stage && s.stage !== 'finished');
  const nutValue = active?.stage ? `${active.plant.name}: ${STAGE_LABEL[active.stage as keyof typeof STAGE_LABEL].toLowerCase()}` : 'No dated plantings';
  const nutText = active?.stage && active.stage !== 'finished' ? (active.plant.nutrients[active.stage]?.focus.split('. ')[0] ?? '') + '.' : 'Add planting dates for stage-by-stage notes.';
  const { used, available, free, roomFor } = g.space;
  // Suggest the plant that needs a pot (the harder one to fit) rather than "98 sq ft of spinach".
  const best = roomFor.filter((r) => r.more > 0).sort((a, b) => (a.plant.unit === b.plant.unit ? b.more - a.more : a.plant.unit === 'pot' ? -1 : 1))[0];
  const qText = used > available ? `About ${Math.round((used - available) * 10) / 10} sq ft more than you entered.` : best ? `Room for about ${best.more} more ${best.plant.unit === 'pot' ? `${best.plant.name.toLowerCase()} pots` : `sq ft of ${best.plant.name.toLowerCase()}`}.` : `${free} sq ft free.`;
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <AdviserCard kind="sunlight" eyebrow="Sunlight" value={`${g.garden.sunHours} h of direct sun`} text={sunText} cta="View analysis" />
      <AdviserCard kind="nutrients" eyebrow="Nutrients" value={nutValue} text={nutText} cta="What to monitor" />
      <AdviserCard kind="quantity" eyebrow="Quantity" value={`${used} of ${available} sq ft`} text={qText} cta="Plan your garden" />
    </div>
  );
}

/* ── From roof to plate ─────────────────────────────────────────────────── */

export function StageTrack({ s }: { s: PlantStatus }) {
  const labels = s.path.map((id) => STAGE_LABEL[id]);
  return (
    <ol className="flex min-w-0 flex-1 items-center" aria-label={`${s.plant.name} stages`}>
      {labels.map((label, i) => {
        const reached = s.step !== null && i <= s.step;
        const current = s.step === i && s.stage !== 'finished';
        const last = i === labels.length - 1;
        return (
          <li key={label} className={cn('flex items-center', !last && 'flex-1')} aria-current={current ? 'step' : undefined}>
            <span className="flex flex-col items-center gap-1.5">
              <span
                className={cn(
                  'grid h-6 w-6 place-items-center rounded-full border-2 transition-colors',
                  current ? (last ? 'border-clay bg-clay text-accent-ink' : 'border-accent bg-accent text-accent-ink ring-4 ring-accent/15') : reached ? 'border-accent/60 bg-accent-soft text-accent' : 'border-line bg-surface text-ink-3',
                )}
              >
                {last ? <Salad className="h-3.5 w-3.5" aria-hidden /> : <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}
              </span>
              <span className={cn('hidden whitespace-nowrap text-[0.6875rem] font-semibold sm:block', current ? 'text-ink' : 'text-ink-3')}>
                {label}
                {current && <span className="sr-only"> (now)</span>}
              </span>
            </span>
            {!last && <span className={cn('mx-1 mb-0 h-0.5 flex-1 rounded-full sm:mb-5', s.step !== null && i < s.step ? 'bg-accent/50' : 'bg-line')} aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}

export function RoofToPlate({ g }: { g: GardenContext }) {
  const focus = useGardenFocus((s) => s.focus);
  const clear = useGardenFocus((s) => s.clear);
  return (
    <motion.section variants={rise} className="card overflow-hidden" aria-labelledby="roof-to-plate">
      <header className="flex flex-wrap items-end justify-between gap-3 px-5 pt-5 sm:px-6 sm:pt-6">
        <div>
          <h2 id="roof-to-plate" className="eyebrow">
            From roof to plate
          </h2>
          <p className="mt-1.5 text-sm text-ink-2">From pot to kitchen. Stage days are approximate — they vary with variety and season.</p>
        </div>
        <Link to="/app/garden/setup" className="btn-ghost px-2.5 py-1.5 text-label">
          Edit plants & dates <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </header>
      {g.statuses.length === 0 ? (
        <div className="m-5 rounded-ctl bg-sunken/60 p-4 text-sm text-ink-2 sm:m-6">Add your first plant to follow it from roof to plate.</div>
      ) : (
        <ul className="mt-3 divide-y divide-line/60">
          {g.statuses.map((s) => (
            <li
              key={s.entry.id}
              tabIndex={0}
              onMouseEnter={() => focus(s.entry.id)}
              onMouseLeave={clear}
              onFocus={() => focus(s.entry.id)}
              onBlur={clear}
              className="flex flex-col gap-2.5 px-5 py-3.5 transition-colors hover:bg-sunken/40 focus-visible:bg-sunken/40 sm:px-6"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="font-semibold text-ink">
                  {s.plant.name} <span className="font-normal text-ink-3">· {s.plant.localName} · {gardenService.unitLabel(s.plant, s.entry.count)}</span>
                </p>
              <p className="text-sm text-ink-2">
                {s.days === null ? (
                  <span className="text-ink-3">Add a planting date</span>
                ) : s.stage === 'finished' ? (
                  'Past the usual harvest window'
                ) : s.stage === 'harvest' ? (
                  <>
                    <span className="font-semibold text-clay">Ready to pick</span> · day {s.days}
                  </>
                ) : (
                  <>
                    Day {s.days} · {s.stage ? STAGE_LABEL[s.stage].toLowerCase() : ''} · harvest from <span className="font-semibold text-ink">{s.harvestFrom ? formatShortDate(s.harvestFrom) : '—'}</span>
                  </>
                )}
              </p>
              </div>
              <StageTrack s={s} />
            </li>
          ))}
        </ul>
      )}
    </motion.section>
  );
}

/* ── Garden notes ───────────────────────────────────────────────────────── */

export function GardenNotes({ g }: { g: GardenContext }) {
  if (!g.insights.length) return null;
  return (
    <section aria-labelledby="garden-notes">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h2 id="garden-notes" className="text-h3">
            Garden notes
          </h2>
          <p className="text-sm text-ink-3">Short, sourced facts about what you grow.</p>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {g.insights.map((i) => {
          const src = gardenService.source(i.source);
          return (
            <motion.article variants={rise} key={i.id} className="flex flex-col rounded-card border border-line/80 bg-surface/70 p-5">
              <p className="eyebrow text-clay">Did you know?</p>
              <h3 className="mt-2 font-semibold leading-snug text-ink">{i.title}</h3>
              <p className="mt-1.5 text-sm text-ink-2 text-pretty">{i.body}</p>
              {src && (
                <a href={src.url} target="_blank" rel="noopener noreferrer" className="group mt-auto inline-flex items-center gap-1 pt-4 text-label font-semibold text-accent">
                  Source: {src.publisher}
                  <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              )}
            </motion.article>
          );
        })}
      </div>
    </section>
  );
}

/** Honest callout used on the adviser pages. */
export function GuideNote({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-card border border-line bg-sunken/50 p-4 text-sm text-ink-2">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" aria-hidden />
      <div>{children}</div>
    </div>
  );
}
