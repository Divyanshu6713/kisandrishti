import { serviceConfig } from '../config';
import { localKnowledge, localRecords } from './localAdapter';
import { restKnowledge, restRecords } from './restAdapter';
import type { FarmRecordsRepository, KnowledgeRepository } from './repository';

export * from './repository';
export { DEMO_FARM_ID } from './constants';

/** The single place that decides which adapter backs the app. */
export const knowledge: KnowledgeRepository = serviceConfig.dataSource === 'rest' ? restKnowledge : localKnowledge;
export const records: FarmRecordsRepository = serviceConfig.dataSource === 'rest' ? restRecords : localRecords;
