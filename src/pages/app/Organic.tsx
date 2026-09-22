import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, Check, Leaf } from 'lucide-react';
import { lazy, Suspense, useMemo, useState } from 'react';
import type { FarmInput, OrganicRecommendation } from '@/models';
import { cn } from '@/lib/utils';
import type { FarmContext } from '@/services';
import { ScenarioNote, WithFarm } from '@/components/farm/WithFarm';
import { PlanButton } from '@/components/farm/RecommendationCard';
import { EASE, Reveal } from '@/components/ui/motion';
import { Disclosure, InsufficientData, PageHeader, Pill, Segmented } from '@/components/ui/primitives';
import { BasisList, SourceTags } from '@/components/ui/provenance';
import { Progress } from '@/components/ui/gauges';
import { SceneFallback } from '@/three/SceneFallback';

const PlantStudio = lazy(() => import('@/three/PlantStudio'));

type Tab = 'nutrient' | 'protection' | 'soil';
const TABS: { value: Tab; label: string }[] = [
  { value: 'nutrient', label: 'Nourish' },
  { value: 'protection', label: 'Protect' },
  { value: 'soil', label: 'Rebuild soil' },
];

const INPUT_LABEL: Record<FarmInput, string> = {
  'cattle-dung': 'Cattle dung',
  'crop-residue': 'Crop residue',
  vermicompost: 'Vermicompost',
  biofertilizers: 'Biofertilizers',
  neem: 'Neem',
  'green-manure-seed': 'Green-manure seed',
};

function Featured({ item, farmId }: { item: OrganicRecommendation; farmId: string }) {
  const p = item.practice;
  return (
    <motion.div key={p.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.4, ease: EASE }}>
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone="good">
          <Leaf className="h-3 w-3" aria-hidden /> {p.kind}
        </Pill>
        <Pill tone={item.when === 'now' ? 'good' : 'neutral'}>{item.when === 'now' ? 'Fits the current stage' : 'Plan for next season'}</Pill>
        {!item.hasInputs && <Pill tone="warn">Input not on farm</Pill>}
      </div>
      <h2 className="mt-4 text-h1 text-balance">{p.name}</h2>
      <p className="mt-2 text-lead text-ink-2">{p.summary}</p>

      <dl className="mt-6 grid gap-5 sm:grid-cols-2">
        <div>
          <dt className="eyebrow mb-1.5">Why it’s relevant here</dt>
          <dd>
            <ul className="space-y-1 text-sm text-ink-2">
              {item.matched.map((m) => (
                <li key={m} className="flex gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
                  {m}
                </li>
              ))}
            </ul>
          </dd>
        </div>
        <div>
          <dt className="eyebrow mb-1.5">Suggested next step</dt>
          <dd className="text-sm text-ink-2">{item.when === 'now' ? p.howTo[0] : `Plan it — ${p.timing}`}</dd>
        </div>
      </dl>

      <Disclosure summary="How to apply, timing and cautions" className="mt-6 border-t border-line/70 pt-4">
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <p className="eyebrow mb-2">How</p>
            <ol className="list-decimal space-y-1 pl-4 text-sm text-ink-2">
              {p.howTo.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ol>
          </div>
          <div className="space-y-4">
            <div>
              <p className="eyebrow mb-1">Timing</p>
              <p className="text-sm text-ink-2">{p.timing}</p>
            </div>
            {p.cautions.length > 0 && (
              <div>
                <p className="eyebrow mb-1">Cautions</p>
                <ul className="space-y-1 text-sm text-ink-2">
                  {p.cautions.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
        <div className="mt-5 rounded-ctl bg-sunken/60 p-4">
          <BasisList basis={item.recommendation.basis} />
        </div>
      </Disclosure>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <span className="text-label text-ink-3">Doses are not prescribed — follow your soil test, product label and local expert.</span>
        <PlanButton farmId={farmId} rec={item.recommendation} />
      </div>
    </motion.div>
  );
}

function OrganicBody({ ctx }: { ctx: FarmContext }) {
  const organic = ctx.organic;
  const items = organic.status === 'ok' ? organic.data.items : [];
  const [featuredId, setFeaturedId] = useState<string | null>(null);
  const [pulse, setPulse] = useState(0);
    // Lead with the best-matching organic input that can be used now; protection items stay one tab away.
  const lead = items.find((i) => i.when === 'now' && i.practice.category === 'nutrient') ?? items[0];
  const featured = items.find((i) => i.practice.id === featuredId) ?? lead;
  const [tab, setTab] = useState<Tab>(featured?.practice.category ?? 'nutrient');
  const inTab = useMemo(() => items.filter((i) => i.practice.category === tab), [items, tab]);
  const plan = ctx.plan;

  const choose = (id: string) => {
    setFeaturedId(id);
    setPulse((p) => p + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <>
      <ScenarioNote ctx={ctx} />
      <PageHeader
        eyebrow="Organic Farming"
        title="Organic recommendations"
        description={`Matched to the soil test, ${ctx.crop.name.toLowerCase()} at ${ctx.growth.stage?.name.toLowerCase() ?? 'its current stage'}, and the inputs already on this farm.`}
      />

      {organic.status === 'insufficient' ? (
        <InsufficientData missing={organic.missing} message={organic.message} />
      ) : !featured ? (
        <InsufficientData missing={[]} message="No soil or risk condition currently calls for an organic intervention." />
      ) : (
        <>
          <div className="grid gap-5 lg:grid-cols-12">
            <Reveal className="card relative overflow-hidden bg-gradient-to-b from-surface to-sunken/40 lg:col-span-5">
              <div className="relative h-[300px] sm:h-[380px] lg:h-full lg:min-h-[420px]">
                <Suspense fallback={<SceneFallback compact />}>
                  <PlantStudio className="absolute inset-0" health={Math.min(1, ctx.cropHealth.vigor + 0.15)} growth={ctx.growth.progress} pulse={pulse} label="Illustrative plant receiving organic matter" />
                </Suspense>
              </div>
            </Reveal>
            <section className="card card-pad lg:col-span-7" aria-live="polite">
              <p className="eyebrow mb-4">{featured.practice.id === lead.practice.id ? (featured.practice.category === 'nutrient' ? 'Recommended organic input' : 'Recommended first') : 'Selected practice'}</p>
              <AnimatePresence mode="wait">
                <Featured key={featured.practice.id} item={featured} farmId={ctx.farm.id} />
              </AnimatePresence>
            </section>
          </div>

          <section className="mt-12" aria-labelledby="more-practices">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 id="more-practices" className="text-h2">
                  More practices for this farm
                </h2>
                <p className="text-sm text-ink-3">Ranked by how many farm conditions they match · rule score, not a probability</p>
              </div>
              <Segmented label="Practice category" value={tab} onChange={setTab} options={TABS} />
            </div>
            <AnimatePresence mode="wait">
              <motion.ul key={tab} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} className="card divide-y divide-line/70">
                {inTab.length === 0 && <li className="p-6 text-sm text-ink-2">No practice in this category matches the farm’s current conditions.</li>}
                {inTab.map((i) => {
                  const planned = plan.some((p) => p.recommendationId === i.recommendation.id);
                  return (
                    <li key={i.practice.id}>
                      <button
                        type="button"
                        onClick={() => choose(i.practice.id)}
                        className={cn('grid w-full grid-cols-[1fr_auto] items-center gap-4 p-5 text-left transition-colors hover:bg-sunken/50 sm:grid-cols-[1fr_9rem_auto]', featured.practice.id === i.practice.id && 'bg-accent-soft/40')}
                      >
                        <span className="min-w-0">
                          <span className="flex items-center gap-2 font-semibold">
                            {i.practice.name}
                            {planned && <Check className="h-4 w-4 text-accent" aria-label="In plan" />}
                          </span>
                          <span className="block truncate text-sm text-ink-2">{i.matched.join(' · ')}</span>
                        </span>
                        <span className="hidden sm:block">
                          <Progress value={i.relevance * 100} tone={i.when === 'now' ? 'good' : 'neutral'} />
                        </span>
                        <Pill tone={i.when === 'now' ? 'good' : 'neutral'}>{i.when === 'now' ? 'Now' : 'Next season'}</Pill>
                      </button>
                    </li>
                  );
                })}
              </motion.ul>
            </AnimatePresence>
          </section>

          <div className="mt-8 grid gap-5 md:grid-cols-2">
            <Reveal className="card card-pad">
              <p className="eyebrow mb-3">Inputs on this farm</p>
              <div className="flex flex-wrap gap-2">
                {ctx.farm.availableInputs.length ? (
                  ctx.farm.availableInputs.map((i) => (
                    <Pill key={i} tone="neutral">
                      {INPUT_LABEL[i]}
                    </Pill>
                  ))
                ) : (
                  <span className="text-sm text-ink-2">None listed — add them in My Farms to improve ranking.</span>
                )}
              </div>
            </Reveal>
            <Reveal className="card card-pad" delay={0.05}>
              <p className="eyebrow mb-3">About these recommendations</p>
              {organic.status === 'ok' && organic.data.notes.length > 0 && (
                <ul className="mb-3 space-y-1 text-sm text-ink-2">
                  {organic.data.notes.map((n) => (
                    <li key={n} className="flex gap-2">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden />
                      {n}
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-sm text-ink-2">General practices from a demo knowledge base, matched by transparent rules. They will be generated from the verified Kisan Drishti dataset once connected.</p>
              {organic.status === 'ok' && <SourceTags className="mt-3" sources={organic.basis.sources} />}
            </Reveal>
          </div>
        </>
      )}
    </>
  );
}

export default function Organic() {
  return <WithFarm>{(ctx) => <OrganicBody key={ctx.farm.id} ctx={ctx} />}</WithFarm>;
}
