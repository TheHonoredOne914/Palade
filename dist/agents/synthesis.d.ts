import type { AgentContext, AgentFinding, Severity } from './base.js';
import type { CrossAgentFinding } from '../orchestrator/types.js';
export interface PriorityFix {
    rank: number;
    title: string;
    rationale: string;
    estimatedHours: number;
    affectedFiles: string[];
}
export interface DebtEstimate {
    critical: number;
    high: number;
    medium: number;
    low: number;
    total: number;
    highestROIFix: string;
}
export interface SynthesisResult {
    executiveSummary: string;
    priorityFixes: PriorityFix[];
    crossCuttingObservations: string[];
    debtEstimate: DebtEstimate;
}
export interface SynthesizeOptions {
    /** Max findings (by severity) sent to the LLM for synthesis. Default 50. */
    maxSynthesisFindings?: number;
    /** Timeout in ms for the synthesis provider call. Default 180_000 (180s). */
    synthesisTimeoutMs?: number;
    /** External abort signal so user cancellation (Ctrl+C) propagates to the synthesis provider call. */
    signal?: AbortSignal;
    /**
     * Per-severity penalty weights (config.score.severityWeights) used to rank
     * findings for the synthesis prompt. Falls back to penaltyFor's own
     * default (the hardcoded SEVERITY_PENALTY table) when omitted, so the
     * executive summary's top-N ranking matches the same weights the score
     * itself uses instead of silently diverging when a user customizes them.
     */
    severityWeights?: Record<Severity, number>;
}
export declare function synthesize(allFindings: AgentFinding[], crossAgentFindings: CrossAgentFinding[], context: AgentContext, options?: SynthesizeOptions): Promise<SynthesisResult>;
