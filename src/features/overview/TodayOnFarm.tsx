import { motion } from 'framer-motion';
import { ArrowRight, CheckCircle2, FlaskConical, MapPin, RotateCcw } from 'lucide-react';
import type { FocusEvent } from 'react';
import { Link } from 'react-router';
import type { ActionModule, FarmAction, RecHorizon } from '@/models';
import type { FarmContext } from '@/services';
import { cn } from '@/lib/utils';
import { useT, type MessageKey } from '@/i18n';
import { useFieldFocus } from '@/state/fieldFocusStore';
import { NAV_PRIMARY, NAV_TOOLS } from '@/components/layout/nav';
import { CATEGORY_ICON, PlanButton, usePlanned } from '@/components/farm/RecommendationCard';
import { PriorityBadge } from '@/components/ui/primitives';
import { rise } from '@/components/ui/motion';

/**
 * Today on your farm — the dashboard's action layer. It lists what the Farm Advisor found,
 * grouped by when it applies, with where each item came from and where to go next.
 * The single most important item stays in the card beside it, so it is not repeated here.
 */

const HORIZONS: RecHorizon[] = ['now', 'this-week', 'next-season'];

const MODULE_PATH: Record<ActionModule, string> = {
  soil: '/app/soil',
  crop: '/app/crop',
  weather: '/app/weather',
  organic: '/app/organic',
  disease: '/app/disease',
  risk: '/app/risk',
  advisor: '/app/advisor',
};
const NAV = [...NAV_PRIMARY, ...NAV_TOOLS];
const moduleLink = (m: ActionModule) => {
  const item = NAV.find((n) => n.to === MODULE_PATH[m]);
  return { to: MODULE_PATH[m], key: item?.key };
};

/** Signals come from a fixed vocabulary in farmActionService; unknown ones fall back to English. */
const signalKey = (s: string) => `signal.${s}` as MessageKey;

function ActionRow({ action, farmId }: { action: FarmAction; farmId: string }) {
  const t = useT();
  const { rec } = action;
  const { setDone } = usePlanned(farmId, rec.id);
  const focus = useFieldFocus((s) => s.focus);
  const clear = useFieldFocus((s) => s.clear);
  const Icon = action.plan === 'done' ? CheckCircle2 : CATEGORY_ICON[rec.category];
  const link = moduleLink(action.module);
  const done = action.plan === 'done';
  const place = action.area ?? (action.fieldTarget ? t('today.onField') : null);
  const signalText = (s: string) => {
    const tr = t(signalKey(s));
    return tr === signalKey(s) ? s : tr;
  };

  // Pointing at a field-specific action highlights its spot on the field view (mouse or keyboard).
  const target = action.fieldTarget;
  const pointer = target
    ? {
        onMouseEnter: () => focus(target),
        onMouseLeave: clear,
        onFocus: () => focus(target),
        onBlur: (e: FocusEvent<HTMLLIElement>) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) clear();
        },
      }
    : {};

  return (
    <li {...pointer} className="group/row flex gap-4 px-5 py-3.5 transition-colors duration-200 hover:bg-sunken/45 focus-within:bg-sunken/45 sm:px-6">
      <span className={cn('mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl', done ? 'bg-accent-soft text-accent' : 'bg-sunken text-ink-2')}>
        <Icon className="h-[18px] w-[18px]" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <h4 className={cn('font-semibold', done ? 'text-ink-3 line-through decoration-line' : 'text-ink')}>{rec.title}</h4>
          {done ? (
            <span className="chip bg-accent-soft text-accent">{t('today.done')}</span>
          ) : (
            rec.priority !== 'low' && <PriorityBadge level={rec.priority} />
          )}
        </div>
        {!done && action.horizon !== 'next-season' && <p className="mt-0.5 line-clamp-2 text-sm text-ink-2 text-pretty">{rec.observation}</p>}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="flex min-w-0 flex-wrap items-center gap-x-2 text-label text-ink-3">
            {action.signals.length > 0 && (
              <span>
                <span className="sr-only">{t('today.basedOn')} </span>
                {action.signals.map(signalText).join(' · ')}
              </span>
            )}
            {place && (
              <span className="inline-flex items-center gap-1 font-medium text-ink-2">
                <MapPin className="h-3 w-3" aria-hidden />
                {place}
              </span>
            )}
          </p>
          <div className="ml-auto flex items-center gap-1.5">
            <Link to={link.to} className="group/link inline-flex items-center gap-1 whitespace-nowrap rounded-ctl px-2 py-1.5 text-label font-semibold text-accent hover:bg-accent-soft/60">
              {link.key ? t(link.key) : 'Details'}
              <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover/link:translate-x-0.5" aria-hidden />
            </Link>
            {done ? (
              <button type="button" className="btn-ghost px-2.5 py-1.5 text-label" onClick={() => setDone(rec.title, false)}>
                <RotateCcw className="h-3.5 w-3.5" aria-hidden /> {t('today.undo')}
              </button>
            ) : (
              <>
                {action.plan === 'planned' && (
                  <button type="button" className="btn-ghost px-2.5 py-1.5 text-label" onClick={() => setDone(rec.title, true)}>
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> {t('today.markDone')}
                  </button>
                )}
                <PlanButton farmId={farmId} rec={rec} compact />
              </>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

export function TodayOnFarm({ ctx, className }: { ctx: FarmContext; className?: string }) {
  const t = useT();
  const topId = ctx.advice.topAction?.id;
  const actions = ctx.actions.filter((a) => a.id !== topId);
  const groups = HORIZONS.map((key) => ({ key, items: actions.filter((a) => a.horizon === key) })).filter((g) => g.items.length);

  return (
    <motion.section variants={rise} aria-labelledby="today-title" className={cn('card flex flex-col overflow-hidden', className)}>
      <header className="px-5 pb-2 pt-5 sm:px-6 sm:pt-6">
        <h2 id="today-title" className="eyebrow">
          {t('today.title')}
        </h2>
        <p className="mt-1.5 text-sm text-ink-2 text-pretty">
          {actions.length ? t('today.more', { n: actions.length }) : topId ? t('today.onlyTop') : t('today.stable')}
        </p>
      </header>

      {groups.length ? (
        <div className="flex flex-col gap-1 pb-1.5">
          {groups.map((g) => (
            <section key={g.key} aria-labelledby={`today-${g.key}`}>
              <h3 id={`today-${g.key}`} className="flex items-center gap-2 px-5 pt-2.5 text-label font-semibold text-ink-3 sm:px-6">
                {t(`today.h.${g.key}` as MessageKey)}
                <span className="h-px flex-1 bg-line/70" aria-hidden />
              </h3>
              <ul className="divide-y divide-line/60">
                {g.items.map((a) => (
                  <ActionRow key={a.id} action={a} farmId={ctx.farm.id} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <div className="mx-5 mb-5 flex items-start gap-3 rounded-ctl bg-sunken/60 p-4 sm:mx-6">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
          <p className="text-sm text-ink-2">{t('today.empty')}</p>
        </div>
      )}

      <footer className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-line/70 px-5 py-3 text-label text-ink-3">
        <span className="inline-flex items-center gap-1.5">
          <FlaskConical className="h-3.5 w-3.5" aria-hidden />
          {t('today.footer', { scope: ctx.farm.isDemo ? t('today.scopeDemo') : t('today.scopeYours') })}
        </span>
        <Link to="/app/advisor" className="font-semibold text-accent hover:underline">
          {t('today.why')}
        </Link>
      </footer>
    </motion.section>
  );
}
