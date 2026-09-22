import type { Basis, Level } from './common';

export interface WeatherDay {
  date: string;
  tMin: number;
  tMax: number;
  humidity: number;
  rainMm: number;
  windKmh: number;
  condition: 'sunny' | 'partly' | 'cloudy' | 'fog' | 'rain';
}

export interface WeatherSnapshot {
  location: string;
  current: { tempC: number; humidity: number; windKmh: number; condition: WeatherDay['condition'] };
  days: WeatherDay[];
  source: 'sample-forecast' | 'live-weather';
  sourceNote: string;
}

export interface AgroImplication {
  id: string;
  title: string;
  detail: string;
  level: Level;
  basis: Basis;
}
