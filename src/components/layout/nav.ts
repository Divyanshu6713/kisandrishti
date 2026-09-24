import { Bot, CloudSun, FlaskConical, Flower2, Home, Layers, LineChart, Map, Microscope, Ruler, Settings2, ShieldAlert, Sprout, Leaf, Sun } from 'lucide-react';
import type { MessageKey } from '@/i18n';
import type { FarmingMode } from '@/state/prefsStore';

export interface NavItem {
  to: string;
  /** English label (also used outside the shell, e.g. "Open Soil →" links). */
  label: string;
  /** Translated label key for the shell. */
  key: MessageKey;
  icon: typeof Home;
  end?: boolean;
}

/** Field farming — primary navigation, kept deliberately short. */
export const NAV_PRIMARY: NavItem[] = [
  { to: '/app', label: 'Overview', key: 'nav.overview', icon: Home, end: true },
  { to: '/app/farms', label: 'My Farms', key: 'nav.farms', icon: Map },
  { to: '/app/soil', label: 'Soil', key: 'nav.soil', icon: Layers },
  { to: '/app/crop', label: 'Crop Health', key: 'nav.crop', icon: Sprout },
  { to: '/app/weather', label: 'Weather', key: 'nav.weather', icon: CloudSun },
  { to: '/app/organic', label: 'Organic Farming', key: 'nav.organic', icon: Leaf },
  { to: '/app/insights', label: 'Insights', key: 'nav.insights', icon: LineChart },
];

/** Field farming — analysis tools used less often. */
export const NAV_TOOLS: NavItem[] = [
  { to: '/app/advisor', label: 'Farm Advisor', key: 'nav.advisor', icon: Bot },
  { to: '/app/disease', label: 'Disease Analysis', key: 'nav.disease', icon: Microscope },
  { to: '/app/risk', label: 'Risk Intelligence', key: 'nav.risk', icon: ShieldAlert },
];

/** Rooftop farming — the garden first, then the three advisers. Weather is shared with field mode. */
export const NAV_ROOFTOP: NavItem[] = [
  { to: '/app/garden', label: 'My Garden', key: 'nav.garden', icon: Flower2, end: true },
  { to: '/app/weather', label: 'Weather', key: 'nav.weather', icon: CloudSun },
  { to: '/app/garden/setup', label: 'Garden setup', key: 'nav.gardens', icon: Settings2 },
];

export const NAV_ADVISERS: NavItem[] = [
  { to: '/app/garden/sunlight', label: 'Sunlight Adviser', key: 'nav.sunlight', icon: Sun },
  { to: '/app/garden/nutrients', label: 'Nutrient Adviser', key: 'nav.nutrients', icon: Sprout },
  { to: '/app/garden/quantity', label: 'Quantity Analyser', key: 'nav.quantity', icon: Ruler },
];

/** Which mode a path belongs to; null = shared (weather). Keeps the shell in step with deep links. */
export function modeOfPath(path: string): FarmingMode | null {
  if (path.startsWith('/app/garden')) return 'rooftop';
  if (path.startsWith('/app/weather')) return null;
  return 'field';
}

/** Paths whose page content is translated (the rest show a one-line "in English for now" note in Hindi). */
export const TRANSLATED_PATHS = new Set(['/app']);

export const ENGINE_ICON = FlaskConical;
