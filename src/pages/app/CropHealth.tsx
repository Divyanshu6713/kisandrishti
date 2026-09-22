import { motion } from 'framer-motion';
import { Droplets, Plus, Thermometer, Wind } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { cn, formatShortDate } from '@/lib/utils';
import { farmDataService, type FarmContext } from '@/services';
import { toast } from '@/state/toastStore';
import { ScenarioNote, WithFarm } from '@/components/farm/WithFarm';
import { ScoreRing } from '@/components/ui/gauges';
import { Reveal, rise, stagger } from '@/components/ui/motion';
import { Modal } from '@/components/ui/overlay';
import { Dot, EmptyState, PageHeader, Pill, Stat } from '@/components/ui/primitives';
import { scoreTone } from '@/components/ui/tone';
import { GrowthTimeline } from '@/features/crop/GrowthTimeline';
import { ObservationForm } from '@/features/crop/ObservationForm';
import { SceneFallback } from '@/three/SceneFallback';

const PlantStudio = lazy(() => import('@/three/PlantStudio'));

const KIND_LABEL: Record<string, string> = {
  'leaf-colour': 'Leaf colour',
  pest: 'Pests',
  growth: 'Growth',
  'disease-scan': 'Leaf scan',
  irrigation: 'Irrigation',
  'input-applied': 'Input applied',
};

function CropBody({ ctx }: { ctx: FarmContext }) {
  const [adding, setAdding] = useState(false);
  const h = ctx.cropHealth;
  const tone = scoreTone(h.score);
  const today = ctx.weather?.days[0];

  return (
    <>
      <ScenarioNote ctx={ctx} />
      <PageHeader
        eyebrow="Crop Health"
        title={`${ctx.crop.name} · ${ctx.farm.variety}`}
        description="Health is built from your field observations, the soil test and current risks — every signal is listed below."
        action={
          <button type="button" className="btn-secondary" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" aria-hidden /> Add observation
          </button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-12">
        <Reveal className="card relative overflow-hidden lg:col-span-6">
          <div className="relative h-[360px] sm:h-[440px]">
            <Suspense fallback={<SceneFallback compact />}>
              <PlantStudio
                className="absolute inset-0"
                health={h.vigor}
                growth={ctx.growth.progress}
                warn={h.status !== 'healthy'}
                label={`Illustrative ${ctx.crop.name.toLowerCase()} plant at ${ctx.growth.stage?.name ?? 'current'} stage, coloured by health score ${h.score}.`}
              />
            </Suspense>
            <div className="pointer-events-none absolute left-4 top-4">
              <Pill tone={tone}>{h.statusLabel}</Pill>
            </div>
          </div>
          <p className="border-t border-line/70 px-5 py-3 text-label text-ink-3">Illustrative plant — colour and posture follow the health score; ears appear from heading.</p>
        </Reveal>

        <div className="flex flex-col gap-5 lg:col-span-6">
          <Reveal className="card card-pad flex flex-wrap items-center gap-6">
            <ScoreRing score={h.score} tone={tone} size={124} stroke={9} label={h.statusLabel} sub="Crop health" />
            <div className="grid flex-1 grid-cols-3 gap-4">
              <Stat label="Temperature" value={today ? `${today.tMin}–${today.tMax}` : '—'} unit="°C" />
              <Stat label="Humidity" value={today ? today.humidity : '—'} unit="%" />
              <Stat label="Soil moisture" value={ctx.moisture?.pct ?? '—'} unit="%" hint={ctx.moisture ? formatShortDate(ctx.moisture.date) : 'no reading'} />
            </div>
          </Reveal>
          <Reveal className="card card-pad" delay={0.05}>
            <div className="mb-5 flex items-baseline justify-between gap-3">
              <h2 className="text-h3">Growth stage</h2>
              <span className="text-sm text-ink-2">
                {ctx.growth.stage?.name ?? ctx.growth.label}
                {ctx.growth.nextStage ? ` → ${ctx.growth.nextStage.name} next` : ''}
              </span>
            </div>
            <GrowthTimeline crop={ctx.crop} growth={ctx.growth} />
            {ctx.growth.stage && <p className="mt-5 rounded-ctl bg-sunken/60 px-4 py-3 text-sm text-ink-2">Focus now: {ctx.growth.stage.focus}.</p>}
          </Reveal>
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Reveal className="card card-pad">
          <h2 className="text-h3">What shapes the score</h2>
          <p className="mb-4 text-sm text-ink-3">Starts at 90 and changes with each signal · rule-based</p>
          {h.signals.length ? (
            <motion.ul variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true }} className="divide-y divide-line/70">
              {h.signals.map((s, i) => (
                <motion.li key={i} variants={rise} className="flex items-start gap-3 py-3">
                  <span className="mt-2">
                    <Dot tone={s.tone} />
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold">{s.label}</p>
                    <p className="text-sm text-ink-2">{s.detail}</p>
                  </div>
                  <span className="ml-auto shrink-0 text-label text-ink-3">{s.source}</span>
                </motion.li>
              ))}
            </motion.ul>
          ) : (
            <p className="text-sm text-ink-2">No signals recorded in the last three weeks.</p>
          )}
        </Reveal>
        <Reveal className="card card-pad" delay={0.05}>
          <h2 className="text-h3">Recent observations</h2>
          <p className="mb-4 text-sm text-ink-3">From the field log</p>
          {h.recentObservations.length ? (
            <ul className="space-y-4">
              {h.recentObservations.map((o) => (
                <li key={o.id} className="grid grid-cols-[4.5rem_1fr] gap-3 text-sm">
                  <span className="tabular text-ink-3">{formatShortDate(o.date)}</span>
                  <div>
                    <p className="font-medium">{KIND_LABEL[o.kind] ?? o.kind}</p>
                    <p className="text-ink-2">{o.note}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No recent observations" body="Walk the field and add what you see — it makes every recommendation more reliable." />
          )}
          <div className="mt-5 flex items-center gap-4 border-t border-line/70 pt-4 text-label text-ink-3">
            <span className="inline-flex items-center gap-1">
              <Thermometer className="h-3.5 w-3.5" aria-hidden /> Weather: sample forecast
            </span>
            <span className="inline-flex items-center gap-1">
              <Droplets className="h-3.5 w-3.5" aria-hidden /> Moisture: field reading
            </span>
            <span className={cn('hidden items-center gap-1 sm:inline-flex')}>
              <Wind className="h-3.5 w-3.5" aria-hidden /> Wind {today?.windKmh ?? '—'} km/h
            </span>
          </div>
        </Reveal>
      </div>

      <Modal open={adding} onClose={() => setAdding(false)} title="Add a field observation">
        <ObservationForm
          onCancel={() => setAdding(false)}
          onSubmit={(o) => {
            farmDataService.addObservation({ farmId: ctx.farm.id, date: ctx.asOf, kind: o.kind, tag: o.tag, note: o.note, severity: o.severity });
            setAdding(false);
            toast('Observation saved', 'Crop health, risk and advice were recalculated.');
          }}
        />
      </Modal>
    </>
  );
}

export default function CropHealth() {
  return <WithFarm>{(ctx) => <CropBody ctx={ctx} />}</WithFarm>;
}
