import type { ReporterContext, ReporterOutput } from './types.js';
import type { ScoreResult } from '../scorer/types.js';
import type { FindingDiff, ChangedFile } from '../diff/types.js';
export declare function reportTerminal(ctx: ReporterContext): Promise<ReporterOutput>;
export declare function printDiffBanner(ctx: {
    projectName: string;
    headBranch: string;
    baseBranch: string;
    changedCount: number;
    additions: number;
    deletions: number;
}): string;
export declare function printDiffSummary(ctx: {
    score: ScoreResult;
    findingDiff: FindingDiff;
    changedFiles: ChangedFile[];
    baseBranch: string;
    headBranch: string;
    hasCriticalIntroduced: boolean;
    durationMs: number;
}): string;
