import { AnimatePresence, motion } from 'framer-motion';
import { History } from 'lucide-react';
import { useState } from 'react';
import { formatShortDate } from '@/lib/utils';
import { soilAnalysisService, type FarmContext } from '@/services';
import { ScenarioNote, WithFarm } from '@/components/farm/WithFarm';
import { BarChart, Sparkline } from '@/components/charts/BarChart';
import { LineChart } from '@/components/charts/LineChart';
import { Counter, EASE, Reveal } from '@/components/ui/motion';
import { EmptyState, PageHeader, Pill, Segmented } from '@/components/ui/primitives';
import { SourceTags } from '@/components/ui/provenance';

type Tab = 'crop' | 'soil' | 'water' | 'organic' | 'seasons';
const TABS: { value: Tab; label: string }[] = [
  { value: 'crop', label: 'Crop & risk' },
  { value: 'soil', label: 'Soil' },
  { value: 'water', label: 'Water' },
  { value: 'organic', label: 'Organic inputs' },
  { value: 'seasons', label: 'Seasons' },
];

function KPI({ label, value, from, unit, spark, color }: { label: string; value: number; from?: number; unit?: string; spark?: number[]; color?: string }) {
  const delta = from !== undefined ? value - from : null;
  return (
    <div className="flex items-end justify-between gap-3 p-5 sm:p-6">
      <div>
        <p className="text-label font-medium text-ink-3">{label}</p>
        <p className="tabular mt-1 text-h2 font-semibold">
          <Counter value={value} decimals={unit === '%' && value < 2 ? 2 : 0} />
          {unit && <span className="ml-0.5 text-sm font-medium text-ink-3">{unit}</span>}
        </p>
        {delta !== null && <p className="text-sm text-ink-3">{delta === 0 ? 'no change' : `${delta > 0 ? '+' : ''}${Math.round(delta * 100) / 100} since start`}</p>}
      </div>
      {spark && <Sparkline values={spark} color={color} />}
    </div>
  );
}

function InsightsBody({ ctx }: { ctx: FarmContext }) {
  const [tab, setTab] = useState<Tab>('crop');
  const h = ctx.history;
  const weekly = h?.weekly ?? [];
  const disease = ctx.risks.find((r) => r.kind === 'disease');
  // History comes from records; the final "today" point comes from the live engine, so it always matches the other pages.
  const labels = [...weekly.map((w) => formatShortDate(w.week)), formatShortDate(ctx.asOf)];
  const health = [...weekly.map((w) => w.cropHealth), ctx.cropHealth.score];
  const risk = [...weekly.map((w) => w.diseaseRisk), disease?.status === 'ok' ? disease.score : null];
  const moisture = [...weekly.map((w) => w.moisture), ctx.moisture?.pct ?? null];
  const oc = soilAnalysisService.trend(ctx.soilTests, 'organicCarbon');
  const n = soilAnalysisService.trend(ctx.soilTests, 'nitrogen');
  const season = h?.seasons[h.seasons.length - 1];

  if (!h && ctx.soilTests.length < 2 && ctx.plan.length === 0)
    return (
      <>
        <PageHeader eyebrow="Insights" title="Farm insights" />
        <EmptyState icon={<History className="h-5 w-5" />} title="History builds up over time" body="Trends appear once this farm has repeated soil tests, weekly observations and actions in the plan. Try the demo farm to see a full season." />
      </>
    );

  return (
    <>
      <ScenarioNote ctx={ctx} />
      <PageHeader eyebrow="Insights" title="How the season is going" description="Trends from the farm’s records. The last point in every chart is today’s engine output." />

      <Reveal className="card mb-8 grid grid-cols-2 divide-line/70 lg:grid-cols-4 lg:divide-x">
        <div className="border-b border-r border-line/70 lg:border-0">
          <KPI label="Crop health" value={ctx.cropHealth.score} from={health[0]} spark={health.filter((x): x is number => x !== null)} />
        </div>
        <div className="border-b border-line/70 lg:border-0">
          <KPI label="Disease risk" value={disease?.score ?? 0} from={risk[0] ?? undefined} spark={risk.filter((x): x is number => x !== null)} color="rgb(var(--danger))" />
        </div>
        <div className="border-r border-line/70 lg:border-0">
          <KPI label="Organic carbon" value={oc[oc.length - 1]?.value ?? 0} from={oc[0]?.value} unit="%" spark={oc.map((x) => x.value)} color="rgb(var(--earth))" />
        </div>
        <div>
          <KPI label="Advice followed" value={season?.recommendationsFollowed ?? 0} unit={season ? ` of ${season.recommendationsOffered}` : ''} />
        </div>
      </Reveal>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Segmented label="Insight" value={tab} onChange={setTab} options={TABS} />
        <SourceTags sources={['demo-dataset', 'demo-rules']} />
      </div>

      <AnimatePresence mode="wait">
        <motion.section key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.35, ease: EASE }} className="card card-pad">
          {tab === 'crop' && (
            <>
              <h2 className="text-h3">Crop health vs disease risk</h2>
              <p className="mb-6 text-sm text-ink-3">Health slipped as cool, humid weeks raised rust risk — the pattern the advisor responds to.</p>
              <LineChart
                ariaLabel="Weekly crop health and disease risk"
                labels={labels}
                highlightLast="Today"
                series={[
                  { name: 'Crop health', color: 'rgb(var(--accent))', values: health, area: true },
                  { name: 'Disease risk', color: 'rgb(var(--danger))', values: risk },
                ]}
              />
            </>
          )}
          {tab === 'soil' && (
            <div className="grid gap-8 lg:grid-cols-2">
              <div>
                <h2 className="text-h3">Organic carbon</h2>
                <p className="mb-6 text-sm text-ink-3">Rising slowly since the switch to organic — still in the low band (&lt; 0.5%).</p>
                {oc.length >= 2 ? (
                  <LineChart ariaLabel="Organic carbon by soil test" labels={oc.map((x) => formatShortDate(x.date))} min={0} max={1} unit="%" series={[{ name: 'Organic carbon %', color: 'rgb(var(--earth))', values: oc.map((x) => x.value), area: true }]} height={200} />
                ) : (
                  <p className="text-sm text-ink-2">Needs at least two soil tests.</p>
                )}
              </div>
              <div>
                <h2 className="text-h3">Available nitrogen</h2>
                <p className="mb-6 text-sm text-ink-3">kg/ha by soil test · 280 = low/medium boundary</p>
                {n.length >= 2 ? (
                  <LineChart
                    ariaLabel="Available nitrogen by soil test"
                    labels={n.map((x) => formatShortDate(x.date))}
                    min={150}
                    max={350}
                    series={[
                      { name: 'Nitrogen', color: 'rgb(var(--accent))', values: n.map((x) => x.value), area: true },
                      { name: 'Low threshold', color: 'rgb(var(--ink-3))', values: n.map(() => 280), dashed: true },
                    ]}
                    height={200}
                  />
                ) : (
                  <p className="text-sm text-ink-2">Needs at least two soil tests.</p>
                )}
              </div>
            </div>
          )}
          {tab === 'water' && (
            <>
              <h2 className="text-h3">Soil moisture</h2>
              <p className="mb-6 text-sm text-ink-3">Weekly field readings against the ~{ctx.crop.moistureFloor}% floor for {ctx.crop.name.toLowerCase()} (indicative)</p>
              <LineChart
                ariaLabel="Weekly soil moisture"
                labels={labels}
                highlightLast="Today"
                min={0}
                max={40}
                unit="%"
                series={[
                  { name: 'Soil moisture', color: 'rgb(var(--info))', values: moisture, area: true },
                  { name: 'Crop floor', color: 'rgb(var(--warn))', values: labels.map(() => ctx.crop.moistureFloor), dashed: true },
                ]}
              />
            </>
          )}
          {tab === 'organic' && (
            <div className="grid gap-8 lg:grid-cols-2">
              <div>
                <h2 className="text-h3">Organic inputs applied</h2>
                <p className="mb-5 text-sm text-ink-3">This season</p>
                <ol className="relative space-y-5 border-l border-line pl-6">
                  {(h?.inputs ?? []).map((x) => (
                    <li key={x.date + x.input} className="relative">
                      <span className="absolute -left-[1.83rem] top-1.5 h-3 w-3 rounded-full border-2 border-surface bg-accent" aria-hidden />
                      <p className="text-label text-ink-3">{formatShortDate(x.date)}</p>
                      <p className="font-semibold">{x.input}</p>
                      <p className="text-sm text-ink-2">
                        {x.type} · {x.area}
                      </p>
                    </li>
                  ))}
                </ol>
              </div>
              <div>
                <h2 className="text-h3">Your plan</h2>
                <p className="mb-5 text-sm text-ink-3">Actions you chose from the advisor and organic pages</p>
                {ctx.plan.length ? (
                  <ul className="divide-y divide-line/70">
                    {ctx.plan.map((p) => (
                      <li key={p.recommendationId} className="flex items-center justify-between gap-3 py-3">
                        <span className="font-medium">{p.title}</span>
                        <Pill tone={p.status === 'done' ? 'good' : 'ok'}>{p.status === 'done' ? 'Done' : 'Planned'}</Pill>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-ink-2">No actions planned yet — add them from the Farm Advisor.</p>
                )}
              </div>
            </div>
          )}
          {tab === 'seasons' && (
            <>
              <h2 className="text-h3">Yield by season</h2>
              <p className="mb-6 text-sm text-ink-3">q/acre from farm records · a dip in the first organic year is common while soil biology rebuilds</p>
              <BarChart
                ariaLabel="Wheat yield per season"
                unit="q"
                max={25}
                data={(h?.seasons ?? []).map((s) => ({ label: s.season, value: s.yieldQPerAcre, sub: s.method, color: s.method.startsWith('Organic') ? 'rgb(var(--accent))' : 'rgb(var(--ink-3) / 0.6)' }))}
              />
              <p className="mt-4 text-label text-ink-3">2025–26 is in progress. No yield forecast is shown — the prototype does not have a validated yield model.</p>
            </>
          )}
        </motion.section>
      </AnimatePresence>
    </>
  );
}

export default function Insights() {
  return <WithFarm>{(ctx) => <InsightsBody ctx={ctx} />}</WithFarm>;
}
