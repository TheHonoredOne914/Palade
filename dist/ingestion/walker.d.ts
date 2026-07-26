import { Ignore } from 'ignore';
import type { FileManifest, ScopeOptions, LanguageProfile } from './types.js';
export declare function detectLanguages(projectRoot: string, scope: ScopeOptions): Promise<LanguageProfile>;
export declare function buildIgnoreFilter(projectRoot: string): Promise<Ignore>;
export declare function walkProject(projectRoot: string, scope: ScopeOptions): Promise<FileManifest[]>;
