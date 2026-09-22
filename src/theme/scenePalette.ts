import type { Theme } from './ThemeProvider';

/**
 * 3D palettes. The dark scene is a calm dusk (low warm light, fireflies) rather than
 * an inverted daytime scene. Kept close to the CSS tokens so 3D and UI feel like one system.
 */
export interface ScenePalette {
  fog: string;
  skyTop: string;
  skyBottom: string;
  ground: string;
  groundEdge: string;
  field: string;
  fieldTip: string;
  crop: string;
  cropHealthy: string;
  cropStressed: string;
  ear: string;
  trunk: string;
  canopy: string;
  canopy2: string;
  house: string;
  roof: string;
  sun: string;
  sunGlow: string;
  cloud: string;
  particle: string;
  node: string;
  line: string;
  warn: string;
  danger: string;
  water: string;
  soil: [string, string, string, string, string];
  hemiSky: string;
  hemiGround: string;
  keyLight: string;
  keyIntensity: number;
  ambient: number;
}

const light: ScenePalette = {
  fog: '#efe7d8',
  skyTop: '#e9eee4',
  skyBottom: '#f6f1e8',
  ground: '#b99a6c',
  groundEdge: '#a88a5d',
  field: '#8fae6b',
  fieldTip: '#d8c77f',
  crop: '#8aab69',
  cropHealthy: '#4f8a3d',
  cropStressed: '#b8b35a',
  ear: '#d9bd6a',
  trunk: '#7a5a3c',
  canopy: '#6c9458',
  canopy2: '#87a867',
  house: '#efe5d3',
  roof: '#a4553a',
  sun: '#f6d88f',
  sunGlow: '#fbe7b8',
  cloud: '#ffffff',
  particle: '#e8c96c',
  node: '#3f6b45',
  line: '#3f6b45',
  warn: '#c98a1f',
  danger: '#b5543a',
  water: '#5d9ab8',
  soil: ['#8a6a45', '#7a5a3a', '#6a4d33', '#5a412c', '#4a3626'],
  hemiSky: '#fff6e6',
  hemiGround: '#8a7555',
  keyLight: '#fff1d6',
  keyIntensity: 2.1,
  ambient: 0.55,
};

const dark: ScenePalette = {
  fog: '#1b1c17',
  skyTop: '#1a1d19',
  skyBottom: '#23241d',
  ground: '#4a3d2c',
  groundEdge: '#3a3024',
  field: '#4d6b41',
  fieldTip: '#8c8450',
  crop: '#5f8a4e',
  cropHealthy: '#7cad63',
  cropStressed: '#9f9a4c',
  ear: '#b39a58',
  trunk: '#4d3a28',
  canopy: '#3f5c37',
  canopy2: '#4d6b41',
  house: '#8f8676',
  roof: '#6e3a2a',
  sun: '#f0c27a',
  sunGlow: '#b98a4a',
  cloud: '#6b6a62',
  particle: '#f3d98a',
  node: '#8eb884',
  line: '#8eb884',
  warn: '#dbac54',
  danger: '#de866e',
  water: '#80b0c7',
  soil: ['#5d4630', '#503c29', '#443323', '#392b1e', '#2e2319'],
  hemiSky: '#a8a38f',
  hemiGround: '#2a2419',
  keyLight: '#f3c98e',
  keyIntensity: 1.8,
  ambient: 0.35,
};

export const scenePalette = (theme: Theme): ScenePalette => (theme === 'dark' ? dark : light);
