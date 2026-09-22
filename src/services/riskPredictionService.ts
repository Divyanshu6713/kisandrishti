import type {
  CropInfo,
  DiseaseInfo,
  FieldObservation,
  GrowthStatus,
  RiskDriver,
  RiskInputs,
  RiskResult,
  WeatherSnapshot,
} from '@/models';
import { levelFromScore } from '@/models';
import { clamp, daysBetween, round } from '@/lib/utils';
import { serviceConfig } from './config';
import { knowledge } from './data';

/**
 * Risk intelligence. `RiskModel` is the seam for the trained model:
 * the demo implementation below is a transparent favourability rule set;
 * `remoteRiskModel` posts the same RiskInputs to the backend.
 */
export interface RiskModel {
  id: string;
  predict(inputs: RiskInputs, crop: CropInfo, catalogue: DiseaseInfo[]): Promise<RiskResult[]>;
}

const OBS_WINDOW_DAYS = 21;

// ---------- helpers ----------

function tempFit(meanC: number, w: DiseaseInfo['window']): number {
  if (meanC >= w.optimumC[0] && meanC <= w.optimumC[1]) return 1;
  if (meanC >= w.tempC[0] && meanC <= w.tempC[1]) return 0.6;
  return 0;
}

function moistureFit(humidity: number, wetDays: number, w: DiseaseInfo['window']): number {
  let fit = humidity >= w.minHumidity ? 0.6 + ((humidity - w.minHumidity) / (100 - w.minHumidity)) * 0.4 : (humidity / w.minHumidity) * 0.4;
  if (w.needsLeafWetness) fit = wetDays > 0 ? fit + 0.12 : humidity < 85 ? fit * 0.7 : fit;
  return clamp(fit, 0, 1);
}

function insufficientResult(kind: RiskResult['kind'], title: string, missing: string[]): RiskResult {
  return { kind, title, status: 'insufficient', missing, score: 0, level: 'low', headline: 'Insufficient data for a reliable estimate.', drivers: [] };
}

function favourability(
  entry: DiseaseInfo,
  inputs: RiskInputs,
  weights: { temp: number; moisture: number; stage: number },
): { score: number; drivers: RiskDriver[] } {
  const temp = inputs.temperatureC as number;
  const hum = inputs.humidityPct as number;
  const wetDays = (inputs.foggyDays ?? 0) + ((inputs.rainfallMm ?? 0) > 0 ? 1 : 0);
  const t = tempFit(temp, entry.window);
  const m = moistureFit(hum, wetDays, entry.window);
  const s = inputs.stageId && entry.window.susceptibleStages.includes(inputs.stageId) ? 1 : 0.3;
  const drivers: RiskDriver[] = [
    {
      label:
        t === 1
          ? `${round(temp)} °C average is in its favoured range (${entry.window.optimumC[0]}–${entry.window.optimumC[1]} °C)`
          : t > 0
            ? `${round(temp)} °C average is within its possible range`
            : `${round(temp)} °C average is outside its range`,
      effect: t >= 0.6 ? 'raises' : 'lowers',
    },
    {
      label: hum >= entry.window.minHumidity ? `Humidity ${round(hum)}% is above ${entry.window.minHumidity}%` : `Humidity ${round(hum)}% is below ${entry.window.minHumidity}%`,
      effect: hum >= entry.window.minHumidity ? 'raises' : 'lowers',
    },
  ];
  if (entry.window.needsLeafWetness && wetDays > 0) drivers.push({ label: `${wetDays} day(s) of fog or rain keep leaves wet`, effect: 'raises' });
  drivers.push({ label: s === 1 ? 'Current crop stage is susceptible' : 'Current crop stage is less susceptible', effect: s === 1 ? 'raises' : 'lowers' });
  return { score: 100 * (weights.temp * t + weights.moisture * m + weights.stage * s), drivers };
}

// ---------- demo rule model ----------

export const demoRiskModel: RiskModel = {
  id: 'kd-risk-rules-v0',
  async predict(inputs, crop, catalogue) {
    const results: RiskResult[] = [];
    const cropEntries = catalogue.filter((d) => d.crops.includes(crop.id));
    const haveClimate = inputs.temperatureC !== null && inputs.humidityPct !== null;
    const climateMissing = [inputs.temperatureC === null && 'Temperature', inputs.humidityPct === null && 'Humidity'].filter(Boolean) as string[];

    // Disease
    const diseases = cropEntries.filter((d) => d.kind === 'disease');
    if (!haveClimate) results.push(insufficientResult('disease', 'Disease risk', climateMissing));
    else if (!diseases.length) results.push(insufficientResult('disease', 'Disease risk', [`Disease data for ${crop.name}`]));
    else {
      const scored = diseases
        .map((d) => {
          const f = favourability(d, inputs, { temp: 0.35, moisture: 0.35, stage: 0.15 });
          if (inputs.recentObservationTags.includes(d.tag)) {
            f.score += 15;
            f.drivers.unshift({ label: `${d.name} was recently observed on this farm`, effect: 'raises' });
          }
          return { d, ...f, score: clamp(f.score) };
        })
        .sort((a, b) => b.score - a.score);
      const top = scored[0];
      const level = levelFromScore(top.score);
      results.push({
        kind: 'disease',
        title: 'Disease risk',
        status: 'ok',
        score: Math.round(top.score),
        level,
        subject: top.d.name,
        headline:
          level === 'high'
            ? `Weather favours ${top.d.name.toLowerCase()} — scout closely this week`
            : level === 'medium'
              ? `Some conditions favour ${top.d.name.toLowerCase()}`
              : 'Conditions are not favourable for major diseases',
        drivers: top.drivers,
      });
    }

    // Water
    if (inputs.soilMoisturePct === null) results.push(insufficientResult('water', 'Water stress', ['Soil moisture reading']));
    else {
      const m = inputs.soilMoisturePct;
      const floor = crop.moistureFloor;
      const drivers: RiskDriver[] = [];
      let score: number;
      if (m < floor) {
        score = 50 + ((floor - m) / floor) * 100;
        drivers.push({ label: `Soil moisture ${m}% is below ~${floor}% for ${crop.name.toLowerCase()}`, effect: 'raises' });
      } else if (m < floor + 8) {
        score = 25 + ((floor + 8 - m) / 8) * 25;
        drivers.push({ label: `Soil moisture ${m}% is close to the ~${floor}% floor`, effect: 'raises' });
      } else {
        score = 10;
        drivers.push({ label: `Soil moisture ${m}% is comfortable`, effect: 'lowers' });
      }
      const critical = crop.stages.find((s) => s.id === inputs.stageId)?.waterCritical;
      if (critical) {
        score += 12;
        drivers.push({ label: 'Current stage is irrigation-critical', effect: 'raises' });
      }
      const rain = inputs.rainfallMm ?? 0;
      if (rain >= 10) {
        score -= 20;
        drivers.push({ label: `${rain} mm rain expected this week`, effect: 'lowers' });
      } else if (rain >= 3) {
        score -= 10;
        drivers.push({ label: `Light rain (${rain} mm) expected this week`, effect: 'lowers' });
      }
      if ((inputs.maxTempC ?? 0) >= 30) {
        score += 10;
        drivers.push({ label: `Warm days up to ${inputs.maxTempC} °C increase water use`, effect: 'raises' });
      }
      score = clamp(score);
      const level = levelFromScore(score);
      results.push({
        kind: 'water',
        title: 'Water stress',
        status: 'ok',
        score: Math.round(score),
        level,
        headline: level === 'high' ? 'Irrigation likely needed soon' : level === 'medium' ? 'Check moisture after the expected rain' : 'Soil moisture is adequate',
        drivers,
      });
    }

    // Pest
    const pests = cropEntries.filter((d) => d.kind === 'pest');
    if (!haveClimate) results.push(insufficientResult('pest', 'Pest risk', climateMissing));
    else if (!pests.length) results.push(insufficientResult('pest', 'Pest risk', [`Pest data for ${crop.name}`]));
    else {
      const scored = pests
        .map((p) => {
          const f = favourability(p, inputs, { temp: 0.25, moisture: 0.2, stage: 0.15 });
          if (inputs.recentObservationTags.includes(p.tag)) {
            f.score += 6;
            f.drivers.unshift({ label: `${p.name} already seen in the field`, effect: 'raises' });
          }
          return { p, ...f, score: clamp(f.score) };
        })
        .sort((a, b) => b.score - a.score);
      const top = scored[0];
      const level = levelFromScore(top.score);
      results.push({
        kind: 'pest',
        title: 'Pest risk',
        status: 'ok',
        score: Math.round(top.score),
        level,
        subject: top.p.name,
        headline: level === 'low' ? 'Low pest pressure expected' : `${top.p.name} may build up — monitor, don’t spray by calendar`,
        drivers: top.drivers,
      });
    }

    // Environment
    if (!haveClimate) results.push(insufficientResult('environment', 'Weather stress', climateMissing));
    else {
      let score = 10;
      const drivers: RiskDriver[] = [];
      if ((inputs.maxTempC ?? 0) >= crop.heatStressAboveC) {
        score += 40 + ((inputs.maxTempC as number) - crop.heatStressAboveC) * 8;
        drivers.push({ label: `Maximum ${inputs.maxTempC} °C exceeds ~${crop.heatStressAboveC} °C heat-stress level`, effect: 'raises' });
      }
      if (inputs.minTempC !== null && inputs.minTempC !== undefined && inputs.minTempC <= 4) {
        score += inputs.minTempC <= 2 ? 45 : 25;
        drivers.push({ label: `Nights down to ${inputs.minTempC} °C — frost possible`, effect: 'raises' });
      }
      if ((inputs.rainfallMm ?? 0) >= 50) {
        score += 40;
        drivers.push({ label: `Heavy rain (${inputs.rainfallMm} mm) — waterlogging possible`, effect: 'raises' });
      }
      if ((inputs.windKmh ?? 0) >= 30) {
        score += 25;
        drivers.push({ label: `Strong wind up to ${inputs.windKmh} km/h — lodging possible`, effect: 'raises' });
      }
      if ((inputs.foggyDays ?? 0) >= 2) {
        score += 5 * (inputs.foggyDays as number);
        drivers.push({ label: `${inputs.foggyDays} foggy days — less sunlight, longer leaf wetness`, effect: 'raises' });
      }
      if (!drivers.length) drivers.push({ label: 'No heat, frost, heavy rain or strong wind expected', effect: 'lowers' });
      score = clamp(score);
      const level = levelFromScore(score);
      results.push({
        kind: 'environment',
        title: 'Weather stress',
        status: 'ok',
        score: Math.round(score),
        level,
        headline: level === 'low' ? 'No major weather stress this week' : 'Weather may stress the crop this week',
        drivers,
      });
    }
    return results;
  },
};

export const remoteRiskModel: RiskModel = {
  id: 'kd-risk-remote',
  async predict(inputs) {
    const res = await fetch(`${serviceConfig.apiBase}/v1/models/risk/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(inputs),
    });
    if (!res.ok) throw new Error(`Risk model API failed (${res.status})`);
    return (await res.json()) as RiskResult[];
  },
};

const model: RiskModel = serviceConfig.riskModel === 'remote' ? remoteRiskModel : demoRiskModel;

export const riskPredictionService = {
  modelId: model.id,

  /** Turn farm context into model inputs (3-day outlook for climate, 7-day for rain). */
  buildInputs(args: {
    crop: CropInfo;
    growth: GrowthStatus;
    weather: WeatherSnapshot | null;
    soilMoisturePct: number | null;
    observations: FieldObservation[];
    asOf: string;
  }): RiskInputs {
    const { crop, growth, weather, soilMoisturePct, observations, asOf } = args;
    const next3 = weather?.days.slice(0, 3) ?? [];
    const week = weather?.days.slice(0, 7) ?? [];
    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
    return {
      crop: crop.id,
      stageId: growth.stage?.id ?? null,
      temperatureC: avg(next3.map((d) => (d.tMin + d.tMax) / 2)),
      humidityPct: avg(next3.map((d) => d.humidity)),
      rainfallMm: week.length ? round(week.reduce((a, d) => a + d.rainMm, 0), 1) : null,
      soilMoisturePct,
      maxTempC: week.length ? Math.max(...week.map((d) => d.tMax)) : null,
      minTempC: week.length ? Math.min(...week.map((d) => d.tMin)) : null,
      windKmh: week.length ? Math.max(...week.map((d) => d.windKmh)) : null,
      foggyDays: next3.filter((d) => d.condition === 'fog').length,
      recentObservationTags: observations
        .filter((o) => {
          const age = daysBetween(o.date, asOf);
          return age >= 0 && age <= OBS_WINDOW_DAYS;
        })
        .map((o) => o.tag)
        .filter((t): t is string => Boolean(t)),
    };
  },

  async predict(inputs: RiskInputs, crop: CropInfo): Promise<RiskResult[]> {
    return model.predict(inputs, crop, await knowledge.diseases());
  },
};
