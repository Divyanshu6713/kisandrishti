import { motion } from 'framer-motion';
import { ArrowRight, Camera, CloudSun, ListChecks, Mic, Sprout } from 'lucide-react';
import { Link } from 'react-router';
import type { FarmContext } from '@/services';
import { cn } from '@/lib/utils';
import { useT } from '@/i18n';
import { useUiStore } from '@/state/uiStore';
import { rise } from '@/components/ui/motion';

/**
 * Field quick actions — four large, labelled tiles for the things a farmer opens most.
 * Icon + word together (never icon alone), generous tap targets, labels allowed to wrap.
 */
export function QuickActions({ ctx, className }: { ctx: FarmContext; className?: string }) {
  const t = useT();
  const planned = ctx.plan.filter((p) => p.status === 'planned').length;
  const done = ctx.plan.filter((p) => p.status === 'done').length;
  const tiles = [
    { to: '/app/disease', icon: Camera, label: t('quick.scan'), hint: t('quick.scanHint') },
    { to: '/app/weather', icon: CloudSun, label: t('quick.weather'), hint: t('quick.weatherHint') },
    { to: '/app/crop', icon: Sprout, label: t('quick.crop'), hint: ctx.growth.stage ? t('home.dayLine', { stage: ctx.growth.stage.name, day: ctx.growth.daysAfterSowing }) : ctx.growth.label },
    { to: '/app/advisor', icon: ListChecks, label: t('quick.plan'), hint: planned || done ? t('quick.planHint', { p: planned, d: done }) : t('quick.planEmpty') },
  ];
  return (
    <motion.section variants={rise} aria-labelledby="quick-title" className={className}>
      <h2 id="quick-title" className="sr-only">
        {t('quick.title')}
      </h2>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:gap-4">
        {tiles.map(({ to, icon: Icon, label, hint }) => (
          <li key={to}>
            <Link to={to} className="tile group h-full">
              <span className="flex items-start justify-between">
                <span className="tile-icon">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <ArrowRight className="h-4 w-4 -translate-x-1 text-accent opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden />
              </span>
              <span>
                <span className="block text-base font-semibold leading-snug text-ink">{label}</span>
                <span className="mt-0.5 block text-label text-ink-3">{hint}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </motion.section>
  );
}

/** Kisan Saathi — the planned voice assistant. Shown as an intentional "coming soon", with today's typed alternative. */
export function KisanSaathi({ className }: { className?: string }) {
  const t = useT();
  const openAssistant = useUiStore((s) => s.openAssistant);
  return (
    <motion.section variants={rise} aria-labelledby="saathi-title" className={cn('card card-pad flex items-start gap-4', className)}>
      <span className="relative grid h-12 w-12 shrink-0 place-items-center" aria-hidden>
        <span className="absolute inset-0 rounded-full bg-accent-soft" />
        <span className="absolute inset-[-5px] rounded-full border border-accent/20" />
        <span className="absolute inset-[-10px] rounded-full border border-accent/10" />
        <Mic className="relative h-5 w-5 text-accent" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="saathi-title" className="text-h3">
            {t('saathi.title')}
          </h2>
          <span className="chip bg-clay-soft text-clay">{t('common.comingSoon')}</span>
        </div>
        <p className="text-sm font-medium text-ink-2">{t('saathi.sub')}</p>
        <p className="mt-1 text-sm text-ink-3">{t('saathi.body')}</p>
        <button type="button" className="mt-2 -ml-2 inline-flex items-center gap-1 rounded-ctl px-2 py-1.5 text-sm font-semibold text-accent hover:bg-accent-soft/60" onClick={() => openAssistant()}>
          {t('saathi.now')} <ArrowRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </motion.section>
  );
}
