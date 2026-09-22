import type { Basis } from '@/models';
import { INSUFFICIENT_MESSAGE } from '@/models';
import { formatShortDate } from '@/lib/utils';
import { serviceConfig } from './config';
import type { FarmContext } from './farmContextService';

/**
 * Farm assistant.
 *   question → intent → farm context (from farmContextService) → knowledge/services → answer
 * The rule-based provider only answers from this farm's data. A remote provider (our own
 * model / LLM with retrieval) receives the same compact context via `buildAssistantContext`.
 */

export type Intent = 'crop-health' | 'soil-organic' | 'disease-risk' | 'today' | 'water' | 'weather' | 'pest' | 'unknown';

export interface AssistantAnswer {
  intent: Intent;
  paragraphs: string[];
  bullets: string[];
  basis: Basis;
  followUps: string[];
}

export interface AssistantProvider {
  id: string;
  answer(question: string, ctx: FarmContext): Promise<AssistantAnswer>;
}

const INTENTS: [Intent, RegExp][] = [
  ['today', /\b(today|check|should i do|to ?do|aaj|plan)\b/i],
  ['crop-health', /(crop health|health|decreas|declin|pale|yellowing|weak|fasal)/i],
  ['disease-risk', /(disease|rust|fung|blight|mildew|bimari|rog)/i],
  ['pest', /(pest|aphid|insect|keet|keeda|bug)/i],
  ['soil-organic', /(organic|compost|manure|soil|improve|khad|mitti|fertili|nitrogen|carbon|biofert)/i],
  ['water', /(water|irrigat|paani|moisture|dry)/i],
  ['weather', /(weather|mausam|temperature|humid|fog|rain|forecast)/i],
];

export const SUGGESTED_QUESTIONS = [
  'Why is my crop health decreasing?',
  'What organic input can improve my soil?',
  'What is the current disease risk?',
  'What should I check today?',
];

export function detectIntent(q: string): Intent {
  return INTENTS.find(([, re]) => re.test(q))?.[0] ?? 'unknown';
}

/** Compact, model-friendly context — what a remote assistant would receive. */
export function buildAssistantContext(ctx: FarmContext) {
  return {
    farm: { name: ctx.farm.name, crop: ctx.crop.name, variety: ctx.farm.variety, method: ctx.farm.method, areaAcres: ctx.farm.areaAcres, soilType: ctx.farm.soilType },
    asOf: ctx.asOf,
    stage: ctx.growth.stage?.name ?? null,
    daysAfterSowing: ctx.growth.daysAfterSowing,
    cropHealth: { score: ctx.cropHealth.score, status: ctx.cropHealth.status, signals: ctx.cropHealth.signals.map((s) => s.label) },
    soil: ctx.soilReport ? { score: ctx.soilReport.score, deficiencies: ctx.soilReport.deficiencies.map((d) => `${d.label}: ${d.value} ${d.unit}`) } : null,
    risks: ctx.risks.map((r) => ({ kind: r.kind, level: r.status === 'ok' ? r.level : 'unknown', subject: r.subject })),
    advice: ctx.advice.items.map((i) => ({ title: i.title, priority: i.priority })),
  };
}

const riskOf = (ctx: FarmContext, kind: string) => ctx.risks.find((r) => r.kind === kind);

const ruleProvider: AssistantProvider = {
  id: 'kd-assistant-rules-v0',
  async answer(question, ctx) {
    const intent = detectIntent(question);
    const crop = ctx.crop.name.toLowerCase();
    const stage = ctx.growth.stage?.name.toLowerCase() ?? 'unknown stage';
    const baseFactors = [
      { label: 'Farm', value: ctx.farm.name },
      { label: 'Crop', value: `${ctx.crop.name} · ${ctx.growth.stage?.name ?? '—'}` },
    ];

    switch (intent) {
      case 'crop-health': {
        const h = ctx.cropHealth;
        const weekly = ctx.history?.weekly ?? [];
        const prev = weekly[weekly.length - 1];
        const negatives = h.signals.filter((s) => s.tone !== 'good');
        return {
          intent,
          paragraphs: [
            `Crop health on ${ctx.farm.name} is ${h.score}/100 (${h.statusLabel.toLowerCase()})${prev ? `, down from ${prev.cropHealth} in the week of ${formatShortDate(prev.week)}` : ''}.`,
            negatives.length ? 'These signals are pulling it down:' : 'No negative signals are recorded right now.',
          ],
          bullets: negatives.map((s) => `${s.label} — ${s.detail} (${s.source})`),
          basis: { factors: [...baseFactors, { label: 'Signals', value: String(h.signals.length) }], sources: ['demo-dataset', 'demo-rules'] },
          followUps: ['What organic input can improve my soil?', 'What should I check today?'],
        };
      }
      case 'soil-organic': {
        if (!ctx.soilReport) {
          return {
            intent,
            paragraphs: [INSUFFICIENT_MESSAGE, 'There is no soil test for this farm yet. Add one on the Soil page and I can suggest organic inputs based on it.'],
            bullets: [],
            basis: { factors: baseFactors, sources: ['demo-rules'] },
            followUps: ['What should I check today?'],
          };
        }
        const items = ctx.organic.status === 'ok' ? ctx.organic.data.items : [];
        const now = items.filter((i) => i.when === 'now' && i.practice.category !== 'protection').slice(0, 3);
        const later = items.filter((i) => i.when === 'next-season').slice(0, 2);
        return {
          intent,
          paragraphs: [
            `Your soil test (${formatShortDate(ctx.soilReport.testDate)}) shows ${ctx.soilReport.deficiencies.map((d) => `${d.label.toLowerCase()} ${d.band.label.toLowerCase()}`).join(', ') || 'no major deficiencies'}.`,
            `For ${crop} at ${stage}, these organic options fit now:`,
          ],
          bullets: [
            ...now.map((i) => `${i.practice.name} — ${i.practice.summary}`),
            ...later.map((i) => `Next season: ${i.practice.name}`),
          ],
          basis: { factors: [...baseFactors, { label: 'Soil test', value: ctx.soilReport.testDate }], sources: ['demo-dataset', 'reference-ranges', 'demo-rules'], note: 'Quantities depend on your soil test and local recommendation.' },
          followUps: ['Why is my crop health decreasing?', 'What is the current disease risk?'],
        };
      }
      case 'disease-risk': {
        const r = riskOf(ctx, 'disease');
        if (!r || r.status !== 'ok')
          return { intent, paragraphs: [INSUFFICIENT_MESSAGE, `Missing: ${r?.missing?.join(', ') ?? 'weather data'}.`], bullets: [], basis: { factors: baseFactors, sources: ['demo-rules'] }, followUps: [] };
        return {
          intent,
          paragraphs: [`Disease risk is ${r.level.toUpperCase()} (${r.score}/100). ${r.headline}.`, 'Why:'],
          bullets: r.drivers.map((d) => d.label),
          basis: { factors: [...baseFactors, { label: 'Weather', value: ctx.weather?.source === 'sample-forecast' ? 'Sample forecast' : 'Live' }], sources: ['sample-forecast', 'demo-rules'] },
          followUps: ['What should I check today?', 'What organic input can improve my soil?'],
        };
      }
      case 'pest': {
        const r = riskOf(ctx, 'pest');
        if (!r || r.status !== 'ok') return { intent, paragraphs: [INSUFFICIENT_MESSAGE], bullets: [], basis: { factors: baseFactors, sources: ['demo-rules'] }, followUps: [] };
        return {
          intent,
          paragraphs: [`Pest risk is ${r.level} (${r.score}/100) — ${r.headline}.`],
          bullets: r.drivers.map((d) => d.label),
          basis: { factors: baseFactors, sources: ['demo-rules'] },
          followUps: ['What should I check today?'],
        };
      }
      case 'water': {
        const r = riskOf(ctx, 'water');
        if (!r || r.status !== 'ok' || !ctx.moisture)
          return { intent, paragraphs: [INSUFFICIENT_MESSAGE, 'Add a recent soil moisture reading to get water advice.'], bullets: [], basis: { factors: baseFactors, sources: ['demo-rules'] }, followUps: [] };
        const rec = ctx.advice.items.find((i) => i.category === 'water');
        return {
          intent,
          paragraphs: [`Water stress is ${r.level} (${r.score}/100). Soil moisture was ${ctx.moisture.pct}% on ${formatShortDate(ctx.moisture.date)}.`, rec ? rec.action : r.headline],
          bullets: r.drivers.map((d) => d.label),
          basis: { factors: [...baseFactors, { label: 'Moisture', value: `${ctx.moisture.pct}%` }], sources: ['demo-dataset', 'sample-forecast', 'demo-rules'] },
          followUps: ['What is the current disease risk?'],
        };
      }
      case 'weather': {
        if (!ctx.weather) return { intent, paragraphs: [INSUFFICIENT_MESSAGE], bullets: [], basis: { factors: baseFactors, sources: ['demo-rules'] }, followUps: [] };
        return {
          intent,
          paragraphs: [`Now: ${ctx.weather.current.tempC} °C, ${ctx.weather.current.humidity}% humidity (${ctx.weather.sourceNote})`, 'What it means for your farm:'],
          bullets: ctx.implications.map((i) => i.title),
          basis: { factors: baseFactors, sources: [ctx.weather.source, 'demo-rules'] },
          followUps: ['What is the current disease risk?'],
        };
      }
      case 'today': {
        const items = ctx.advice.items.slice(0, 4);
        return {
          intent,
          paragraphs: [items.length ? `For ${ctx.farm.name} today (${formatShortDate(ctx.asOf)}), in order of priority:` : 'Nothing urgent today. Keep your regular scouting routine.'],
          bullets: items.map((i) => `${i.title} — ${i.nextStep}`),
          basis: { factors: [...baseFactors, { label: 'Advisor items', value: String(ctx.advice.items.length) }], sources: ['demo-dataset', 'sample-forecast', 'demo-rules'] },
          followUps: ['Why is my crop health decreasing?', 'What is the current disease risk?'],
        };
      }
      default:
        return {
          intent: 'unknown',
          paragraphs: [
            'I can only answer from this farm’s data, and I don’t have enough to answer that reliably.',
            'Try asking about crop health, soil and organic inputs, disease or pest risk, water, weather, or today’s checks.',
          ],
          bullets: [],
          basis: { factors: baseFactors, sources: ['demo-rules'] },
          followUps: SUGGESTED_QUESTIONS,
        };
    }
  },
};

const remoteProvider: AssistantProvider = {
  id: 'kd-assistant-remote',
  async answer(question, ctx) {
    const res = await fetch(`${serviceConfig.apiBase}/v1/assistant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, context: buildAssistantContext(ctx) }),
    });
    if (!res.ok) throw new Error(`Assistant API failed (${res.status})`);
    return (await res.json()) as AssistantAnswer;
  },
};

const provider = serviceConfig.assistant === 'remote' ? remoteProvider : ruleProvider;

export const assistantService = {
  providerId: provider.id,
  ask: (question: string, ctx: FarmContext) => provider.answer(question.trim(), ctx),
};
