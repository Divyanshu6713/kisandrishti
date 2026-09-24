import type { GeoPlace } from '@/models';
import { fetchJson, HttpError, isNum, isObj, isStr } from './http';

/**
 * Place search across India.
 *  - Names (village / town / city / district): Open-Meteo Geocoding, restricted to countryCode=IN.
 *  - 6-digit PIN codes: Open-Meteo has no Indian postcodes, so the PIN is looked up in the
 *    India Post directory (district + state), then that district is geocoded. The result is
 *    labelled as the district's location, not the exact PIN area.
 *  - "Use my location": coordinates → locality name via BigDataCloud's free client endpoint.
 */
export const GEOCODING_ENDPOINT = 'https://geocoding-api.open-meteo.com/v1/search';
const PIN_ENDPOINT = 'https://api.postalpincode.in/pincode/';
const REVERSE_ENDPOINT = 'https://api.bigdatacloud.net/data/reverse-geocode-client';

export const MIN_QUERY = 2;
const MAX_QUERY = 60;

/** Letters (any script), marks, digits, spaces and . , ' ( ) - only; trimmed and capped. */
export function sanitizeQuery(raw: string): string {
  return raw
    .normalize('NFC')
    .replace(/[^\p{L}\p{M}\p{N}\s.,'()-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_QUERY);
}

export const isPinCode = (q: string) => /^[1-9]\d{5}$/.test(q.replace(/\s/g, ''));

/** ~1 km precision is plenty for weather and avoids passing around exact positions. */
export const roundCoord = (v: number) => Math.round(v * 100) / 100;
export const placeKey = (lat: number, lon: number) => `${roundCoord(lat).toFixed(2)},${roundCoord(lon).toFixed(2)}`;

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+district$/, '')
    .trim();

interface OmResult {
  id: number;
  name: string;
  lat: number;
  lon: number;
  admin1?: string;
  admin2?: string;
  population: number;
  countryCode: string;
}

function parseOm(raw: unknown): OmResult[] {
  if (!isObj(raw)) throw new HttpError('invalid');
  if (raw.results === undefined) return []; // the API omits `results` when nothing matches
  if (!Array.isArray(raw.results)) throw new HttpError('invalid');
  return raw.results.flatMap((r) => {
    if (!isObj(r) || !isNum(r.id) || !isStr(r.name) || !isNum(r.latitude) || !isNum(r.longitude)) return [];
    return [
      {
        id: r.id,
        name: r.name,
        lat: r.latitude,
        lon: r.longitude,
        admin1: isStr(r.admin1) ? r.admin1 : undefined,
        admin2: isStr(r.admin2) ? r.admin2 : undefined,
        population: isNum(r.population) ? r.population : 0,
        countryCode: isStr(r.country_code) ? r.country_code : '',
      },
    ];
  });
}

function region(admin2?: string, admin1?: string, name?: string) {
  const parts = [admin2 && fold(admin2) !== fold(name ?? '') ? admin2 : undefined, admin1].filter(Boolean);
  return parts.length ? parts.join(', ') : 'India';
}

function toPlace(r: OmResult, source: GeoPlace['source'], note?: string, name = r.name): GeoPlace {
  const lat = roundCoord(r.lat);
  const lon = roundCoord(r.lon);
  return { key: placeKey(lat, lon), name, region: region(r.admin2, r.admin1, name), lat, lon, source, note };
}

async function searchNames(query: string, signal?: AbortSignal, count = 10): Promise<OmResult[]> {
  const q = new URLSearchParams({ name: query, count: String(count), language: 'en', format: 'json', countryCode: 'IN' });
  const raw = await fetchJson(`${GEOCODING_ENDPOINT}?${q}`, { signal, timeoutMs: 8000 });
  return parseOm(raw).filter((r) => r.countryCode === 'IN');
}

/** Older/official-variant names the geocoder does not know → the name it does know. */
const ALIASES: Record<string, string> = {
  bangalore: 'Bengaluru',
  'bangalore urban': 'Bengaluru',
  'bangalore rural': 'Bengaluru',
  mysore: 'Mysuru',
  mangalore: 'Mangaluru',
  belgaum: 'Belagavi',
  hubli: 'Hubballi',
  gulbarga: 'Kalaburagi',
  bellary: 'Ballari',
  tumkur: 'Tumakuru',
  shimoga: 'Shivamogga',
  bijapur: 'Vijayapura',
  gurgaon: 'Gurugram',
  bombay: 'Mumbai',
  calcutta: 'Kolkata',
  madras: 'Chennai',
  poona: 'Pune',
  trivandrum: 'Thiruvananthapuram',
  allahabad: 'Prayagraj',
  baroda: 'Vadodara',
  cawnpore: 'Kanpur',
  benares: 'Varanasi',
  pondicherry: 'Puducherry',
};
const canonical = (name: string) => ALIASES[fold(name)] ?? name;

async function searchPin(pin: string, signal?: AbortSignal): Promise<GeoPlace[]> {
  const raw = await fetchJson(PIN_ENDPOINT + pin, { signal, timeoutMs: 8000 });
  const entry = Array.isArray(raw) ? raw[0] : null;
  if (!isObj(entry) || entry.Status !== 'Success' || !Array.isArray(entry.PostOffice)) return [];
  const districts = new Map<string, { district: string; state: string; names: string[] }>();
  for (const po of entry.PostOffice) {
    if (!isObj(po) || !isStr(po.District) || !isStr(po.State)) continue;
    const k = `${po.District}|${po.State}`;
    const d = districts.get(k) ?? { district: po.District.trim(), state: po.State.trim(), names: [po.District.trim()] };
    if (isStr(po.Block) && po.Block.trim() && po.Block !== 'NA') d.names.push(po.Block.trim());
    if (isStr(po.Name) && po.Name.trim()) d.names.push(po.Name.trim());
    districts.set(k, d);
  }
  const out: GeoPlace[] = [];
  for (const d of [...districts.values()].slice(0, 2)) {
    // Try the district, then the block, then post-office names — at most 4 lookups.
    const tries = [...new Set(d.names.map(canonical))].slice(0, 4);
    for (const name of tries) {
      const hits = await searchNames(name, signal, 20);
      const inState = hits.filter((h) => fold(h.admin1 ?? '') === fold(d.state));
      const best = inState.find((h) => fold(h.name) === fold(name)) ?? inState.find((h) => fold(h.admin2 ?? '') === fold(name)) ?? inState[0];
      if (!best) continue;
      out.push({
        ...toPlace(best, 'pin', `PIN ${pin} · weather for ${best.name} (nearest match in the district)`),
        region: `${d.district} district, ${d.state}`,
      });
      break;
    }
  }
  return out;
}

export async function searchPlaces(rawQuery: string, signal?: AbortSignal): Promise<GeoPlace[]> {
  const query = sanitizeQuery(rawQuery);
  if (query.length < MIN_QUERY) return [];
  if (isPinCode(query)) return searchPin(query.replace(/\s/g, ''), signal);
  const name = canonical(query);
  const q = fold(name);
  // Exact name matches first, then district headquarters (town named like its district), then
  // bigger places — so "Dharw" offers Dharwad before small villages called Dharwa.
  const score = (h: OmResult) => (fold(h.name) === q ? 2 : 0) + (h.admin2 && fold(h.admin2) === fold(h.name) ? 1 : 0);
  const hits = (await searchNames(name, signal)).sort((a, b) => score(b) - score(a) || b.population - a.population);
  // Same town can appear twice (e.g. town + its tehsil) — keep the first per rounded key.
  const seen = new Set<string>();
  return hits.map((h) => toPlace(h, 'search')).filter((p) => (seen.has(p.key) ? false : (seen.add(p.key), true)));
}

/** Best-effort locality name for device coordinates. Falls back to null (UI shows coordinates). */
export async function reverseLocality(lat: number, lon: number, signal?: AbortSignal): Promise<{ name: string; region: string } | null> {
  const q = new URLSearchParams({ latitude: roundCoord(lat).toFixed(2), longitude: roundCoord(lon).toFixed(2), localityLanguage: 'en' });
  try {
    const raw = await fetchJson(`${REVERSE_ENDPOINT}?${q}`, { signal, timeoutMs: 6000 });
    if (!isObj(raw)) return null;
    const name = [raw.locality, raw.city].find((v) => isStr(v) && v.trim()) as string | undefined;
    const state = isStr(raw.principalSubdivision) ? raw.principalSubdivision : '';
    const country = isStr(raw.countryName) ? raw.countryName : '';
    if (!name) return null;
    return { name: name.slice(0, 60), region: [state, country].filter(Boolean).join(', ') };
  } catch {
    return null;
  }
}
