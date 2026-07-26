import type { FileManifest, CodeChunk } from './types.js';
export declare const MAX_TOKENS = 6000;
export declare const CHARS_PER_TOKEN = 4;
export declare function estimateTokens(content: string): number;
export declare function hardSplitBudget(hardChunkLimit: number): number;
export declare function splitLargeChunk(chunk: CodeChunk, hardChunkLimit?: number): CodeChunk[];
export declare function chunkFiles(manifests: FileManifest[]): Promise<CodeChunk[]>;
