import { type TargetDefinition } from './schema.js';
export declare function loadTargets(projectRoot: string): Promise<TargetDefinition[]>;
export declare function resolveTargetPaths(target: TargetDefinition, projectRoot: string): string[];
