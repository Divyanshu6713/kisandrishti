import { Bot, CloudSun, FlaskConical, Home, Layers, LineChart, Map, Microscope, ShieldAlert, Sprout, Leaf } from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: typeof Home;
  end?: boolean;
}

/** Primary navigation — kept deliberately short. */
export const NAV_PRIMARY: NavItem[] = [
  { to: '/app', label: 'Overview', icon: Home, end: true },
  { to: '/app/farms', label: 'My Farms', icon: Map },
  { to: '/app/soil', label: 'Soil', icon: Layers },
  { to: '/app/crop', label: 'Crop Health', icon: Sprout },
  { to: '/app/organic', label: 'Organic Farming', icon: Leaf },
  { to: '/app/insights', label: 'Insights', icon: LineChart },
];

/** Analysis tools used less often. */
export const NAV_TOOLS: NavItem[] = [
  { to: '/app/advisor', label: 'Farm Advisor', icon: Bot },
  { to: '/app/disease', label: 'Disease Analysis', icon: Microscope },
  { to: '/app/risk', label: 'Risk Intelligence', icon: ShieldAlert },
  { to: '/app/weather', label: 'Weather', icon: CloudSun },
];

export const ENGINE_ICON = FlaskConical;
