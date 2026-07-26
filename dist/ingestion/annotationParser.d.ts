import type { Annotation, FileManifest, CodeChunk } from './types.js';
import type { AnnotationSummary, AgentFinding } from '../agents/base.js';
export declare function parseFile(absolutePath: string, isHashComment?: boolean): Promise<Annotation[]>;
export declare function buildAnnotationSummary(manifests: FileManifest[], chunks: CodeChunk[]): AnnotationSummary;
export declare function applyLineIgnores(findings: AgentFinding[], ignoredLines: {
    filePath: string;
    startLine: number;
}[]): AgentFinding[];
