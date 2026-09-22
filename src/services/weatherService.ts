import type { AgroImplication, CropInfo, Farm, GrowthStatus, RiskResult, WeatherSnapshot } from '@/models';
import { formatWeekday } from '@/lib/utils';
import { records } from './data';

/**
 * Weather + agricultural meaning. The provider is behind the records repository
 * (sample forecast locally, backend/live provider with the REST adapter).
 * `implications` translates weather into farm-relevant statements using the risk
 * engine's outputs, so the logic lives in one place.
 */
export const weatherService = {
  forecast: (farm: Farm): Promise<WeatherSnapshot | null> => records.weather(farm),

  implications(w: WeatherSnapshot, crop: CropInfo, growth: GrowthStatus, risks: RiskResult[]): AgroImplication[] {
    const out: AgroImplication[] = [];
    const stage = growth.stage?.name.toLowerCase() ?? 'current';
    const next3 = w.days.slice(0, 3);
    const avgHum = Math.round(next3.reduce((a, d) => a + d.humidity, 0) / Math.max(1, next3.length));
    const tRange = `${Math.min(...next3.map((d) => d.tMin))}–${Math.max(...next3.map((d) => d.tMax))} °C`;
    const sources = [w.source, 'demo-rules'] as AgroImplication['basis']['sources'];

    const disease = risks.find((r) => r.kind === 'disease' && r.status === 'ok');
    if (disease && disease.level !== 'low') {
      out.push({
        id: 'humid-disease',
        title: `Cool, humid days + ${stage} stage → ${disease.subject?.toLowerCase()} conditions`,
        detail: `Expect ${tRange} and around ${avgHum}% humidity over the next three days. Scout lower and middle leaves.`,
        level: disease.level,
        basis: { factors: [{ label: 'Temperature', value: tRange }, { label: 'Humidity', value: `${avgHum}%` }, { label: 'Stage', value: growth.stage?.name ?? '—' }], sources },
      });
    }

    const rainDays = w.days.filter((d) => d.rainMm > 0);
    const totalRain = rainDays.reduce((a, d) => a + d.rainMm, 0);
    const water = risks.find((r) => r.kind === 'water' && r.status === 'ok');
    if (rainDays.length) {
      out.push({
        id: 'rain-irrigation',
        title: `${totalRain} mm light rain on ${rainDays.map((d) => formatWeekday(d.date)).join(' & ')}`,
        detail:
          water && water.level !== 'low'
            ? 'Hold irrigation until after the rain, then re-check soil moisture — the crop is at an irrigation-critical stage.'
            : 'Small amounts only — useful, but not a substitute for scheduled irrigation.',
        level: water?.level ?? 'low',
        basis: { factors: [{ label: 'Rain (7 days)', value: `${totalRain} mm` }, { label: 'Irrigation', value: 'Tubewell / field schedule' }], sources },
      });
    }

    const fog = next3.filter((d) => d.condition === 'fog').length;
    if (fog) {
      out.push({
        id: 'fog',
        title: `${fog} foggy morning${fog > 1 ? 's' : ''} ahead`,
        detail: 'Leaves stay wet longer and sunlight is reduced. Avoid spraying anything on wet foliage.',
        level: fog >= 2 ? 'medium' : 'low',
        basis: { factors: [{ label: 'Fog days', value: String(fog) }], sources },
      });
    }

    const warm = w.days.find((d) => d.tMax >= crop.heatStressAboveC);
    if (warm) {
      out.push({
        id: 'heat',
        title: `Heat stress possible on ${formatWeekday(warm.date)}`,
        detail: `${warm.tMax} °C is above ~${crop.heatStressAboveC} °C for ${crop.name.toLowerCase()}. Keep soil moist.`,
        level: 'high',
        basis: { factors: [{ label: 'Max temperature', value: `${warm.tMax} °C` }], sources },
      });
    } else {
      out.push({
        id: 'no-heat',
        title: 'No heat stress expected this week',
        detail: `Maximum temperatures stay below ~${crop.heatStressAboveC} °C.`,
        level: 'low',
        basis: { factors: [{ label: 'Weekly max', value: `${Math.max(...w.days.map((d) => d.tMax))} °C` }], sources },
      });
    }
    return out;
  },
};
