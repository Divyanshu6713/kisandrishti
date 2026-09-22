import { motion } from 'framer-motion';
import { AlertCircle, CheckCircle2, CircleDashed, Clock3, ListPlus, Sparkles } from 'lucide-react';
import type { FarmContext } from '@/services';
import { cn } from '@/lib/utils';
import { useFarmStore } from '@/state/farmStore';
import { toast } from '@/state/toastStore';
import { useUiStore } from '@/state/uiStore';
import { ScenarioNote, WithFarm } from '@/components/farm/WithFarm';
import { RecommendationCard } from '@/components/farm/RecommendationCard';
import { Progress } from '@/components/ui/gauges';
import { EASE, Reveal, stagger } from '@/components/ui/motion';
import { EmptyState, PageHeader } from '@/components/ui/primitives';

function Inputs({ ctx }: { ctx: FarmContext }) {
  const disease = ctx.risks.find((r) => r.kind === 'disease');
  const main = ctx.soilReport?.deficiencies[0];
  const next3 = ctx.weather?.days.slice(0, 3) ?? [];
  const chips = [
    { k: 'Soil', v: ctx.soilReport ? (main ? `${main.short} ${main.band.label.toLowerCase()}` : ctx.soilReport.grade) : 'no test' },
    { k: 'Crop', v: `${ctx.cropHealth.score}/100` },
    { k: 'Weather', v: next3.length ? `${Math.round(next3.reduce((a, d) => a + d.humidity, 0) / next3.length)}% humid` : 'none' },
    { k: 'Disease', v: disease?.status === 'ok' ? `${disease.level}` : 'n/a' },
    { k: 'Method', v: ctx.farm.method },
    { k: 'Stage', v: ctx.growth.stage?.name.toLowerCase() ?? '—' },
  ];
  return (
    <div className="flex flex-col items-center gap-5 lg:flex-row lg:gap-6">
      <motion.ul variants={stagger} initial="hidden" animate="show" className="flex flex-wrap justify-center gap-2 lg:max-w-md lg:justify-start">
        {chips.map((c, i) => (
          <motion.li
            key={c.k}
            variants={{ hidden: { opacity: 0, x: -10 }, show: { opacity: 1, x: 0, transition: { duration: 0.5, ease: EASE, delay: i * 0.06 } } }}
            className="rounded-full border border-line bg-surface px-3 py-1.5 text-sm"
          >
            <span className="text-ink-3">{c.k}</span> <span className="font-semibold">{c.v}</span>
          </motion.li>
        ))}
      </motion.ul>
      <motion.svg width="80" height="24" viewBox="0 0 80 24" className="hidden shrink-0 text-accent lg:block" aria-hidden>
        <motion.path d="M2 12 H70 M62 5 L72 12 L62 19" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9, delay: 0.5, ease: EASE }} />
      </motion.svg>
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.9, duration: 0.5, ease: EASE }} className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-ink shadow-soft">
        <Sparkles className="h-4 w-4" aria-hidden /> {ctx.advice.items.length} recommendations
      </motion.div>
    </div>
  );
}

function AdvisorBody({ ctx }: { ctx: FarmContext }) {
  const a = ctx.advice;
  const setPlan = useFarmStore((s) => s.setPlan);
  const openAssistant = useUiStore((s) => s.openAssistant);
  const open = a.items.filter((i) => i.priority !== 'low');
  const unplanned = open.filter((i) => !ctx.plan.some((p) => p.recommendationId === i.id || (i.practiceId && p.recommendationId === `organic-${i.practiceId}`)));

  const planAll = () => {
    unplanned.forEach((i) => setPlan({ farmId: ctx.farm.id, recommendationId: i.id, title: i.title, status: 'planned', updatedAt: new Date().toISOString() }));
    toast(`${unplanned.length} action${unplanned.length > 1 ? 's' : ''} added to your plan`, 'The overview now shows the farm as on track.');
  };

  return (
    <>
      <ScenarioNote ctx={ctx} />
      <PageHeader eyebrow="Farm Advisor" title="Your farm, combined" description="Soil, crop, weather, disease, farming method and growth stage — read together into one short list." />

      <Reveal className="card card-pad mb-8">
        <Inputs ctx={ctx} />
        <div className="mt-8 border-t border-line/70 pt-6">
          <p className="text-h3 font-medium text-balance">{a.headline}</p>
          {a.openIssues > 0 && (
            <div className="mt-5 flex flex-wrap items-center gap-4">
              <div className="w-48">
                <Progress value={(a.addressed / a.openIssues) * 100} tone={a.addressed === a.openIssues ? 'good' : 'warn'} />
              </div>
              <span className="text-sm text-ink-2">
                {a.addressed} of {a.openIssues} priority issues have an action planned
              </span>
              {unplanned.length > 0 ? (
                <button type="button" className="btn-primary ml-auto" onClick={planAll}>
                  <ListPlus className="h-4 w-4" aria-hidden /> Add {unplanned.length === open.length ? 'priority actions' : 'the rest'} to plan
                </button>
              ) : (
                <span className="ml-auto inline-flex items-center gap-2 text-sm font-semibold text-accent">
                  <CheckCircle2 className="h-4 w-4" aria-hidden /> Plan in place
                </span>
              )}
            </div>
          )}
        </div>
      </Reveal>

      <div className="grid gap-8 lg:grid-cols-12">
        <section className="lg:col-span-8" aria-labelledby="recs">
          <h2 id="recs" className="sr-only">
            Recommendations
          </h2>
          {a.items.length ? (
            <motion.div variants={stagger} initial="hidden" animate="show" className="grid gap-4">
              {a.items.map((rec, i) => (
                <RecommendationCard key={rec.id} rec={rec} farmId={ctx.farm.id} defaultOpen={i === 0} />
              ))}
            </motion.div>
          ) : (
            <EmptyState icon={<CheckCircle2 className="h-5 w-5" />} title="No action needed right now" body="Nothing in the soil, crop or weather data calls for an intervention." />
          )}
        </section>
        <aside className="space-y-5 lg:col-span-4">
          <Reveal className="card card-pad">
            <h2 className="text-h3">What this advice is based on</h2>
            <p className="mb-4 text-sm text-ink-3">More complete data → more reliable advice</p>
            <ul className="space-y-3">
              {a.completeness.map((c) => (
                <li key={c.label} className="flex items-start gap-3 text-sm">
                  {c.status === 'ok' ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-label="available" />
                  ) : c.status === 'stale' ? (
                    <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-label="limited" />
                  ) : (
                    <CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" aria-label="missing" />
                  )}
                  <div>
                    <p className={cn('font-medium', c.status === 'missing' && 'text-ink-2')}>{c.label}</p>
                    <p className="text-ink-3">{c.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal className="card card-pad" delay={0.05}>
            <div className="flex gap-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" aria-hidden />
              <p className="text-sm text-ink-2">Advice comes from transparent demo rules. It never replaces a local agriculture officer or KVK for diagnosis or doses.</p>
            </div>
            <button type="button" className="btn-secondary mt-4 w-full" onClick={() => openAssistant('What should I check today?')}>
              <Sparkles className="h-4 w-4 text-accent" aria-hidden /> Ask about this advice
            </button>
          </Reveal>
        </aside>
      </div>
    </>
  );
}

export default function Advisor() {
  return <WithFarm>{(ctx) => <AdvisorBody ctx={ctx} />}</WithFarm>;
}
