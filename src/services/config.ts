/**
 * Central switchboard for where data and intelligence come from.
 *
 *   VITE_DATA_SOURCE   = local | rest     (knowledge + farm records)
 *   VITE_API_BASE      = https://api.example.com   (FastAPI / cloud backend)
 *   VITE_DISEASE_MODEL = demo | remote    (image classifier)
 *   VITE_RISK_MODEL    = demo | remote    (risk prediction)
 *   VITE_ASSISTANT     = rules | remote   (farm assistant)
 *
 * Nothing in the UI reads these directly — only the service layer does.
 */
type Env = Record<string, string | undefined>;
const env = import.meta.env as unknown as Env;

export const serviceConfig = {
  dataSource: (env.VITE_DATA_SOURCE ?? 'local') as 'local' | 'rest',
  apiBase: env.VITE_API_BASE ?? '',
  diseaseModel: (env.VITE_DISEASE_MODEL ?? 'demo') as 'demo' | 'remote',
  riskModel: (env.VITE_RISK_MODEL ?? 'demo') as 'demo' | 'remote',
  assistant: (env.VITE_ASSISTANT ?? 'rules') as 'rules' | 'remote',
  /** Small artificial delay so loading states are visible in demo mode (0 in production). */
  demoLatencyMs: Number(env.VITE_DEMO_LATENCY ?? 260),
};

/** Honest label for the analysis engine that produced every result on screen. */
export const ENGINE = {
  id: 'kd-rules-v0',
  name: 'Demo rule engine',
  trained: false,
  description:
    'Transparent, hand-written rules over sample data. It stands in for the Kisan Drishti models, which will be trained on our own agricultural dataset.',
} as const;
