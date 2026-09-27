import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { PredictionResult } from '@/models/mlAdmin';
import { KV, fmtPct } from './shared';

/** Admin view of one real model prediction: top-3 probabilities straight from the model output. */
export function PredictionView({ result, preview }: { result: PredictionResult; preview?: string }) {
  const p = result.prediction;
  return (
    <div className="flex flex-col gap-5 sm:flex-row">
      {preview && <img src={preview} alt="Image sent to the model" className="h-40 w-40 shrink-0 rounded-ctl border border-line object-cover" />}
      <div className="min-w-0 flex-1 space-y-4">
        <div>
          {result.uncertain ? (
            <p className="flex items-center gap-2 text-sm font-semibold text-warn">
              <AlertTriangle className="h-4 w-4" aria-hidden /> Uncertain — below the {fmtPct(result.threshold, 0)} confidence threshold
            </p>
          ) : (
            <p className="flex items-center gap-2 text-sm font-semibold text-accent">
              <CheckCircle2 className="h-4 w-4" aria-hidden /> Above the {fmtPct(result.threshold, 0)} confidence threshold
            </p>
          )}
          <p className="eyebrow mt-3">{result.uncertain ? 'Possible match' : 'Prediction'}</p>
          <h3 className="text-h2">{p.display_name}</h3>
          <p className="text-sm text-ink-3">
            Confidence {fmtPct(p.confidence)} · class ID <code>{p.class_id}</code>
          </p>
        </div>
        <div>
          <p className="eyebrow mb-2">Top {result.top_predictions.length} predictions</p>
          <ul className="space-y-2">
            {result.top_predictions.map((t) => (
              <li key={t.class_id}>
                <div className="mb-1 flex justify-between gap-3 text-sm">
                  <span className="truncate">{t.display_name}</span>
                  <span className="tabular font-semibold">{fmtPct(t.probability)}</span>
                </div>
                <div className="h-1.5 rounded-full bg-sunken" aria-hidden>
                  <div className="h-1.5 rounded-full bg-accent/80" style={{ width: `${Math.max(1, t.probability * 100)}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </div>
        <KV
          rows={[
            ['Model', `${result.model.name} v${result.model.model_version} (${result.model.architecture})`],
            ['Dataset', result.model.dataset_name ? `${result.model.dataset_name} v${result.model.dataset_version}` : 'Not available'],
            ['Inference time', `${result.metadata.inference_ms} ms (server, forward pass)`],
            ['Input', `${result.metadata.image.width}×${result.metadata.image.height} px → ${result.metadata.input_size}×${result.metadata.input_size} px`],
          ]}
        />
        <p className="text-label text-ink-3">{result.notice}</p>
      </div>
    </div>
  );
}
