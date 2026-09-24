import { useMemo } from 'react';
import type { GardenInsight, GardenTask, PlantStatus, RooftopGarden, SpacePlan } from '@/models';
import { todayIso } from '@/lib/utils';
import { DEMO_GARDEN_ID, gardenService } from '@/services/gardenService';
import { useGardenStore } from '@/state/gardenStore';
import { useLiveWeather } from '@/state/liveWeatherStore';

export interface GardenContext {
  garden: RooftopGarden;
  gardens: RooftopGarden[];
  asOf: string;
  statuses: PlantStatus[];
  space: SpacePlan;
  tasks: GardenTask[];
  insights: GardenInsight[];
  /** Name of the place live weather is for, when it is loaded. */
  weatherPlace: string | null;
}

/**
 * Everything the rooftop pages show, derived in one place (the rooftop twin of FarmContext),
 * so the dashboard, advisers and 3D scene never disagree.
 */
export function useGarden(): GardenContext {
  const { userGardens, selectedGardenId, patches } = useGardenStore();
  const weather = useLiveWeather((s) => s.data);
  const place = useLiveWeather((s) => s.place);
  const asOf = todayIso();

  return useMemo(() => {
    const gardens = [gardenService.demoGarden(asOf), ...userGardens].map((g) => ({ ...g, ...patches[g.id] }));
    const garden = gardens.find((g) => g.id === selectedGardenId) ?? gardens.find((g) => g.id === DEMO_GARDEN_ID)!;
    const statuses = garden.plants.map((p) => gardenService.status(p, asOf, garden.sunHours));
    const live = weather && weather.placeKey === place.key ? { data: weather, place: place.name } : null;
    return {
      garden,
      gardens,
      asOf,
      statuses,
      space: gardenService.space(garden),
      tasks: gardenService.tasks(garden, statuses, asOf, live),
      insights: gardenService.insights(garden),
      weatherPlace: live?.place ?? null,
    };
  }, [userGardens, selectedGardenId, patches, weather, place, asOf]);
}
