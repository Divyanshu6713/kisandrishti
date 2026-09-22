import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, FlaskConical, Plus } from 'lucide-react';
import { lazy, Suspense, useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { NutrientKey, NutrientReading, NutrientReference, RangeBand, SoilLayerId } from '@/models';
import { cn, formatDate } from '@/lib/utils';
import { farmDataService, soilAnalysisService, type FarmContext } from '@/services';
import { toast } from '@/state/toastStore';
import { ScenarioNote, WithFarm } from '@/components/farm/WithFarm';
import { BandBar, ScoreRing } from '@/components/ui/gauges';
import { EASE, Reveal } from '@/components/ui/motion';
import { Modal } from '@/components/ui/overlay';
import { Disclosure, EmptyState, InsufficientData, PageHeader, Pill } from '@/components/ui/primitives';
import { WhyThis } from '@/components/ui/provenance';
import { scoreTone, toneText } from '@/components/ui/tone';
import { Sparkline } from '@/components/charts/BarChart';
import { SoilTestForm } from '@/features/soil/SoilTestForm';
import { SceneFallback } from '@/three/SceneFallback';

const SoilScene = lazy(() => import('@/three/SoilScene'));

const PRIMARY: NutrientKey[] = ['ph', 'nitrogen', 'phosphorus', 'potassium', 'organicCarbon', 'moisture'];
const FIT_TONE = { good: 'good', fair: 'warn', poor: 'bad' } as const;

function bandWidths(bands: RangeBand[], scale: [number, number]) {
  let prev = scale[0];
  return bands.map((b) => {
    const max = b.max === null ? scale[1] : Math.min(b.max, scale[1]);
    const w = Math.max(0, (max - prev) / (scale[1] - scale[0]));
    prev = max;
    return { width: w, tone: b.tone };
  });
}

function NutrientDetail({ r, ctx, refs }: { r: NutrientReading; ctx: FarmContext; refs?: NutrientReference }) {
  const trend = soilAnalysisService.trend(ctx.soilTests, r.key);
  return (
    <motion.div key={r.key} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.35, ease: EASE }}>
      <p className="eyebrow">{r.label}</p>
      <p className="mt-2 flex items-baseline gap-2">
        <span className="tabular text-[2.5rem] font-semibold leading-none tracking-tight">{r.value}</span>
        <span className="text-ink-3">{r.unit}</span>
        <span className={cn('ml-2 text-sm font-semibold', toneText[r.band.tone])}>{r.band.label}</span>
      </p>
      {refs && (
        <div className="mt-5">
          <BandBar position={r.position} bands={bandWidths(refs.bands, refs.scale)} tone={r.band.tone} />
          <div className="mt-1.5 flex justify-between text-label text-ink-3">
            <span>{refs.scale[0]}</span>
            <span>{refs.scale[1]}</span>
          </div>
        </div>
      )}
      <p className="mt-5 text-sm text-ink-2">{r.whyItMatters}</p>
      {trend.length >= 2 && (
        <div className="mt-5 flex items-center gap-3 rounded-ctl bg-sunken/60 px-4 py-3">
          <Sparkline values={trend.map((t) => t.value)} />
          <p className="text-sm text-ink-2">
            {trend[0].value} → {trend[trend.length - 1].value} {r.unit} since {formatDate(trend[0].date).split(' ').slice(1).join(' ')}
          </p>
        </div>
      )}
      <p className="mt-4 text-label text-ink-3">Range: {r.reference}</p>
    </motion.div>
  );
}

function SoilBody({ ctx }: { ctx: FarmContext }) {
  const [adding, setAdding] = useState(false);
  const [references, setReferences] = useState<NutrientReference[]>([]);
  useEffect(() => {
    soilAnalysisService.references().then(setReferences);
  }, []);
  const report = ctx.soilReport;
  const firstDeficiency = (report?.deficiencies.find((d) => d.key === 'nitrogen') ?? report?.deficiencies[0])?.key ?? 'nitrogen';
  const [selected, setSelected] = useState<NutrientKey>(firstDeficiency);
  const reading = report?.readings.find((r) => r.key === selected) ?? report?.readings[0];
  const layer: SoilLayerId | null = reading?.layer ?? null;
  const improve = ctx.organic.status === 'ok' ? ctx.organic.data.items.filter((i) => i.practice.category !== 'protection').slice(0, 3) : [];

  const header = (
    <PageHeader
      eyebrow="Soil Intelligence"
      title="Soil health"
      description={report ? `From the soil test on ${formatDate(report.testDate)}. Select a value to see where it acts in the soil.` : 'Add a soil test to see nutrient status and guidance.'}
      action={
        <button type="button" className="btn-secondary" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" aria-hidden /> Add soil test
        </button>
      }
    />
  );

  const modal = (
    <Modal open={adding} onClose={() => setAdding(false)} title="Add a soil test" wide>
      <SoilTestForm
        onCancel={() => setAdding(false)}
        onSubmit={(values, date) => {
          farmDataService.addSoilTest(ctx.farm.id, values, date);
          setAdding(false);
          toast('Soil test saved', 'Soil health, advice and organic recommendations were recalculated.');
        }}
      />
    </Modal>
  );

  if (!report || ctx.soil.status !== 'ok') {
    const missing = ctx.soil.status === 'insufficient' ? ctx.soil.missing : [];
    return (
      <>
        <ScenarioNote ctx={ctx} />
        {header}
        {ctx.soilTests.length ? (
          <InsufficientData missing={missing} message={ctx.soil.status === 'insufficient' ? ctx.soil.message : 'Insufficient data.'} />
        ) : (
          <EmptyState
            icon={<FlaskConical className="h-5 w-5" />}
            title="No soil test yet"
            body="Soil advice needs at least pH plus two of N, P, K and organic carbon from a soil-testing lab."
            action={
              <button type="button" className="btn-primary" onClick={() => setAdding(true)}>
                Add soil test
              </button>
            }
          />
        )}
        {modal}
      </>
    );
  }

  const options = report.readings.filter((r) => PRIMARY.includes(r.key));
  const secondary = report.readings.filter((r) => !PRIMARY.includes(r.key));

  return (
    <>
      <ScenarioNote ctx={ctx} />
      {header}

      <div className="grid gap-5 lg:grid-cols-12">
        <Reveal className="card overflow-hidden lg:col-span-7">
          <div className="relative h-[340px] sm:h-[440px]">
            <Suspense fallback={<SceneFallback compact />}>
              <SoilScene
                className="absolute inset-0"
                selected={layer}
                growth={ctx.growth.progress}
                health={ctx.cropHealth.vigor}
                labels={reading ? { [reading.layer === 'roots' ? 'topsoil' : reading.layer]: `· ${reading.short}` } : {}}
              />
            </Suspense>
          </div>
          <div className="border-t border-line/70 p-4 sm:p-5">
            <div role="tablist" aria-label="Soil parameter" className="flex flex-wrap gap-2">
              {[...options, ...secondary].map((r) => (
                <button
                  key={r.key}
                  role="tab"
                  type="button"
                  aria-selected={selected === r.key}
                  onClick={() => setSelected(r.key)}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold transition-all duration-200',
                    selected === r.key ? 'border-accent bg-accent text-accent-ink shadow-soft' : 'border-line bg-surface text-ink-2 hover:border-ink-3/40',
                  )}
                >
                  <span className={cn('h-1.5 w-1.5 rounded-full', selected === r.key ? 'bg-accent-ink' : r.band.tone === 'bad' ? 'bg-danger' : r.band.tone === 'warn' ? 'bg-warn' : 'bg-accent')} aria-hidden />
                  {r.short}
                </button>
              ))}
            </div>
          </div>
        </Reveal>

        <div className="flex flex-col gap-5 lg:col-span-5">
          <Reveal className="card card-pad flex items-center gap-6">
            <ScoreRing score={report.score} tone={scoreTone(report.score)} size={120} stroke={9} label={report.grade} />
            <div className="min-w-0">
              <p className="eyebrow mb-2">Needs attention</p>
              {report.deficiencies.length ? (
                <ul className="space-y-1.5 text-sm">
                  {report.deficiencies.slice(0, 4).map((d) => (
                    <li key={d.key}>
                      <button type="button" className="text-left hover:underline" onClick={() => setSelected(d.key)}>
                        <span className="font-semibold">{d.label}</span> <span className={toneText[d.band.tone]}>· {d.band.label.toLowerCase()}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-ink-2">No deficiencies found.</p>
              )}
            </div>
          </Reveal>
          <Reveal className="card card-pad min-h-[300px]" delay={0.05}>
            <AnimatePresence mode="wait">{reading && <NutrientDetail key={reading.key} r={reading} ctx={ctx} refs={references.find((x) => x.key === reading.key)} />}</AnimatePresence>
          </Reveal>
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Reveal className="card card-pad">
          <h2 className="text-h3">Improve this soil</h2>
          <p className="mb-4 text-sm text-ink-3">Organic options matched to these results</p>
          <ul className="divide-y divide-line/70">
            {improve.map((i) => (
              <li key={i.practice.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-semibold">{i.practice.name}</p>
                  <p className="truncate text-sm text-ink-2">{i.matched[0]}</p>
                </div>
                <Pill tone={i.when === 'now' ? 'good' : 'neutral'}>{i.when === 'now' ? 'Now' : 'Next season'}</Pill>
              </li>
            ))}
          </ul>
          <Link to="/app/organic" className="btn-ghost mt-3 -ml-3">
            Open Organic Farming <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </Reveal>
        <Reveal className="card card-pad" delay={0.05}>
          <h2 className="text-h3">Suitable crops</h2>
          <p className="mb-4 text-sm text-ink-3">Based on pH, soil type and salts</p>
          <ul className="divide-y divide-line/70">
            {report.suitableCrops.slice(0, 4).map((c) => (
              <li key={c.crop} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-semibold">{c.cropName}</p>
                  <p className="truncate text-sm text-ink-2">{c.reasons.join(' · ')}</p>
                </div>
                <Pill tone={FIT_TONE[c.fit]}>{c.fit === 'good' ? 'Good fit' : c.fit === 'fair' ? 'Fair' : 'Poor'}</Pill>
              </li>
            ))}
          </ul>
          <Disclosure summary="All crops" className="mt-2">
            <ul className="space-y-2 text-sm">
              {report.suitableCrops.slice(4).map((c) => (
                <li key={c.crop} className="flex justify-between gap-3">
                  <span>{c.cropName}</span>
                  <span className="text-ink-3">{c.reasons[0]}</span>
                </li>
              ))}
            </ul>
          </Disclosure>
        </Reveal>
      </div>

      <Reveal className="card card-pad mt-5">
        <Disclosure summary={`All ${report.readings.length} tested parameters${report.missing.length ? ` · ${report.missing.length} not tested` : ''}`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-label text-ink-3">
                  <th className="py-2 font-medium">Parameter</th>
                  <th className="py-2 font-medium">Value</th>
                  <th className="py-2 font-medium">Status</th>
                  <th className="py-2 font-medium">Reference</th>
                </tr>
              </thead>
              <tbody>
                {report.readings.map((r) => (
                  <tr key={r.key} className="border-b border-line/60 last:border-0">
                    <td className="py-2.5">{r.label}</td>
                    <td className="tabular py-2.5">
                      {r.value} <span className="text-ink-3">{r.unit}</span>
                    </td>
                    <td className={cn('py-2.5 font-semibold', toneText[r.band.tone])}>{r.band.label}</td>
                    <td className="py-2.5 text-ink-3">{r.reference}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Disclosure>
        <div className="mt-4">
          <WhyThis basis={ctx.soil.basis} />
        </div>
      </Reveal>
      {modal}
    </>
  );
}

export default function Soil() {
  return <WithFarm>{(ctx) => <SoilBody key={ctx.farm.id} ctx={ctx} />}</WithFarm>;
}
