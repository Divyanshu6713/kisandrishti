import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudMoon, CloudRain, CloudSnow, CloudSun, Moon, Sun } from 'lucide-react';
import { describeCode, type SkyKind } from '@/services/liveWeather';

const DAY: Record<SkyKind, typeof Sun> = {
  clear: Sun,
  partly: CloudSun,
  cloudy: Cloud,
  fog: CloudFog,
  drizzle: CloudDrizzle,
  rain: CloudRain,
  snow: CloudSnow,
  storm: CloudLightning,
};
const NIGHT: Partial<Record<SkyKind, typeof Sun>> = { clear: Moon, partly: CloudMoon };

/** WMO code → icon, with an accessible label taken from the same code. */
export function WeatherIcon({ code, isDay = true, className }: { code: number; isDay?: boolean; className?: string }) {
  const { kind, label } = describeCode(code);
  const Icon = (!isDay && NIGHT[kind]) || DAY[kind];
  return <Icon className={className} role="img" aria-label={label} />;
}
