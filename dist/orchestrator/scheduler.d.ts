import type { CodeChunk } from '../ingestion/types.js';
export declare const ECONOMY_SOFT_TOKEN_CAP = 6000;
export declare const ECONOMY_HARD_CHUNK_CAP = 3000;
export declare function estimateTotalTokens(chunks: CodeChunk[]): number;
export declare function scheduleBatches(chunks: CodeChunk[], softTokenLimit?: number, hardChunkLimit?: number): CodeChunk[][];
