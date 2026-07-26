import { type TargetDefinition } from './schema.js';
export interface RegistryTarget {
    name: string;
    description: string;
    version: string;
    keywords: string[];
}
export declare function searchTargets(query: string): Promise<RegistryTarget[]>;
export declare function getTargetFromRegistry(packageName: string): Promise<TargetDefinition | null>;
export declare function appendTargetToFile(projectRoot: string, target: TargetDefinition): void;
