import type { Basis, Level } from './common';

export type RecCategory = 'nutrient' | 'protection' | 'soil' | 'water' | 'monitoring';

/** When the advice applies, as the rule states it — not a scheduled date. */
export type RecHorizon = 'now' | 'this-week' | 'next-season';

export interface Recommendation {
  id: string;
  category: RecCategory;
  priority: Level;
  title: string;
  observation: string;
  risk: string;
  action: string;
  why: string;
  nextStep: string;
  basis: Basis;
  /** Link to the organic practice in the knowledge base, if any. */
  practiceId?: string;
  /** When it applies. Set by the Farm Advisor; absent on knowledge-base items. */
  horizon?: RecHorizon;
  /** Part of the field it concerns, only when a field record names one. */
  area?: string;
  /** How the recommendation was produced. Never 'model' until a trained model is connected. */
  engine: 'demo-rules' | 'model';
}

export interface OrganicPractice {
  id: string;
  name: string;
  category: 'nutrient' | 'protection' | 'soil';
  kind: string; // e.g. 'Biofertilizer', 'Botanical', 'Practice'
  summary: string;
  addresses: string[]; // condition tags
  crops: string[]; // crop ids or '*'
  stages: string[]; // stage ids or '*'
  usesInputs: string[];
  howTo: string[];
  timing: string;
  cautions: string[];
  evidence: string;
}

export interface OrganicRecommendation {
  practice: OrganicPractice;
  relevance: number; // 0..1 rule score, not a probability
  matched: string[]; // human readable reasons
  hasInputs: boolean;
  /** 'now' fits the current crop stage; 'next-season' must be planned ahead. */
  when: 'now' | 'next-season';
  recommendation: Recommendation;
}
