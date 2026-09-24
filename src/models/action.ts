import type { Recommendation, RecHorizon } from './recommendation';

/** App modules an action can send the farmer to. The UI maps these to routes. */
export type ActionModule = 'soil' | 'crop' | 'weather' | 'organic' | 'disease' | 'risk' | 'advisor';

/** Things on the dashboard field view an action can point at. */
export type FieldTarget = 'patch';

/**
 * One thing for the farmer to do, derived from a recommendation. It adds what the dashboard
 * needs to show it (when, from which records, where to go next) without restating the advice.
 */
export interface FarmAction {
  id: string;
  rec: Recommendation;
  horizon: RecHorizon;
  /** Records the rule read, in plain words (e.g. 'Soil test', 'Field note'). */
  signals: string[];
  area?: string;
  fieldTarget?: FieldTarget;
  module: ActionModule;
  plan: 'open' | 'planned' | 'done';
}
