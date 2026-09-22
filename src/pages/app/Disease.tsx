import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Check, Cpu, ImageUp, Loader2, NotebookPen, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState, type DragEvent } from 'react';
import { Link } from 'react-router';
import type { Analysis, DiseaseAnalysisResult } from '@/models';
import { cn } from '@/lib/utils';
import { DISEASE_SAMPLES, diseaseAnalysisService, farmDataService, ImageInputError, PIPELINE_STEPS, type FarmContext } from '@/services';
import { toast } from '@/state/toastStore';
import { ScenarioNote, WithFarm } from '@/components/farm/WithFarm';
import { RecommendationCard } from '@/components/farm/RecommendationCard';
import { Progress } from '@/components/ui/gauges';
import { EASE, Reveal, stagger } from '@/components/ui/motion';
import { Disclosure, InsufficientData, LevelBadge, PageHeader, Pill } from '@/components/ui/primitives';
import { SourceTags } from '@/components/ui/provenance';
import { drawLeaf, type LeafArt } from '@/features/disease/leafArt';

type Run = { phase: 'idle' } | { phase: 'running'; step: number; preview?: string } | { phase: 'error'; message: string } | { phase: 'done'; result: Analysis<DiseaseAnalysisResult>; preview: string; sampleId?: string };

const LABELS: Record<string, string> = { healthy: 'Healthy leaf', unidentified: 'Not identified' };

function Pipeline({ step, done }: { step: number; done: boolean }) {
  return (
    <ol className="space-y-2.5" aria-label="Analysis pipeline">
      {PIPELINE_STEPS.map((s, i) => {
        const state = done || i < step ? 'done' : i === step ? 'active' : 'todo';
        return (
          <li key={s} className="flex items-center gap-3 text-sm">
            <span className={cn('grid h-6 w-6 shrink-0 place-items-center rounded-full border transition-colors duration-300', state === 'done' ? 'border-accent bg-accent text-accent-ink' : state === 'active' ? 'border-accent text-accent' : 'border-line text-ink-3')}>
              {state === 'done' ? <Check className="h-3.5 w-3.5" aria-hidden /> : state === 'active' ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <span className="text-[10px] font-semibold">{i + 1}</span>}
            </span>
            <span className={cn(state === 'todo' ? 'text-ink-3' : 'text-ink')}>{s}</span>
            {i === 3 && <span className="ml-auto text-label text-ink-3">{diseaseAnalysisService.usesTrainedModel ? 'trained model' : 'demo classifier'}</span>}
          </li>
        );
      })}
    </ol>
  );
}

function ResultView({ run, ctx, onReset }: { run: Extract<Run, { phase: 'done' }>; ctx: FarmContext; onReset: () => void }) {
  const [saved, setSaved] = useState(false);
  const res = run.result;
  if (res.status === 'insufficient')
    return (
      <div className="space-y-4">
        <img src={run.preview} alt="Photo that was analysed" className="h-40 w-40 rounded-ctl object-cover" />
        <InsufficientData missing={res.missing} message={res.message} action={<button type="button" className="btn-secondary" onClick={onReset}>Try another photo</button>} />
      </div>
    );
  const r = res.data;
  const title = r.disease?.name ?? LABELS[r.prediction.label] ?? r.prediction.label;
  const score = r.prediction.score;

  const save = () => {
    if (!r.disease) return;
    farmDataService.addObservation({
      farmId: ctx.farm.id,
      date: ctx.asOf,
      kind: 'disease-scan',
      tag: r.disease.tag,
      note: `Leaf scan matched ${r.disease.name}${r.prediction.simulated ? ' (demo sample, simulated score)' : ''}`,
      severity: 'medium',
    });
    setSaved(true);
    toast('Saved to field log', 'Disease risk, crop health and advice now include this scan.');
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: EASE }}>
      <div className="flex flex-col gap-5 sm:flex-row">
        <div className="shrink-0">
          <img src={run.preview} alt="Leaf photo after resizing to the model input" className="h-36 w-36 rounded-ctl border border-line object-cover" />
          <p className="mt-1.5 text-center text-label text-ink-3">224 × 224 input</p>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {r.prediction.simulated && <Pill tone="warn">{run.sampleId ? 'Demo sample · simulated score' : 'No trained model connected'}</Pill>}
            {r.disease && <LevelBadge level={r.riskLevel} prefix="Risk" />}
          </div>
          <h2 className="mt-3 text-h2">{title}</h2>
          {r.disease && <p className="text-sm text-ink-3">{r.disease.cause}</p>}
          {score !== null ? (
            <div className="mt-4 max-w-xs">
              <div className="mb-1.5 flex justify-between text-sm">
                <span className="text-ink-2">{r.prediction.simulated ? 'Simulated score' : 'Model confidence'}</span>
                <span className="tabular font-semibold">{Math.round(score * 100)}%</span>
              </div>
              <Progress value={score * 100} tone={r.isHealthy ? 'good' : 'warn'} />
            </div>
          ) : (
            <p className="mt-3 max-w-md text-sm text-ink-2">{r.observedPattern}</p>
          )}
        </div>
      </div>

      {r.disease && (
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <div>
            <p className="eyebrow mb-2">Symptoms to confirm</p>
            <ul className="space-y-1.5 text-sm text-ink-2">
              {r.disease.symptoms.map((s) => (
                <li key={s} className="flex gap-2">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-ink-3" aria-hidden />
                  {s}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="eyebrow mb-2">Favoured by</p>
            <p className="text-sm text-ink-2">{r.disease.favourable}</p>
          </div>
        </div>
      )}

      {r.isHealthy && <p className="mt-5 rounded-ctl bg-accent-soft/60 px-4 py-3 text-sm text-ink-2">No disease pattern in this sample. Keep scouting — current weather still matters.</p>}

      <ul className="mt-5 space-y-1 text-label text-ink-3">
        {r.caveats.map((c) => (
          <li key={c}>· {c}</li>
        ))}
      </ul>

      <Disclosure summary="Measured image features (real, computed in your browser)" className="mt-5 border-t border-line/70 pt-4">
        <p className="mb-3 text-sm text-ink-2">{r.observedPattern}</p>
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          {(
            [
              ['Green', r.features.green],
              ['Yellow', r.features.yellow],
              ['Brown / orange', r.features.brown],
              ['Whitish', r.features.pale],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="rounded-ctl bg-sunken/60 p-3">
              <p className="text-label text-ink-3">{k}</p>
              <p className="tabular font-semibold">{Math.round(v * 100)}%</p>
            </div>
          ))}
        </div>
        {r.prediction.alternatives.length > 0 && (
          <p className="mt-3 text-sm text-ink-3">Other candidates: {r.prediction.alternatives.map((a) => `${a.label} ${Math.round(a.score * 100)}%`).join(' · ')}</p>
        )}
        <SourceTags className="mt-3" sources={res.basis.sources} />
      </Disclosure>

      {r.recommendations.length > 0 && (
        <motion.div variants={stagger} initial="hidden" animate="show" className="mt-8 grid gap-4">
          {r.recommendations.map((rec) => (
            <RecommendationCard key={rec.id} rec={rec} farmId={ctx.farm.id} showPlan={false} />
          ))}
        </motion.div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {r.disease && (
          <button type="button" className={saved ? 'btn bg-accent-soft text-accent' : 'btn-primary'} onClick={save} disabled={saved}>
            {saved ? <Check className="h-4 w-4" aria-hidden /> : <NotebookPen className="h-4 w-4" aria-hidden />}
            {saved ? 'Saved to field log' : 'Save to field log'}
          </button>
        )}
        {saved && (
          <Link to="/app/risk" className="btn-secondary">
            See updated risk <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        )}
        <button type="button" className="btn-ghost" onClick={onReset}>
          <RotateCcw className="h-4 w-4" aria-hidden /> New analysis
        </button>
      </div>
    </motion.div>
  );
}

function DiseaseBody({ ctx }: { ctx: FarmContext }) {
  const [run, setRun] = useState<Run>({ phase: 'idle' });
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const samples = DISEASE_SAMPLES.filter((s) => s.crop === ctx.crop.id);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});

  useEffect(() => {
    const t: Record<string, string> = {};
    samples.forEach((s) => (t[s.id] = drawLeaf(s.art as LeafArt, 360)));
    setThumbs(t);
  }, [ctx.crop.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const analyse = async (src: File | string, sampleId?: string) => {
    try {
      setRun({ phase: 'running', step: 0 });
      const tick = (step: number, preview?: string) => setRun({ phase: 'running', step, preview });
      await new Promise((r) => setTimeout(r, 350));
      tick(1);
      const image = await diseaseAnalysisService.preprocess(src, sampleId);
      tick(2, image.previewUrl);
      await new Promise((r) => setTimeout(r, 400));
      tick(3, image.previewUrl);
      const result = await diseaseAnalysisService.analyze({ image, farm: ctx.farm, crop: ctx.crop, risks: ctx.risks });
      tick(4, image.previewUrl);
      await new Promise((r) => setTimeout(r, 350));
      setRun({ phase: 'done', result, preview: image.previewUrl, sampleId });
    } catch (e) {
      setRun({ phase: 'error', message: e instanceof ImageInputError ? e.message : 'Analysis failed. Please try again.' });
    }
  };

  const onFiles = (files: FileList | null) => {
    const f = files?.[0];
    if (f) analyse(f);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    onFiles(e.dataTransfer.files);
  };

  return (
    <>
      <ScenarioNote ctx={ctx} />
      <PageHeader eyebrow="Disease Analysis" title="Check a leaf" description="Upload a close-up photo of one leaf, or pick a demo sample. You’ll see each step of the analysis." />

      <Reveal className="mb-6 flex items-start gap-3 rounded-card border border-line bg-sunken/50 p-4 text-sm">
        <Cpu className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" aria-hidden />
        <p className="text-ink-2">
          <span className="font-semibold text-ink">No trained disease model is connected yet.</span> Preprocessing and colour measurement run for real. The demo classifier returns reference labels for the bundled samples only — the Kisan Drishti model will plug into the same step.
        </p>
      </Reveal>

      <div className="grid gap-5 lg:grid-cols-12">
        <div className="flex flex-col gap-5 lg:col-span-5">
          <Reveal className="card card-pad">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={onDrop}
              className={cn('flex flex-col items-center rounded-card border-2 border-dashed px-6 py-10 text-center transition-colors', drag ? 'border-accent bg-accent-soft/40' : 'border-line')}
            >
              <ImageUp className="h-8 w-8 text-ink-3" aria-hidden />
              <p className="mt-3 font-semibold">Drop a leaf photo here</p>
              <p className="text-sm text-ink-3">JPG, PNG or WebP · up to 8 MB</p>
              <button type="button" className="btn-secondary mt-4" onClick={() => input.current?.click()} disabled={run.phase === 'running'}>
                Choose photo
              </button>
              <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => onFiles(e.target.files)} aria-label="Upload leaf photo" />
            </div>
          </Reveal>
          <Reveal className="card card-pad" delay={0.05}>
            <p className="eyebrow mb-3">Or try a demo sample</p>
            <div className="grid grid-cols-2 gap-3">
              {samples.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  disabled={run.phase === 'running'}
                  onClick={() => analyse(thumbs[s.id], s.id)}
                  className="group overflow-hidden rounded-ctl border border-line text-left transition-all hover:-translate-y-0.5 hover:shadow-lift disabled:opacity-60"
                >
                  {thumbs[s.id] ? <img src={thumbs[s.id]} alt={`Illustrated sample: ${s.title}`} className="aspect-square w-full object-cover transition-transform duration-500 group-hover:scale-105" /> : <div className="aspect-square bg-sunken" />}
                  <span className="block px-3 py-2 text-sm font-medium">{s.title}</span>
                </button>
              ))}
            </div>
            <p className="mt-3 text-label text-ink-3">Samples are illustrations with a reference label, for demonstration only.</p>
          </Reveal>
        </div>

        <section className="card card-pad min-h-[420px] lg:col-span-7" aria-live="polite">
          <AnimatePresence mode="wait">
            {run.phase === 'idle' && (
              <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col">
                <p className="eyebrow mb-4">How the analysis works</p>
                <Pipeline step={-1} done={false} />
                <p className="mt-6 max-w-sm text-sm text-ink-3">Results always show a confidence (or say none is available), what to look for in the field, and what to do next.</p>
              </motion.div>
            )}
            {run.phase === 'running' && (
              <motion.div key="running" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-6 sm:flex-row sm:items-center">
                <div className="relative h-40 w-40 shrink-0 overflow-hidden rounded-ctl bg-sunken">
                  {run.preview && <img src={run.preview} alt="" className="h-full w-full object-cover" />}
                  <motion.span className="absolute inset-x-0 h-8 bg-gradient-to-b from-transparent via-accent/35 to-transparent" animate={{ top: ['-20%', '100%'] }} transition={{ duration: 1.3, repeat: Infinity, ease: 'linear' }} aria-hidden />
                </div>
                <Pipeline step={run.step} done={false} />
              </motion.div>
            )}
            {run.phase === 'error' && (
              <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <InsufficientData missing={[]} message={run.message} action={<button type="button" className="btn-secondary" onClick={() => setRun({ phase: 'idle' })}>Try again</button>} />
              </motion.div>
            )}
            {run.phase === 'done' && (
              <motion.div key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <ResultView run={run} ctx={ctx} onReset={() => setRun({ phase: 'idle' })} />
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </div>
    </>
  );
}

export default function Disease() {
  return <WithFarm>{(ctx) => <DiseaseBody ctx={ctx} />}</WithFarm>;
}
