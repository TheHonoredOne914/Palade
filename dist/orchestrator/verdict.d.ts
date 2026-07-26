import type { AgentFinding, AgentContext } from '../agents/base.js';
import type { ChangedFile } from '../diff/types.js';
export interface Conflict {
    filePath: string;
    lineStart: number;
    lineEnd: number;
    sideA: AgentFinding;
    sideB: AgentFinding;
    /**
     * How confident the cheap keyword-based valence tally is that this is a
     * real conflict — informational only. 'high' means the tally itself found
     * clear opposite harden/relax signals; 'low' covers near-ties, one-sided
     * signals, and pairs with no keyword signal at all. Every entry here still
     * gets sent to the LLM for arbitration — the tally is only used upstream
     * (in detectConflicts) to skip pairs it's confident actually AGREE, not to
     * decide what counts as a conflict.
     */
    confidence: 'low' | 'high';
}
export interface Verdict {
    is_conflict: boolean;
    decision: string;
    tradeoff_accepted: string;
    confidence: number;
    losing_side: string;
}
export declare function detectConflicts(findings: AgentFinding[]): Conflict[];
export declare function arbitrateConflict(conflict: Conflict, context: AgentContext, signal?: AbortSignal): Promise<Verdict | null>;
export declare function saveDecision(projectRoot: string, conflict: Conflict, verdict: Verdict, retentionLimit?: number): Promise<string>;
export declare function checkDecisionDrift(projectRoot: string, changedFiles: ChangedFile[]): Promise<string[]>;
