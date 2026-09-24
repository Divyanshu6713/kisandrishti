import { motion } from 'framer-motion';
import { ArrowRight, CheckCircle2, CloudSun, Layers, Leaf, Sprout } from 'lucide-react';
import { lazy, Suspense } from 'react';
import { Link } from 'react-router';
import type { FarmContext } from '@/services';
import { cn, formatShortDate } from '@/lib/utils';
import { WithFarm, ScenarioNote } from '@/components/farm/WithFarm';
import { PlanButton } from '@/components/farm/RecommendationCard';
import { RiskMeter, ScoreRing, Progress } from '@/components/ui/gauges';
import { Disclosure, PriorityBadge } from '@/components/ui/primitives';
import { Reveal, rise, stagger } from '@/components/ui/motion';
import { scoreTone } from '@/components/ui/tone';
import { SourceTags } from '@/components/ui/provenance';
import { SceneFallback } from '@/three/SceneFallback';
import { LiveWeatherCard } from '@/features/weather/LiveWeather';

const FieldScene = lazy(() => import('@/three/FieldScene'));

function HealthCard({ ctx }: { ctx: FarmContext }) {
  const { health, advice } = ctx;
  const tone = health.score === null ? 'neutral' : scoreTone(health.score);
  const onTrack = advice.status === 'on-track' || advice.status === 'all-clear';
  return (
    <motion.section variants={rise} className="card card-pad flex flex-col gap-6 sm:flex-row sm:items-center">
      <ScoreRing score={health.score} tone={tone} label={health.label} sub="Farm health" />
      <div className="min-w-0 flex-1">
        <div className={cn('mb-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold', onTrack ? 'bg-accent-soft text-accent' : 'bg-warn-soft text-warn')}>
          {onTrack ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : <span className="h-2 w-2 rounded-full bg-warn" aria-hidden />}
          {advice.status === 'all-clear'
            ? 'No open issues'
            : onTrack
              ? `On track — plan in place for all ${advice.openIssues} open issues`
              : `${advice.openIssues - advice.addressed} of ${advice.openIssues} open issues need a plan`}
        </div>
        <ul className="space-y-3">
          {health.components.map((c) => (
            <li key={c.key} className="grid grid-cols-[4.5rem_1fr_2.5rem] items-center gap-3 text-sm">
              <span className="text-ink-2">{c.label}</span>
              {c.score === null ? <span className="text-label text-ink-3">No data</span> : <Progress value={c.score} tone={scoreTone(c.score)} />}
              <span className="tabular text-right font-semibold">{c.score ?? '—'}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-label text-ink-3">Health = soil 35% · crop 45% · water 20%. Weather risk is shown separately as an outlook.</p>
      </div>
    </motion.section>
  );
}

function AlertCard({ ctx }: { ctx: FarmContext }) {
  const top = ctx.advice.topAction;
  if (!top)
    return (
      <motion.section variants={rise} className="card card-pad">
        <p className="eyebrow">Most important</p>
        <h2 className="mt-2 text-h3">Nothing urgent</h2>
        <p className="mt-1 text-ink-2">No soil, crop or weather signal needs action today.</p>
      </motion.section>
    );
  return (
    <motion.section variants={rise} className="card card-pad relative overflow-hidden">
      <span className={cn('absolute inset-y-0 left-0 w-1', top.priority === 'high' ? 'bg-danger' : top.priority === 'medium' ? 'bg-warn' : 'bg-line')} aria-hidden />
      <div className="flex items-center justify-between gap-3">
        <p className="eyebrow">Most important</p>
        <PriorityBadge level={top.priority} />
      </div>
      <h2 className="mt-3 text-h3">{top.title}</h2>
      <p className="mt-1.5 text-sm text-ink-2">{top.observation}</p>
      <div className="mt-5 rounded-ctl bg-sunken/70 p-4">
        <p className="eyebrow mb-1">Today</p>
        <p className="text-sm text-ink">{top.action}</p>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <PlanButton farmId={ctx.farm.id} rec={top} />
        <Link to="/app/advisor" className="btn-ghost">
          All advice <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </motion.section>
  );
}

function SummaryStrip({ ctx }: { ctx: FarmContext }) {
  const soil = ctx.soilReport;
  const main = soil?.deficiencies[0];
  const today = ctx.weather?.days[0];
  const organicApplied = ctx.history?.inputs.length ?? ctx.observations.filter((o) => o.kind === 'input-applied').length;
  const cells = [
    {
      to: '/app/crop',
      icon: Sprout,
      label: 'Crop',
      value: `${ctx.cropHealth.score}`,
      unit: '/100',
      hint: `${ctx.cropHealth.statusLabel} · ${ctx.growth.stage?.name ?? '—'}`,
    },
    {
      to: '/app/soil',
      icon: Layers,
      label: 'Soil',
      value: soil ? `${soil.score}` : '—',
      unit: soil ? '/100' : '',
      hint: soil ? (main ? `${main.label} is ${main.band.label.toLowerCase()}` : soil.grade) : 'No soil test yet',
    },
    {
      to: '/app/weather',
      icon: CloudSun,
      label: 'Scenario weather',
      value: today ? `${today.tMin}–${today.tMax}` : '—',
      unit: today ? '°C' : '',
      hint: today ? `${today.humidity}% humidity · demo scenario sample` : 'No forecast',
    },
    {
      to: '/app/organic',
      icon: Leaf,
      label: 'Organic',
      value: ctx.farm.method === 'conventional' ? 'Conv.' : `${organicApplied}`,
      unit: ctx.farm.method === 'conventional' ? '' : 'inputs',
      hint: ctx.farm.method === 'organic' ? 'Applied this season' : ctx.farm.method === 'conventional' ? 'Conventional farm' : 'Moving to organic',
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

function OverviewBody({ ctx }: { ctx: FarmContext }) {
  const status = ctx.advice.status === 'needs-attention' ? 'attention' : ctx.advice.status === 'on-track' ? 'planned' : 'clear';
  const disease = ctx.risks.find((r) => r.kind === 'disease');
  const nextScout = ctx.weather?.days.find((d) => d.rainMm === 0 && d.date > ctx.asOf);
  return (
    <>
      <ScenarioNote ctx={ctx} />
      <header className="mb-8 flex flex-col gap-2 sm:mb-10">
        <p className="eyebrow">Overview</p>
        <h1 className="text-h1">{ctx.farm.name}</h1>
        <p className="text-lead text-ink-2">
          {ctx.crop.name} · {ctx.farm.variety} · {ctx.farm.areaAcres} acres · {ctx.growth.stage ? `${ctx.growth.stage.name}, day ${ctx.growth.daysAfterSowing}` : ctx.growth.label}
        </p>
      </header>

      {status === 'planned' && (
        <Reveal className="mb-6">
          <div className="flex items-start gap-3 rounded-card border border-accent/25 bg-accent-soft/60 p-5">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden />
            <div>
              <p className="font-semibold text-ink">Every open issue now has an action planned.</p>
              <p className="text-sm text-ink-2">
                Farm health scores update when new observations or tests come in — not just because a plan exists.
                {nextScout ? ` Next field check: ${formatShortDate(nextScout.date)}.` : ''}
              </p>
            </div>
          </div>
        </Reveal>
      )}

      <motion.div variants={stagger} initial="hidden" animate="show" className="grid gap-5 lg:grid-cols-12">
        <div className="flex flex-col gap-5 lg:col-span-7">
          <HealthCard ctx={ctx} />
          <motion.section variants={rise} className="card relative overflow-hidden">
            <div className="relative h-[260px] sm:h-[300px]">
              <Suspense fallback={<SceneFallback compact />}>
                <FieldScene
                  className="absolute inset-0"
                  status={status}
                  riskLabel={disease?.subject ? `Scout here · ${disease.subject.toLowerCase()}` : 'Scout here'}
                  recLabel="Action planned"
                />
              </Suspense>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line/70 px-5 py-3 text-label text-ink-3">
              <span>Illustrative field view · marker = north-east patch from your field notes</span>
              <Link to="/app/crop" className="font-semibold text-accent hover:underline">
                Crop details
              </Link>
            </div>
          </motion.section>
        </div>
        <div className="flex flex-col gap-5 lg:col-span-5">
          <AlertCard ctx={ctx} />
          <LiveWeatherCard />
          <motion.section variants={rise} className="card card-pad">
            <Disclosure
              summary={
                <span className="flex flex-col">
                  <span className="text-ink">Weather risk outlook</span>
                  <span className="text-label font-normal text-ink-3">Disease, pest, water and weather stress for the next days</span>
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
                Open Risk Intelligence <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </Disclosure>
          </motion.section>
        </div>
        <div className="lg:col-span-12">
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
