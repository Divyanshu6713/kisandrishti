import type { Level } from './common';

/**
 * Live weather contracts (Open-Meteo). Kept separate from `WeatherSnapshot`, which is the
 * frozen sample forecast that drives the demo-farm scenario.
 */

/** A place the farmer picked, searched or located. Coordinates are rounded to ~1 km. */
export interface GeoPlace {
  /** Stable key for caching: rounded "lat,lon". */
  key: string;
  name: string;
  /** "District, State" when known. */
  region: string;
  lat: number;
  lon: number;
  source: 'default' | 'search' | 'pin' | 'device';
  /** Extra honesty note, e.g. "PIN 302001 · district centre". */
  note?: string;
}

export interface LiveCurrent {
  /** Local time at the location, ISO without offset (as returned by the API). */
  time: string;
  tempC: number;
  feelsLikeC: number;
  humidity: number;
  precipMm: number;
  rainMm: number;
  showersMm: number;
  code: number;
  windKmh: number;
  windDirDeg: number;
  isDay: boolean;
}

export interface LiveDay {
  date: string;
  tMax: number;
  tMin: number;
  precipMm: number;
  /** null when the provider has no probability for that day. */
  precipProb: number | null;
  sunrise: string;
  sunset: string;
  windMaxKmh: number;
  code: number;
}

export interface LiveWeather {
  placeKey: string;
  lat: number;
  lon: number;
  timezone: string;
  current: LiveCurrent;
  /** Today first (location-local), up to 7 days. */
  days: LiveDay[];
  /** Epoch ms when this browser received the response. */
  fetchedAt: number;
  provider: 'open-meteo';
}

/** Rule-based, informational reading of live weather values — not a prediction. */
export interface FarmerInsight {
  id: string;
  level: Level;
  title: string;
  detail: string;
  /** The exact API values the rule looked at. */
  factors: { label: string; value: string }[];
  /** The rule in plain words, e.g. "Rain probability ≥ 60% in the next 3 days". */
  rule: string;
}
