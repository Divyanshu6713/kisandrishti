import { ImageUp, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import type { PredictionResult } from '@/models/mlAdmin';
import { mlAdminApi } from '@/services/mlAdmin/api';
import { SectionTitle } from '@/components/ui/primitives';
import { PredictionView } from './PredictionView';
import { ErrorNote, Loading, errorMessage, fmtPct, useAdminData } from './shared';

const ACCEPT = ['image/jpeg', 'image/png', 'image/webp'];

export default function TestPrediction() {
  const [params] = useSearchParams();
  const { data, error, loading } = useAdminData(() => mlAdminApi.models(), []);
  const [modelId, setModelId] = useState(params.get('model') ?? '');
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<PredictionResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const usable = (data?.models ?? []).filter((m) => m.status === 'ready' || m.status === 'deployed');
  useEffect(() => {
    if (!modelId && usable.length) setModelId(data?.active?.model_id ?? usable[0].id);
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  const run = async (file: File | undefined) => {
    if (!file) return;
    setErr(null);
    setResult(null);
    if (!ACCEPT.includes(file.type)) return setErr('Use a JPG, PNG or WebP image.');
    setPreview(URL.createObjectURL(file));
    setBusy(true);
    try {
      setResult(await mlAdminApi.testPredict(modelId, file));
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorNote>{errorMessage(error)}</ErrorNote>;
  if (usable.length === 0) return <p className="card card-pad text-sm text-ink-2">No evaluated model is available to test yet.</p>;

  return (
    <div className="grid gap-5 lg:grid-cols-12">
      <section className="card card-pad lg:col-span-4">
        <SectionTitle title="Test an unseen image" hint="Runs the selected model with its own saved preprocessing — the same code path farmers use. The image is not stored." />
        <label htmlFor="tp-model" className="field-label">Model</label>
        <select id="tp-model" className="field" value={modelId} onChange={(e) => { setModelId(e.target.value); setResult(null); }}>
          {usable.map((m) => (
            <option key={m.id} value={m.id}>
              v{m.version} · {m.architecture} · test acc. {fmtPct(m.test_accuracy)}{m.is_active ? ' · in production' : ''}
            </option>
          ))}
        </select>
        <button type="button" className="btn-primary mt-4 w-full" onClick={() => input.current?.click()} disabled={busy || !modelId}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ImageUp className="h-4 w-4" aria-hidden />} Choose image
        </button>
        <input ref={input} type="file" accept={ACCEPT.join(',')} className="sr-only" aria-label="Test image" onChange={(e) => void run(e.target.files?.[0])} />
        <p className="mt-3 text-label text-ink-3">Use photos that were not in the training data, including hard cases (blurry, other crops, soil) to see how the uncertainty threshold behaves.</p>
      </section>
      <section className="card card-pad lg:col-span-8" aria-live="polite">
        {err && <ErrorNote>{err}</ErrorNote>}
        {busy && <Loading label="Running the model…" />}
        {result && <PredictionView result={result} preview={preview ?? undefined} />}
        {!err && !busy && !result && <p className="text-sm text-ink-3">The prediction, top-3 probabilities, model and dataset version, and inference time will appear here.</p>}
      </section>
    </div>
  );
}
