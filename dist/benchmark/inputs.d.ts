import type { CodeChunk } from '../ingestion/types.js';
export declare function makeMinifiedChunk(): CodeChunk;
export declare function makeNormalChunk(lineCount?: number, lineLength?: number): CodeChunk;
export declare function makeMixedChunk(): CodeChunk;
export declare function makeHugeSingleLineChunk(): CodeChunk;
export declare function makeWindowsPathChunk(): CodeChunk;
export declare function makeRelativePathChunk(): CodeChunk;
