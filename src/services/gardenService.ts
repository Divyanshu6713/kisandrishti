import type {
  ContainerKind,
  GardenDraft,
  GardenInsight,
  GardenPlant,
  GardenSource,
  GardenStageId,
  GardenTask,
  LiveWeather,
  PlantId,
  PlantInfo,
  PlantStatus,
  RooftopGarden,
  SpacePlan,
  SunFit,
} from '@/models';
import { DAY_MS, daysBetween, formatShortDate, round, toDate, uid } from '@/lib/utils';
import plantsData from '@/data/rooftop-plants.json';
import demoData from '@/data/demo-garden.json';

/**
 * Rooftop rules — the garden-side twin of the field advisor. Everything here is a transparent
 * rule over (a) what the grower entered, (b) the bundled growing guide and (c) live weather
 * when it is loaded. No scores, no probabilities: rooftop advice is phrased as what to do
 * and why, with the source one click away.
 */

export const DEMO_GARDEN_ID = 'demo-rooftop';

const PLANTS = plantsData.items as PlantInfo[];
const SOURCES = plantsData.sources as GardenSource[];
const INSIGHTS = plantsData.insights as GardenInsight[];

const addDays = (iso: string, n: number) => {
  const d = new Date(toDate(iso).getTime() + n * DAY_MS);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Litres of mix in one sq ft of bed at the given depth (1 sq ft = 0.0929 m²). */
const bedLitres = (depthCm: number) => 0.0929 * (depthCm / 100) * 1000;

export const STAGE_LABEL: Record<'planted' | GardenStageId, string> = {
  planted: 'Planted',
  growing: 'Growing',
  flowering: 'Flowering',
  fruit: 'Fruit',
  harvest: 'Harvest',
};

export const CONTAINER_LABEL: Record<ContainerKind, string> = { clay: 'Clay pots', plastic: 'Plastic pots', 'grow-bag': 'Grow bags' };

export const gardenService = {
  plants: () => PLANTS,
  plant: (id: PlantId) => PLANTS.find((p) => p.id === id)!,
  sources: () => SOURCES,
  source: (id: string) => SOURCES.find((s) => s.id === id),
  datasetNote: plantsData._meta.note,

  /** The bundled demo rooftop, with planting dates resolved against `today`. */
  demoGarden(today: string): RooftopGarden {
    const g = demoData.garden;
    return {
      id: g.id,
      name: g.name,
      location: g.location,
      areaSqFt: g.areaSqFt,
      sunHours: g.sunHours,
      containers: g.containers as ContainerKind,
      createdAt: g.createdAt,
      isDemo: true,
      plants: g.plants.map((p) => ({ id: p.id, plantId: p.plantId as PlantId, count: p.count, plantedOn: addDays(today, -p.plantedDaysAgo) })),
    };
  },

  unitLabel(plant: PlantInfo, n: number) {
    return plant.unit === 'pot' ? `${n} pot${n === 1 ? '' : 's'}` : `${n} sq ft bed`;
  },

  sunFit(plant: PlantInfo, hours: number): SunFit {
    if (hours >= plant.sun.ideal) return 'good';
    if (hours >= plant.sun.min) return 'workable';
    return 'poor';
  },

  sunFitText(plant: PlantInfo, hours: number): string {
    const fit = this.sunFit(plant, hours);
    if (fit === 'good') return `${hours} h is enough — ${plant.name.toLowerCase()} does best with ${plant.sun.ideal}+ h.`;
    if (fit === 'workable') return `${hours} h works; ${plant.sun.ideal}+ h would give ${plant.kind === 'fruiting' ? 'more flowers and fruit' : 'faster growth'}.`;
    return `Needs about ${plant.sun.min}+ h of direct sun; ${hours} h is likely too little${plant.kind === 'fruiting' ? ' for good fruiting' : ''}.`;
  },

  status(entry: GardenPlant, asOf: string, sunHours: number): PlantStatus {
    const plant = this.plant(entry.plantId);
    const path = ['planted' as const, ...plant.stages.map((s) => s.id)];
    const harvest = plant.stages.find((s) => s.id === 'harvest');
    const base = { entry, plant, path, sunFit: this.sunFit(plant, sunHours) };
    if (!entry.plantedOn) return { ...base, days: null, stage: null, step: null, harvestFrom: null };
    const days = Math.max(0, daysBetween(entry.plantedOn, asOf));
    const last = plant.stages[plant.stages.length - 1];
    const stage = plant.stages.find((s) => days >= s.from && days < s.to)?.id ?? (days >= last.to ? 'finished' : 'growing');
    const step = stage === 'finished' ? path.length - 1 : path.indexOf(stage);
    return { ...base, days, stage, step, harvestFrom: harvest ? addDays(entry.plantedOn, harvest.from) : null };
  },

  space(garden: RooftopGarden): SpacePlan {
    const lines = garden.plants.map((entry) => {
      const plant = this.plant(entry.plantId);
      const sqFt = plant.unit === 'pot' ? entry.count * plant.container.footprintSqFt : entry.count;
      const litres = plant.unit === 'pot' ? entry.count * (plant.container.minLitres ?? 0) : entry.count * bedLitres(plant.container.minDepthCm);
      return { entry, plant, sqFt: round(sqFt, 1), litres: Math.round(litres) };
    });
    const used = round(lines.reduce((a, l) => a + l.sqFt, 0), 1);
    const free = Math.max(0, round(garden.areaSqFt - used, 1));
    const unique = [...new Map(lines.map((l) => [l.plant.id, l.plant])).values()];
    return {
      available: garden.areaSqFt,
      used,
      free,
      litres: lines.reduce((a, l) => a + l.litres, 0),
      lines,
      roomFor: unique.map((plant) => ({ plant, more: Math.floor(free / (plant.unit === 'pot' ? plant.container.footprintSqFt : 1)) })),
    };
  },

  /** Today's garden: a short, ordered list. Weather rules run only when live weather is loaded. */
  tasks(garden: RooftopGarden, statuses: PlantStatus[], asOf: string, weather: { data: LiveWeather; place: string } | null): GardenTask[] {
    const out: GardenTask[] = [];
    const today = weather?.data.days[0];
    if (today && today.tMax >= 35) {
      out.push({
        id: 'heat',
        title: 'Check pots morning and evening',
        why: `${Math.round(today.tMax)}°C expected today in ${weather!.place}. Pots on a hot roof dry fast — feel the soil twice today.`,
        priority: 'today',
        adviser: 'weather',
        sources: ['live-weather', 'growing-guide'],
        signals: ['Live weather'],
      });
    } else if (today && ((today.precipProb ?? 0) >= 60 || today.precipMm >= 5)) {
      out.push({
        id: 'rain',
        title: 'Let the rain water your pots',
        why: `${today.precipProb !== null ? `${today.precipProb}% chance of rain` : `${round(today.precipMm, 1)} mm of rain`} today in ${weather!.place}. Skip watering if it rains, and check that pots drain.`,
        priority: 'today',
        adviser: 'weather',
        sources: ['live-weather', 'growing-guide'],
        signals: ['Live weather'],
      });
    }

    for (const s of statuses) {
      if (s.stage === 'harvest')
        out.push({
          id: `pick-${s.entry.id}`,
          title: s.plant.kind === 'fruiting' ? `Pick ripe ${s.plant.name.toLowerCase()}` : `Cut ${s.plant.name.toLowerCase()} (${s.plant.localName.toLowerCase()})`,
          why: `${s.plant.harvestNote} Day ${s.days} after planting — in the usual harvest window.`,
          priority: 'today',
          adviser: 'harvest',
          entryId: s.entry.id,
          sources: ['user-input', 'growing-guide'],
          signals: ['Planting date'],
        });
    }

    const shaded = statuses.filter((s) => s.sunFit === 'poor');
    if (shaded.length) {
      const names = shaded.map((s) => s.plant.name.toLowerCase());
      const need = Math.max(...shaded.map((s) => s.plant.sun.min));
      out.push({
        id: 'sun',
        title: `Give ${names.join(' and ')} your sunniest spot`,
        why: `${shaded.length > 1 ? 'They need' : 'It needs'} about ${need}+ hours of direct sun; you noted ${garden.sunHours} h. Less sun means fewer flowers and fruit.`,
        priority: 'soon',
        adviser: 'sunlight',
        entryId: shaded[0].entry.id,
        sources: ['user-input', 'growing-guide'],
        signals: ['Your sun hours'],
      });
    }

    for (const s of statuses) {
      if (!s.harvestFrom || s.stage === 'harvest' || s.stage === 'finished') continue;
      const inDays = daysBetween(asOf, s.harvestFrom);
      if (inDays > 0 && inDays <= 7)
        out.push({
          id: `soon-${s.entry.id}`,
          title: `${s.plant.name} (${s.plant.localName}): first harvest from ${formatShortDate(s.harvestFrom)}`,
          why: `About ${s.plant.stages.find((x) => x.id === 'harvest')!.from} days after planting, by the growing guide. ${s.plant.harvestNote}`,
          priority: 'soon',
          adviser: 'harvest',
          entryId: s.entry.id,
          sources: ['user-input', 'growing-guide'],
          signals: ['Planting date'],
        });
    }

    for (const s of statuses) {
      if (s.plant.kind !== 'fruiting' || (s.stage !== 'flowering' && s.stage !== 'fruit')) continue;
      out.push({
        id: `even-${s.entry.id}`,
        title: `Keep watering ${s.plant.name.toLowerCase()} evenly`,
        why: `${s.plant.name} is ${s.stage === 'flowering' ? 'flowering' : 'filling fruit'}. ${s.plant.nutrients[s.stage]?.watch[0] ?? ''}`.trim(),
        priority: 'monitor',
        adviser: 'nutrients',
        entryId: s.entry.id,
        sources: ['user-input', 'growing-guide'],
        signals: ['Planting date'],
      });
    }

    const undated = statuses.filter((s) => s.days === null);
    if (undated.length)
      out.push({
        id: 'dates',
        title: 'Add planting dates',
        why: `Stages and harvest dates need a planting date for ${undated.map((s) => s.plant.name.toLowerCase()).join(', ')}. Nothing is guessed without one.`,
        priority: 'monitor',
        adviser: 'harvest',
        sources: ['user-input'],
        signals: ['Your garden'],
      });

    const space = this.space(garden);
    if (space.used > space.available)
      out.push({
        id: 'space',
        title: 'Your plants need more room than you entered',
        why: `About ${space.used} sq ft needed vs ${space.available} sq ft available. Crowded pots shade each other.`,
        priority: 'monitor',
        adviser: 'quantity',
        sources: ['user-input', 'growing-guide'],
        signals: ['Your space'],
      });

    if (!out.some((t) => t.adviser === 'weather'))
      out.push({
        id: 'daily-check',
        title: 'Feel the soil in each pot',
        why: `Containers dry quickly on a roof${garden.containers === 'clay' ? ', and clay pots lose water through their sides' : ''}. Water when the top layer is dry.`,
        priority: 'monitor',
        adviser: 'weather',
        sources: ['growing-guide'],
        signals: ['Growing guide'],
      });

    const rank = { today: 0, soon: 1, monitor: 2 } as const;
    return out.map((t, i) => ({ t, i })).sort((a, b) => rank[a.t.priority] - rank[b.t.priority] || a.i - b.i).map(({ t }) => t);
  },

  /** Up to `max` notes, the ones about this garden's plants and pots first. */
  insights(garden: RooftopGarden, max = 3): GardenInsight[] {
    const ids = new Set(garden.plants.map((p) => p.plantId));
    const score = (i: GardenInsight) => (i.plants?.some((p) => ids.has(p)) ? 2 : 0) + (i.containers?.includes(garden.containers) ? 2 : 0) + (!i.plants && !i.containers ? 1 : 0);
    const relevant = INSIGHTS.filter((i) => (!i.plants || i.plants.some((p) => ids.has(p))) && (!i.containers || i.containers.includes(garden.containers)));
    return relevant.sort((a, b) => score(b) - score(a)).slice(0, max);
  },

  /** A new garden from the setup form. Counts start at a small default; planting dates stay empty until given. */
  create(d: GardenDraft): RooftopGarden {
    return {
      id: uid('garden'),
      name: d.name,
      location: d.location,
      areaSqFt: d.areaSqFt,
      sunHours: d.sunHours,
      containers: d.containers,
      createdAt: new Date().toISOString(),
      plants: d.plantIds.map((plantId) => ({ id: uid('gp'), plantId, count: this.plant(plantId).unit === 'pot' ? 2 : 4, plantedOn: null })),
    };
  },

  validate(d: { name: string; areaSqFt: number }) {
    const errors: { name?: boolean; area?: boolean } = {};
    if (!d.name.trim()) errors.name = true;
    if (!Number.isFinite(d.areaSqFt) || d.areaSqFt < 4 || d.areaSqFt > 5000) errors.area = true;
    return errors;
  },
};
