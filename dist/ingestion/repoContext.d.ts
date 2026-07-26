import type { CodeChunk, FileManifest } from './types.js';
export interface RepoContext {
    dependencyCycles: string[][];
    testedBy: Record<string, string[]>;
    publicApiFiles: string[];
    isLibrary: boolean;
    buildTimeFiles: string[];
    validatorDeps: string[];
    moduleGlobals: Array<{
        file: string;
        name: string;
        kind: 'Map' | 'Set';
        hasCleanup: boolean;
    }>;
}
export declare function buildRepoContext(manifests: FileManifest[], chunks: CodeChunk[], projectRoot: string): Promise<RepoContext>;
export declare function renderRepoContext(ctx: RepoContext): string;
