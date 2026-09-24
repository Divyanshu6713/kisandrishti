import type { FarmerInsight, Level, LiveDay, LiveWeather } from '@/models';
import { formatWeekday } from '@/lib/utils';

/**
 * Rule-based farmer insights over live Open-Meteo values. Informational only: every
 * insight lists the exact values and the rule that produced it. Thresholds are simple,
 * published-style cut-offs, not a trained model, and not guaranteed agronomic advice.
 */
export const THRESHOLDS = {
  rainProb: 60, //        % — "rain likely"
  rainMm: 5, //           mm/day — enough to matter for irrigation
  heavyRainMm: 64.5, //   mm/day — IMD "heavy rain" category starts here
  dryProb: 20, //         % — "dry"
  hotC: 35,
  veryHotC: 40,
  coldC: 4, //            °C night minimum — frost possible nearby
  gustyKmh: 40, //        daily max wind
  sprayWindKmh: 15, //    spray drift becomes likely above this
  humidPct: 85,
} as const;

const day = (d: LiveDay, today: string) => (d.date === today ? 'today' : formatWeekday(d.date));
const pct = (v: number | null) => (v === null ? 'n/a' : `${v}%`);
const mm = (v: number) => `${Math.round(v * 10) / 10} mm`;

export function buildInsights(w: LiveWeather): FarmerInsight[] {
  const out: FarmerInsight[] = [];
  const T = THRESHOLDS;
  const today = w.current.time.slice(0, 10);
  const next3 = w.days.slice(0, 3);

  const wet = next3.filter((d) => (d.precipProb ?? 0) >= T.rainProb || d.precipMm >= T.rainMm);
  if (wet.length) {
    const peak = wet.reduce((a, b) => ((b.precipProb ?? 0) > (a.precipProb ?? 0) ? b : a));
    const total = wet.reduce((a, d) => a + d.precipMm, 0);
    out.push({
      id: 'rain-soon',
      level: 'medium',
      title: 'Rain expected: consider postponing irrigation.',
      detail: `Up to ${pct(peak.precipProb)} chance of rain ${day(peak, today)}, about ${mm(total)} forecast over ${wet.map((d) => day(d, today)).join(', ')}. Check field moisture before irrigating.`,
      factors: wet.map((d) => ({ label: day(d, today), value: `${pct(d.precipProb)} · ${mm(d.precipMm)}` })),
      rule: `Rain probability ≥ ${T.rainProb}% or rain ≥ ${T.rainMm} mm on any of the next 3 days`,
    });
  }

  const heavy = w.days.filter((d) => d.precipMm >= T.heavyRainMm);
  if (heavy.length) {
    out.push({
      id: 'heavy-rain',
      level: 'high',
      title: `Heavy rain possible ${heavy.map((d) => day(d, today)).join(', ')}: check field drainage.`,
      detail: 'Clear drainage channels where fields can waterlog, and avoid applying fertiliser just before heavy rain.',
      factors: heavy.map((d) => ({ label: day(d, today), value: mm(d.precipMm) })),
      rule: `Daily rain ≥ ${T.heavyRainMm} mm (IMD “heavy rain” category) in the next 7 days`,
    });
  }

  const hottest = w.days.reduce((a, b) => (b.tMax > a.tMax ? b : a));
  const dry = next3.every((d) => (d.precipProb ?? 100) < T.dryProb && d.precipMm < 1);
  if (dry && Math.max(...next3.map((d) => d.tMax)) >= T.hotC) {
    out.push({
      id: 'dry-hot',
      level: 'medium',
      title: 'Dry conditions: irrigation planning may be required.',
      detail: 'Little chance of rain and hot afternoons over the next 3 days. Irrigating in the early morning or evening loses less water.',
      factors: next3.map((d) => ({ label: day(d, today), value: `${Math.round(d.tMax)} °C · rain ${pct(d.precipProb)}` })),
      rule: `Rain probability < ${T.dryProb}% on each of the next 3 days and a maximum ≥ ${T.hotC} °C`,
    });
  }
  if (hottest.tMax >= T.veryHotC) {
    out.push({
      id: 'heat',
      level: 'high',
      title: `Very high temperature ${day(hottest, today)}: heat stress possible.`,
      detail: 'Keep the soil moist and avoid field work in the afternoon heat.',
      factors: [{ label: `Max ${day(hottest, today)}`, value: `${Math.round(hottest.tMax)} °C` }],
      rule: `Daily maximum ≥ ${T.veryHotC} °C in the next 7 days`,
    });
  }

  const coldest = w.days.reduce((a, b) => (b.tMin < a.tMin ? b : a));
  if (coldest.tMin <= T.coldC) {
    out.push({
      id: 'cold',
      level: 'medium',
      title: `Cold night ${day(coldest, today)}: frost risk for sensitive crops.`,
      detail: 'A light irrigation in the evening can reduce frost damage; cover nursery beds where possible.',
      factors: [{ label: `Min ${day(coldest, today)}`, value: `${Math.round(coldest.tMin)} °C` }],
      rule: `Night minimum ≤ ${T.coldC} °C in the next 7 days`,
    });
  }

  const windy = w.days.filter((d) => d.windMaxKmh >= T.gustyKmh);
  if (windy.length) {
    out.push({
      id: 'wind',
      level: 'medium',
      title: 'Strong winds expected: protect vulnerable crops where relevant.',
      detail: 'Tall or heavy-headed crops can lodge; secure nets, shade and young plants.',
      factors: windy.map((d) => ({ label: day(d, today), value: `${Math.round(d.windMaxKmh)} km/h max` })),
      rule: `Daily maximum wind ≥ ${T.gustyKmh} km/h in the next 7 days`,
    });
  } else if (w.current.windKmh > T.sprayWindKmh) {
    out.push({
      id: 'spray-drift',
      level: 'low',
      title: 'Breezy right now: sprays may drift.',
      detail: 'If you plan to spray, calmer early-morning hours usually work better.',
      factors: [{ label: 'Wind now', value: `${Math.round(w.current.windKmh)} km/h` }],
      rule: `Current wind > ${T.sprayWindKmh} km/h`,
    });
  }

  if (w.current.humidity >= T.humidPct) {
    out.push({
      id: 'humid',
      level: 'medium',
      title: 'High humidity may increase conditions favourable to certain fungal diseases.',
      detail: 'Leaves stay wet for longer. Scout for leaf spots or rust, and avoid spraying on wet foliage.',
      factors: [{ label: 'Humidity now', value: `${w.current.humidity}%` }],
      rule: `Current relative humidity ≥ ${T.humidPct}%`,
    });
  }

  if (!out.length) {
    out.push({
      id: 'calm',
      level: 'low',
      title: 'No weather flags from these rules this week.',
      detail: 'Normal field work can go ahead. Check again before irrigating or spraying.',
      factors: [
        { label: 'Max / min', value: `${Math.round(hottest.tMax)} / ${Math.round(coldest.tMin)} °C` },
        { label: 'Highest rain chance', value: pct(Math.max(...w.days.map((d) => d.precipProb ?? 0))) },
      ],
      rule: 'None of the rain, heat, cold, wind or humidity rules matched',
    });
  }

  const rank: Record<Level, number> = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => rank[a.level] - rank[b.level]);
}
