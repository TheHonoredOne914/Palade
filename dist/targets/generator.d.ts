import { type TargetDefinition } from './schema.js';
export declare function generateTarget(query: string, projectRoot: string): Promise<TargetDefinition | null>;
