import { AnimatePresence, motion } from 'framer-motion';
import { ArrowDownRight, ArrowUpRight, Minus, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { RiskInputs, RiskKind, RiskResult } from '@/models';
import { cn, round } from '@/lib/utils';
import { riskPredictionService, type FarmContext } from '@/services';
import { ScenarioNote, WithFarm } from '@/components/farm/WithFarm';
import { RiskMeter } from '@/components/ui/gauges';
import { EASE, Reveal } from '@/components/ui/motion';
import { Pill, PageHeader, InsufficientData } from '@/components/ui/primitives';
import { SourceTags } from '@/components/ui/provenance';

const KIND_HINT: Record<RiskKind, string> = {
  disease: 'Fungal diseases favoured by the coming weather',
  pest: 'Insect build-up likely in these conditions',
  water: 'Soil moisture vs. what the crop needs now',
  environment: 'Heat, frost, heavy rain or strong wind',
};

function Slider({ id, label, unit, min, max, step, value, onChange }: { id: string; label: string; unit: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <label htmlFor={id} className="text-sm font-medium text-ink-2">
          {label}
        </label>
        <span className="tabular text-sm font-semibold">
          {value}
          {unit}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-sunken accent-[rgb(var(--accent))]"
      />
    </div>
  );
}

function RiskBody({ ctx }: { ctx: FarmContext }) {
  const base = ctx.riskInputs;
  const [inputs, setInputs] = useState<RiskInputs>(base);
  const [results, setResults] = useState<RiskResult[]>(ctx.risks);
  const [selected, setSelected] = useState<RiskKind>('disease');
  const simulated = JSON.stringify(inputs) !== JSON.stringify(base);

  // Farm context changed (e.g. a scan was saved) → reset to the farm's real inputs.
  useEffect(() => {
    setInputs(ctx.riskInputs);
    setResults(ctx.risks);
  }, [ctx]);

  useEffect(() => {
    if (!simulated) {
      setResults(ctx.risks);
      return;
    }
    let alive = true;
    const t = window.setTimeout(() => {
      riskPredictionService.predict(inputs, ctx.crop).then((r) => alive && setResults(r));
    }, 120);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [inputs, simulated, ctx]);

  const current = results.find((r) => r.kind === selected) ?? results[0];
  const set = <K extends keyof RiskInputs>(k: K, v: RiskInputs[K]) => setInputs((i) => ({ ...i, [k]: v }));
  const diseaseTags = useMemo(() => ['yellow-rust', 'leaf-rust', 'powdery-mildew', 'aphid'], []);
  const observed = inputs.recentObservationTags.some((t) => diseaseTags.includes(t));

  return (
    <>
      <ScenarioNote ctx={ctx} />
      <PageHeader
        eyebrow="Risk Intelligence"
        title="What could go wrong this week"
        description="Four risks estimated from the crop stage, the next days’ weather, soil moisture and what has been seen in the field."
      />

      <Reveal className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/70 px-5 py-3">
          <AnimatePresence mode="wait">
            <motion.div key={String(simulated)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {simulated ? <Pill tone="warn">Showing simulated conditions</Pill> : <Pill tone="good">Showing this farm’s current conditions</Pill>}
            </motion.div>
          </AnimatePresence>
          {simulated && (
            <button type="button" className="btn-ghost py-1.5 text-sm" onClick={() => setInputs(base)}>
              <RotateCcw className="h-4 w-4" aria-hidden /> Back to farm conditions
            </button>
          )}
        </div>
        <div role="tablist" aria-label="Risk type" className="grid grid-cols-2 lg:grid-cols-4">
          {results.map((r, i) => (
            <button
              key={r.kind}
              role="tab"
              type="button"
              aria-selected={selected === r.kind}
              onClick={() => setSelected(r.kind)}
              className={cn(
                'relative flex flex-col items-center px-4 pb-5 pt-6 text-center transition-colors hover:bg-sunken/40',
                i % 2 === 0 && 'border-r border-line/70',
                i < 2 && 'border-b border-line/70 lg:border-b-0',
                i === 1 && 'lg:border-r',
                selected === r.kind && 'bg-sunken/50',
              )}
            >
              <RiskMeter score={r.score} level={r.level} size={150} insufficient={r.status === 'insufficient'} />
              <span className="mt-2 font-semibold">{r.title}</span>
              <span className="mt-0.5 line-clamp-1 text-sm text-ink-3">{r.subject ?? KIND_HINT[r.kind]}</span>
              {selected === r.kind && <motion.span layoutId="risk-tab" className="absolute inset-x-6 bottom-0 h-0.5 rounded-full bg-accent" transition={{ duration: 0.35, ease: EASE }} />}
            </button>
          ))}
        </div>
      </Reveal>

      <div className="mt-5 grid gap-5 lg:grid-cols-12">
        <Reveal className="card card-pad lg:col-span-7">
          <AnimatePresence mode="wait">
            {current && (
              <motion.div key={current.kind + current.score} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3, ease: EASE }}>
                <p className="eyebrow">{current.title}</p>
                {current.status === 'insufficient' ? (
                  <div className="mt-3">
                    <InsufficientData missing={current.missing ?? []} message="Insufficient data for a reliable estimate." />
                  </div>
                ) : (
                  <>
                    <h2 className="mt-2 text-h2 text-balance">{current.headline}</h2>
                    <p className="mt-1 text-sm text-ink-3">{KIND_HINT[current.kind]}</p>
                    <p className="eyebrow mb-3 mt-6">Why the engine says this</p>
                    <ul className="space-y-2.5">
                      {current.drivers.map((d) => (
                        <li key={d.label} className="flex items-start gap-3 text-sm">
                          <span className={cn('mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full', d.effect === 'raises' ? 'bg-danger-soft text-danger' : d.effect === 'lowers' ? 'bg-accent-soft text-accent' : 'bg-sunken text-ink-3')}>
                            {d.effect === 'raises' ? <ArrowUpRight className="h-3 w-3" aria-label="raises risk" /> : d.effect === 'lowers' ? <ArrowDownRight className="h-3 w-3" aria-label="lowers risk" /> : <Minus className="h-3 w-3" />}
                          </span>
                          <span className="text-ink-2">{d.label}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
          <div className="mt-6 border-t border-line/70 pt-4">
            <p className="mb-2 text-label text-ink-3">Engine: {riskPredictionService.modelId} · transparent favourability rules standing in for the trained risk model</p>
            <SourceTags sources={['sample-forecast', 'demo-dataset', 'demo-rules']} />
          </div>
        </Reveal>

        <Reveal className="card card-pad lg:col-span-5" delay={0.05}>
          <div className="mb-5 flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-ink-3" aria-hidden />
            <h2 className="text-h3">What if…</h2>
          </div>
          <div className="space-y-5">
            <Slider id="t" label="Average temperature (next 3 days)" unit=" °C" min={0} max={40} step={1} value={round(inputs.temperatureC ?? 15)} onChange={(v) => set('temperatureC', v)} />
            <Slider id="h" label="Average humidity" unit="%" min={20} max={100} step={1} value={round(inputs.humidityPct ?? 60)} onChange={(v) => set('humidityPct', v)} />
            <Slider id="r" label="Rain in the next 7 days" unit=" mm" min={0} max={80} step={1} value={round(inputs.rainfallMm ?? 0)} onChange={(v) => set('rainfallMm', v)} />
            <Slider id="m" label="Soil moisture" unit="%" min={5} max={45} step={1} value={round(inputs.soilMoisturePct ?? 20)} onChange={(v) => set('soilMoisturePct', v)} />
            <div>
              <label htmlFor="stage" className="mb-2 block text-sm font-medium text-ink-2">
                Crop stage
              </label>
              <select id="stage" className="field" value={inputs.stageId ?? ''} onChange={(e) => set('stageId', e.target.value)}>
                {ctx.crop.stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-ctl border border-line px-4 py-3 text-sm">
              <span>A disease or pest was seen in the field recently</span>
              <input
                type="checkbox"
                className="h-4 w-4 accent-[rgb(var(--accent))]"
                checked={observed}
                onChange={(e) =>
                  set('recentObservationTags', e.target.checked ? [...inputs.recentObservationTags, 'yellow-rust', 'aphid'] : inputs.recentObservationTags.filter((t) => !diseaseTags.includes(t)))
                }
              />
            </label>
          </div>
          <p className="mt-5 text-label text-ink-3">The simulator calls the same risk service the rest of the app uses — replacing the engine with a trained model changes these results everywhere.</p>
        </Reveal>
      </div>
    </>
  );
}

export default function Risk() {
  return <WithFarm>{(ctx) => <RiskBody ctx={ctx} />}</WithFarm>;
}
