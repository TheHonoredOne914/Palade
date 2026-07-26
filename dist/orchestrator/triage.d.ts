import type { CodeChunk, FileManifest } from '../ingestion/types.js';
export declare function triageFiles(manifests: FileManifest[], allChunks: CodeChunk[], options?: {
    maxReviewTokens?: number;
    strictTriage?: boolean;
}): Promise<CodeChunk[]>;
export declare function scoreManifestForReview(m: FileManifest): number;
