import type { LiveDay, LiveWeather } from '@/models';
import { fetchJson, HttpError, isNum, isObj, isStr } from './http';

/**
 * Open-Meteo forecast API (free, no key, CC BY 4.0 — attribution shown in the UI).
 * https://open-meteo.com/en/docs
 */
export const FORECAST_ENDPOINT = 'https://api.open-meteo.com/v1/forecast';

const CURRENT = [
  'temperature_2m',
  'relative_humidity_2m',
  'apparent_temperature',
  'precipitation',
  'rain',
  'showers',
  'weather_code',
  'wind_speed_10m',
  'wind_direction_10m',
  'is_day',
];
const DAILY = [
  'temperature_2m_max',
  'temperature_2m_min',
  'precipitation_sum',
  'precipitation_probability_max',
  'sunrise',
  'sunset',
  'wind_speed_10m_max',
  'weather_code',
];

export const DAYS_SHOWN = 7;

export function forecastUrl(lat: number, lon: number): string {
  const q = new URLSearchParams({
    latitude: lat.toFixed(2),
    longitude: lon.toFixed(2),
    current: CURRENT.join(','),
    daily: DAILY.join(','),
    timezone: 'auto',
    temperature_unit: 'celsius',
    wind_speed_unit: 'kmh',
    precipitation_unit: 'mm',
    // one extra day: right after local midnight the daily series can still start "yesterday"
    forecast_days: String(DAYS_SHOWN + 1),
  });
  return `${FORECAST_ENDPOINT}?${q}`;
}

const num = (v: unknown) => {
  if (!isNum(v)) throw new HttpError('invalid');
  return v;
};
const optNum = (v: unknown) => (isNum(v) ? v : null);
const arr = (o: Record<string, unknown>, k: string, len: number) => {
  const a = o[k];
  if (!Array.isArray(a) || a.length !== len) throw new HttpError('invalid');
  return a as unknown[];
};

/** Validates the response shape; anything unexpected is rejected rather than shown. */
export function parseForecast(raw: unknown, placeKey: string, fetchedAt: number): LiveWeather {
  if (!isObj(raw) || !isObj(raw.current) || !isObj(raw.daily)) throw new HttpError('invalid');
  const c = raw.current;
  const d = raw.daily;
  if (!isStr(c.time) || !Array.isArray(d.time)) throw new HttpError('invalid');
  const n = d.time.length;
  const time = arr(d, 'time', n);
  const cols = Object.fromEntries(DAILY.map((k) => [k, arr(d, k, n)]));

  const all: LiveDay[] = time.map((t, i) => {
    if (!isStr(t) || !isStr(cols.sunrise[i]) || !isStr(cols.sunset[i])) throw new HttpError('invalid');
    return {
      date: t,
      tMax: num(cols.temperature_2m_max[i]),
      tMin: num(cols.temperature_2m_min[i]),
      precipMm: num(cols.precipitation_sum[i]),
      precipProb: optNum(cols.precipitation_probability_max[i]),
      sunrise: cols.sunrise[i] as string,
      sunset: cols.sunset[i] as string,
      windMaxKmh: num(cols.wind_speed_10m_max[i]),
      code: num(cols.weather_code[i]),
    };
  });

  // "Today" is the location's local date from current.time — not the first array entry.
  const today = c.time.slice(0, 10);
  const start = Math.max(0, all.findIndex((x) => x.date >= today));
  const days = all.slice(start, start + DAYS_SHOWN);
  if (!days.length) throw new HttpError('invalid');

  return {
    placeKey,
    lat: num(raw.latitude),
    lon: num(raw.longitude),
    timezone: isStr(raw.timezone) ? raw.timezone : 'auto',
    current: {
      time: c.time,
      tempC: num(c.temperature_2m),
      feelsLikeC: num(c.apparent_temperature),
      humidity: num(c.relative_humidity_2m),
      precipMm: num(c.precipitation),
      rainMm: num(c.rain),
      showersMm: num(c.showers),
      code: num(c.weather_code),
      windKmh: num(c.wind_speed_10m),
      windDirDeg: num(c.wind_direction_10m),
      isDay: c.is_day === 1,
    },
    days,
    fetchedAt,
    provider: 'open-meteo',
  };
}

export async function fetchForecast(lat: number, lon: number, placeKey: string, signal?: AbortSignal): Promise<LiveWeather> {
  const raw = await fetchJson(forecastUrl(lat, lon), { signal });
  return parseForecast(raw, placeKey, Date.now());
}
