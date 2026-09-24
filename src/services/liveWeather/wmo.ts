/** WMO weather interpretation codes, as used by Open-Meteo (`weather_code`). */
export type SkyKind = 'clear' | 'partly' | 'cloudy' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'storm';

const TABLE: Record<number, [string, SkyKind]> = {
  0: ['Clear sky', 'clear'],
  1: ['Mainly clear', 'clear'],
  2: ['Partly cloudy', 'partly'],
  3: ['Overcast', 'cloudy'],
  45: ['Fog', 'fog'],
  48: ['Depositing rime fog', 'fog'],
  51: ['Light drizzle', 'drizzle'],
  53: ['Drizzle', 'drizzle'],
  55: ['Dense drizzle', 'drizzle'],
  56: ['Freezing drizzle', 'drizzle'],
  57: ['Dense freezing drizzle', 'drizzle'],
  61: ['Slight rain', 'rain'],
  63: ['Moderate rain', 'rain'],
  65: ['Heavy rain', 'rain'],
  66: ['Freezing rain', 'rain'],
  67: ['Heavy freezing rain', 'rain'],
  71: ['Slight snowfall', 'snow'],
  73: ['Moderate snowfall', 'snow'],
  75: ['Heavy snowfall', 'snow'],
  77: ['Snow grains', 'snow'],
  80: ['Slight rain showers', 'rain'],
  81: ['Rain showers', 'rain'],
  82: ['Violent rain showers', 'rain'],
  85: ['Snow showers', 'snow'],
  86: ['Heavy snow showers', 'snow'],
  95: ['Thunderstorm', 'storm'],
  96: ['Thunderstorm with hail', 'storm'],
  99: ['Thunderstorm with heavy hail', 'storm'],
};

export function describeCode(code: number): { label: string; kind: SkyKind } {
  const hit = TABLE[code];
  return hit ? { label: hit[0], kind: hit[1] } : { label: 'Unclassified conditions', kind: 'cloudy' };
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export const compass = (deg: number) => COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
