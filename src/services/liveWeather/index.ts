import type { GeoPlace, LiveWeather } from '@/models';
import { fetchForecast } from './openMeteo';
import { searchPlaces, reverseLocality, placeKey, roundCoord, sanitizeQuery } from './geocoding';
import { HttpError } from './http';

/**
 * Live weather service: caches recent results briefly and never sends the same request twice
 * at once. The UI goes through the live-weather store, not through fetch.
 */
export const FRESH_MS = 10 * 60_000; // Open-Meteo updates current conditions every 15 min
const SEARCH_TTL = 30 * 60_000;

const forecastCache = new Map<string, LiveWeather>();
const inflight = new Map<string, Promise<LiveWeather>>();
const searchCache = new Map<string, { at: number; places: GeoPlace[] }>();

/** Karnal, Haryana — the district of the bundled demo farm. Used until the farmer picks a place. */
export const DEFAULT_PLACE: GeoPlace = {
  key: placeKey(29.69, 76.98),
  name: 'Karnal',
  region: 'Haryana',
  lat: 29.69,
  lon: 76.98,
  source: 'default',
  note: 'Default demo location (district of the demo farm)',
};

export const liveWeatherService = {
  async forecast(place: GeoPlace, { force = false, signal }: { force?: boolean; signal?: AbortSignal } = {}): Promise<LiveWeather> {
    const hit = forecastCache.get(place.key);
    if (!force && hit && Date.now() - hit.fetchedAt < FRESH_MS) return hit;
    const pending = inflight.get(place.key);
    if (pending) return pending;
    const p = fetchForecast(place.lat, place.lon, place.key, signal)
      .then((w) => {
        forecastCache.set(place.key, w);
        if (forecastCache.size > 12) forecastCache.delete(forecastCache.keys().next().value!);
        return w;
      })
      .finally(() => inflight.delete(place.key));
    inflight.set(place.key, p);
    return p;
  },

  async search(query: string, signal?: AbortSignal): Promise<GeoPlace[]> {
    const q = sanitizeQuery(query).toLowerCase();
    const hit = searchCache.get(q);
    if (hit && Date.now() - hit.at < SEARCH_TTL) return hit.places;
    const places = await searchPlaces(q, signal);
    searchCache.set(q, { at: Date.now(), places });
    if (searchCache.size > 50) searchCache.delete(searchCache.keys().next().value!);
    return places;
  },

  /** Device coordinates → a place (rounded to ~1 km). Locality is looked up separately. */
  devicePlace(lat: number, lon: number): GeoPlace {
    const rl = roundCoord(lat);
    const ro = roundCoord(lon);
    return { key: placeKey(rl, ro), name: 'Your location', region: `${rl.toFixed(2)}°, ${ro.toFixed(2)}°`, lat: rl, lon: ro, source: 'device' };
  },

  reverseLocality,

  clearCache() {
    forecastCache.clear();
    searchCache.clear();
  },
};

/** Safe, human wording for failures — no status codes or stack traces in the UI. */
export function weatherErrorMessage(e: unknown): string {
  if (e instanceof HttpError) {
    if (e.code === 'timeout') return 'The weather service took too long to respond.';
    if (e.code === 'network') return 'No connection to the weather service.';
    if (e.code === 'invalid') return 'The weather service sent an unexpected response.';
  }
  return 'Unable to fetch live weather. Please try again.';
}

export { sanitizeQuery, MIN_QUERY, isPinCode } from './geocoding';
export { buildInsights, THRESHOLDS } from './insights';
export { describeCode, compass } from './wmo';
export type { SkyKind } from './wmo';
export { isAbort, HttpError } from './http';
