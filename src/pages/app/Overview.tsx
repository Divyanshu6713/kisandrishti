import { motion } from 'framer-motion';
import { ArrowRight, CalendarClock, CheckCircle2, CloudSun, FlaskConical, Layers, Leaf, Sprout } from 'lucide-react';
import { lazy, Suspense } from 'react';
import { Link } from 'react-router';
import type { FarmContext } from '@/services';
import { cn, formatDate, formatShortDate } from '@/lib/utils';
import { useT } from '@/i18n';
import { useAuthStore } from '@/state/authStore';
import { WithFarm } from '@/components/farm/WithFarm';
import { PlanButton } from '@/components/farm/RecommendationCard';
import { RiskMeter, ScoreRing, Progress } from '@/components/ui/gauges';
import { Disclosure, PriorityBadge } from '@/components/ui/primitives';
import { Reveal, rise, stagger } from '@/components/ui/motion';
import { scoreTone } from '@/components/ui/tone';
import { SourceTags } from '@/components/ui/provenance';
import { SceneFallback } from '@/three/SceneFallback';
import { LiveWeatherCard } from '@/features/weather/LiveWeather';
import { TodayOnFarm } from '@/features/overview/TodayOnFarm';
import { KisanSaathi, QuickActions } from '@/features/overview/QuickActions';

const FieldScene = lazy(() => import('@/three/FieldScene'));

/** On desktop the risk outlook sits beside the action list, so it opens by default there. */
const isDesktop = () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches;

const HEALTH_KEY = { soil: 'health.soil', crop: 'health.crop', water: 'health.water' } as const;

function HealthCard({ ctx, className }: { ctx: FarmContext; className?: string }) {
  const t = useT();
  const { health, advice } = ctx;
  const tone = health.score === null ? 'neutral' : scoreTone(health.score);
  const onTrack = advice.status === 'on-track' || advice.status === 'all-clear';
  return (
    <motion.section variants={rise} className={cn('card card-pad flex flex-col gap-6 sm:flex-row sm:items-center', className)}>
      <ScoreRing score={health.score} tone={tone} label={health.label} sub={t('health.sub')} />
      <div className="min-w-0 flex-1">
        <div className={cn('mb-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold', onTrack ? 'bg-accent-soft text-accent' : 'bg-warn-soft text-warn')}>
          {onTrack ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : <span className="h-2 w-2 rounded-full bg-warn" aria-hidden />}
          {advice.status === 'all-clear'
            ? t('health.noIssues')
            : onTrack
              ? t('health.onTrack', { n: advice.openIssues })
              : t('health.needPlan', { a: advice.openIssues - advice.addressed, b: advice.openIssues })}
        </div>
        <ul className="space-y-3">
          {health.components.map((c) => (
            <li key={c.key} className="grid grid-cols-[4.5rem_1fr_2.5rem] items-center gap-3 text-sm">
              <span className="text-ink-2">{c.key in HEALTH_KEY ? t(HEALTH_KEY[c.key as keyof typeof HEALTH_KEY]) : c.label}</span>
              {c.score === null ? <span className="text-label text-ink-3">{t('health.noData')}</span> : <Progress value={c.score} tone={scoreTone(c.score)} />}
              <span className="tabular text-right font-semibold">{c.score ?? '—'}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-label text-ink-3">{t('health.formula')}</p>
      </div>
    </motion.section>
  );
}

function AlertCard({ ctx, className }: { ctx: FarmContext; className?: string }) {
  const t = useT();
  const top = ctx.advice.topAction;
  if (!top)
    return (
      <motion.section variants={rise} className={cn('card card-pad', className)}>
        <p className="eyebrow">{t('alert.eyebrow')}</p>
        <h2 className="mt-2 text-h3">{t('alert.none')}</h2>
        <p className="mt-1 text-ink-2">{t('alert.noneBody')}</p>
      </motion.section>
    );
  return (
    <motion.section variants={rise} className={cn('card card-pad relative overflow-hidden', className)}>
      <span className={cn('absolute inset-y-0 left-0 w-1', top.priority === 'high' ? 'bg-danger' : top.priority === 'medium' ? 'bg-warn' : 'bg-line')} aria-hidden />
      <div className="flex items-center justify-between gap-3">
        <p className="eyebrow">{t('alert.eyebrow')}</p>
        <PriorityBadge level={top.priority} />
      </div>
      <h2 className="mt-3 text-h3">{top.title}</h2>
      <p className="mt-1.5 text-sm text-ink-2">{top.observation}</p>
      <div className="mt-5 rounded-ctl bg-sunken/70 p-4">
        <p className="eyebrow mb-1">{t('alert.today')}</p>
        <p className="text-sm text-ink">{top.action}</p>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <PlanButton farmId={ctx.farm.id} rec={top} />
        <Link to="/app/advisor" className="btn-ghost">
          {t('alert.all')} <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </motion.section>
  );
}

function SummaryStrip({ ctx }: { ctx: FarmContext }) {
  const t = useT();
  const soil = ctx.soilReport;
  const main = soil?.deficiencies[0];
  const today = ctx.weather?.days[0];
  const organicApplied = ctx.history?.inputs.length ?? ctx.observations.filter((o) => o.kind === 'input-applied').length;
  const conventional = ctx.farm.method === 'conventional';
  const cells = [
    { to: '/app/crop', icon: Sprout, label: t('sum.crop'), value: `${ctx.cropHealth.score}`, unit: '/100', hint: `${ctx.cropHealth.statusLabel} · ${ctx.growth.stage?.name ?? '—'}` },
    { to: '/app/soil', icon: Layers, label: t('sum.soil'), value: soil ? `${soil.score}` : '—', unit: soil ? '/100' : '', hint: soil ? (main ? `${main.label} is ${main.band.label.toLowerCase()}` : soil.grade) : t('sum.noSoil') },
    { to: '/app/weather', icon: CloudSun, label: t('sum.weather'), value: today ? `${today.tMin}–${today.tMax}` : '—', unit: today ? '°C' : '', hint: today ? t('sum.humidity', { h: today.humidity }) : t('sum.noForecast') },
    {
      to: '/app/organic',
      icon: Leaf,
      label: t('sum.organic'),
      value: conventional ? 'Conv.' : `${organicApplied}`,
      unit: conventional ? '' : t('sum.inputs'),
      hint: ctx.farm.method === 'organic' ? t('sum.applied') : conventional ? t('sum.conventional') : t('sum.moving'),
    },
  ];
  return (
    <motion.section variants={rise} className="card grid grid-cols-2 divide-line/80 lg:grid-cols-4 lg:divide-x">
      {cells.map(({ to, icon: Icon, label, value, unit, hint }, i) => (
        <Link
          key={to}
          to={to}
          className={cn('group flex flex-col gap-1 p-5 transition-colors hover:bg-sunken/50 sm:p-6', i < 2 && 'border-b border-line/80 lg:border-b-0', i % 2 === 0 && 'border-r border-line/80 lg:border-r-0')}
        >
          <span className="flex items-center justify-between text-label font-medium text-ink-3">
            <span className="inline-flex items-center gap-1.5">
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {label}
            </span>
            <ArrowRight className="h-3.5 w-3.5 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" aria-hidden />
          </span>
          <span className="tabular text-h2 font-semibold">
            {value}
            {unit && <span className="ml-1 text-sm font-medium text-ink-3">{unit}</span>}
          </span>
          <span className="truncate text-sm text-ink-2">{hint}</span>
        </Link>
      ))}
    </motion.section>
  );
}

/** Greeting first, then the farm in one line — the farmer knows whose farm and which day before anything else. */
function Greeting({ ctx }: { ctx: FarmContext }) {
  const t = useT();
  const name = useAuthStore((s) => s.session?.user.displayName) ?? '';
  const { farm, growth } = ctx;
  return (
    <header className="mb-8 flex flex-col gap-2 sm:mb-10">
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-label text-ink-3">
        <span className="inline-flex items-center gap-1.5">
          <CalendarClock className="h-3.5 w-3.5" aria-hidden />
          {farm.isDemo ? t('note.demoAsOf', { date: formatDate(ctx.asOf) }) : t('note.asOf', { date: formatDate(ctx.asOf) })}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <FlaskConical className="h-3.5 w-3.5" aria-hidden />
          {farm.isDemo ? t('note.sample') : t('note.yours')}
        </span>
      </p>
      <h1 className="mt-4 text-h1">{t('home.greeting', { name })}</h1>
      <p className="text-lead text-ink-2">
        <span className="font-semibold text-ink">{farm.name}</span> · {ctx.crop.name} · {farm.variety} · {farm.areaAcres} acres ·{' '}
        {growth.stage ? t('home.dayLine', { stage: growth.stage.name, day: growth.daysAfterSowing }) : growth.label}
      </p>
    </header>
  );
}

function OverviewBody({ ctx }: { ctx: FarmContext }) {
  const t = useT();
  const status = ctx.advice.status === 'needs-attention' ? 'attention' : ctx.advice.status === 'on-track' ? 'planned' : 'clear';
  const disease = ctx.risks.find((r) => r.kind === 'disease');
  const nextScout = ctx.weather?.days.find((d) => d.rainMm === 0 && d.date > ctx.asOf);
  const patchArea = ctx.observations.find((o) => o.area && o.severity !== 'low')?.area;
  const patchNote = patchArea ? t('field.fromNotes', { area: patchArea.toLowerCase() }) : null;
  return (
    <>
      <Greeting ctx={ctx} />

      {status === 'planned' && (
        <Reveal className="mb-6">
          <div className="flex items-start gap-3 rounded-card border border-accent/25 bg-accent-soft/60 p-5">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden />
            <div>
              <p className="font-semibold text-ink">{t('home.plannedTitle')}</p>
              <p className="text-sm text-ink-2">
                {t('home.plannedBody')}
                {nextScout ? ` ${t('home.nextCheck', { date: formatShortDate(nextScout.date) })}` : ''}
              </p>
            </div>
          </div>
        </Reveal>
      )}

      <motion.div variants={stagger} initial="hidden" animate="show" className="grid gap-5 lg:grid-cols-12">
        {/* Two columns on desktop; on smaller screens the columns dissolve and `order` sets one reading sequence:
            status → most important → field → today → quick actions → weather → risk → saathi → summary. */}
        <div className="contents lg:col-span-7 lg:flex lg:flex-col lg:gap-5">
          <HealthCard ctx={ctx} className="order-1 lg:order-none" />
          <motion.section variants={rise} className="card relative order-3 overflow-hidden lg:order-none">
            <div className="relative h-[260px] sm:h-[300px]">
              <Suspense fallback={<SceneFallback compact />}>
                <FieldScene
                  className="absolute inset-0"
                  status={status}
                  riskLabel={disease?.subject ? `${t('field.scout')} · ${disease.subject.toLowerCase()}` : t('field.scout')}
                  recLabel={t('field.planned')}
                />
              </Suspense>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line/70 px-5 py-3 text-label text-ink-3">
              <span>{t('field.caption', { where: patchNote ?? t('field.captionDefault') })}</span>
              <Link to="/app/crop" className="font-semibold text-accent hover:underline">
                {t('field.details')}
              </Link>
            </div>
          </motion.section>
          <TodayOnFarm ctx={ctx} className="order-4 lg:order-none lg:flex-1" />
          <QuickActions ctx={ctx} className="order-5 lg:order-none" />
        </div>
        <div className="contents lg:col-span-5 lg:flex lg:flex-col lg:gap-5">
          <AlertCard ctx={ctx} className="order-2 lg:order-none" />
          <div className="order-6 lg:order-none" lang="en">
            <LiveWeatherCard />
          </div>
          <motion.section variants={rise} className="card card-pad order-7 lg:order-none lg:flex-1">
            <Disclosure
              defaultOpen={isDesktop()}
              summary={
                <span className="flex flex-col">
                  <span className="text-ink">{t('risk.title')}</span>
                  <span className="text-label font-normal text-ink-3">{t('risk.sub')}</span>
                </span>
              }
            >
              <div className="grid grid-cols-2 gap-4 pt-2">
                {ctx.risks.map((r) => (
                  <div key={r.kind} className="flex flex-col items-center rounded-ctl bg-sunken/50 pb-3 pt-4">
                    <RiskMeter score={r.score} level={r.level} size={120} insufficient={r.status === 'insufficient'} />
                    <span className="mt-1 text-sm font-medium">{r.title}</span>
                  </div>
                ))}
              </div>
              <Link to="/app/risk" className="btn-ghost mt-3 w-full">
                {t('risk.open')} <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </Disclosure>
          </motion.section>
          <KisanSaathi className="order-8 lg:order-none" />
        </div>
        <div className="order-9 lg:order-none lg:col-span-12">
          <SummaryStrip ctx={ctx} />
        </div>
      </motion.div>

      <div className="mt-8">
        <SourceTags sources={['demo-dataset', 'reference-ranges', 'sample-forecast', 'demo-rules']} />
      </div>
    </>
  );
}

export default function Overview() {
  return <WithFarm>{(ctx) => <OverviewBody ctx={ctx} />}</WithFarm>;
}
