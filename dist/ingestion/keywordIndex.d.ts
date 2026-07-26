import type { CodeChunk } from './types.js';
type IndexedChunk = CodeChunk & {
    _words: string[];
};
export declare function buildKeywordIndex(chunks: CodeChunk[]): IndexedChunk[];
export declare function getKeywordContext(chunk: CodeChunk, index: IndexedChunk[], maxResults?: number, maxTokensPerResult?: number): string;
export {};
