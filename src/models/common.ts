/**
 * Shared contracts. Every analysis output carries a `Basis` so the UI can always show
 * *why* a result was produced and *where* the underlying knowledge came from.
 */

export type Level = 'low' | 'medium' | 'high';
export type Tone = 'good' | 'ok' | 'warn' | 'bad' | 'neutral';

/** Where a piece of knowledge or a number came from. Shown to the user as a provenance tag. */
export type SourceTag =
  | 'user-input' //        entered by the farmer
  | 'demo-dataset' //      bundled sample farm records (not a real farm)
  | 'reference-ranges' //  published soil-test category ranges (Soil Health Card style)
  | 'demo-rules' //        hand-written prototype rules — to be replaced by the trained model
  | 'sample-forecast' //   bundled sample weather, not live
  | 'live-weather' //      live API (only when enabled)
  | 'growing-guide' //     general container-growing guidance from cited extension sources
  | 'model-api'; //        our trained model / backend (future)

export interface BasisFactor {
  label: string;
  value: string;
}

export interface Basis {
  factors: BasisFactor[];
  sources: SourceTag[];
  note?: string;
}

/** Result wrapper: services must say "not enough data" instead of inventing precision. */
export type Analysis<T> =
  | { status: 'ok'; data: T; basis: Basis }
  | { status: 'insufficient'; missing: string[]; message: string };

export const INSUFFICIENT_MESSAGE = 'Insufficient data for a reliable recommendation.';

export function insufficient<T>(missing: string[], message = INSUFFICIENT_MESSAGE): Analysis<T> {
  return { status: 'insufficient', missing, message };
}

export function levelFromScore(score: number): Level {
  if (score >= 66) return 'high';
  if (score >= 36) return 'medium';
  return 'low';
}
