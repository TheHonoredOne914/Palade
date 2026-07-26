import type { CodeChunk } from './types.js';
export declare function resolveSymbol(symbolRef: string, projectRoot: string): Promise<CodeChunk | null>;
