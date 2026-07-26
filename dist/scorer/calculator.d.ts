import type { AgentFinding, Severity } from '../agents/base.js';
import type { CrossAgentFinding } from '../orchestrator/types.js';
import type { ScoreCategory, CategoryScore, ScoreResult } from './types.js';
/** Category/total penalty caps, overridable via `config.score.penaltyCaps`. */
export interface PenaltyCaps {
    categoryPenaltyCap: number;
    totalPenaltyCap: number;
}
/** Complexity-multiplier thresholds/factors, overridable via `config.score.complexityPenalties`. */
export interface ComplexityPenalties {
    lowThreshold: number;
    lowFactor: number;
    highThreshold: number;
    highFactor: number;
}
/**
 * Scales a finding's penalty by the complexity of the code it was found in:
 * simpler code gets a lighter penalty, very complex code a heavier one.
 * Shared by calculateCategoryScore and calculateTotalPenalty so the two
 * don't drift out of sync (scorer-002).
 */
export declare function applyComplexityMultiplier(complexity: number, penalty: number, thresholds?: ComplexityPenalties): number;
/** Per-severity penalty weights, overridable via `config.score.severityWeights`. */
export type SeverityWeights = Record<Severity, number>;
/** Base per-conflict penalty weights, overridable via `config.score.crossAgentPenalty`. */
export interface CrossAgentPenaltyWeights {
    critical: number;
    high: number;
    medium: number;
}
/**
 * Per-finding penalty. Honors an explicit `scorePenalty` when the producing
 * agent set one (custom agents with severityPenalty overrides), and falls back
 * to the severity-based weight for built-in findings, which never set it.
 *
 * Previously this read SEVERITY_WEIGHTS[f.severity] unconditionally, which made
 * CustomAgent's per-severity override feature dead code — an agent configured
 * with { critical: 50 } still got penalized at 10.
 */
export declare function penaltyFor(f: AgentFinding, severityWeights?: SeverityWeights): number;
export declare function countBySeverity(findings: AgentFinding[], agentName: string): {
    total: number;
    critical: number;
    high: number;
};
export declare function calculateCategoryScore(findings: AgentFinding[], category: ScoreCategory, severityWeights?: SeverityWeights, complexityPenalties?: ComplexityPenalties, categoryPenaltyCap?: number): CategoryScore;
export declare const MAINTAINABILITY_AGENT = "maintainability";
export declare function computeFindingPenalty(f: AgentFinding, severityWeights: SeverityWeights, complexityPenalties: ComplexityPenalties): number;
export declare function calculateTotalPenalty(findings: AgentFinding[], severityWeights?: SeverityWeights, complexityPenalties?: ComplexityPenalties): number;
export declare function calculateCrossAgentPenalty(crossFindings: CrossAgentFinding[], weights?: CrossAgentPenaltyWeights): number;
export interface ScoreWeightsConfig {
    severityWeights?: Partial<SeverityWeights>;
    crossAgentPenalty?: Partial<CrossAgentPenaltyWeights>;
    complexityPenalties?: Partial<ComplexityPenalties>;
    penaltyCaps?: Partial<PenaltyCaps>;
}
export declare function calculateScore(findings: AgentFinding[], crossAgentFindings: CrossAgentFinding[], previousScore?: number | null, scoreConfig?: ScoreWeightsConfig, 
/**
 * Categories that actually ran this review (e.g. via context.modeConfig's
 * agentOverrides, or a swarm's agentsRun list). When omitted, defaults to
 * "all categories" — matching the historical behavior for callers that run
 * every built-in agent. When provided, only these categories are averaged
 * into the score: an agent that never ran must not silently contribute a
 * free 100 and dilute the real score (scorer-001).
 */
executedCategories?: ScoreCategory[]): ScoreResult;
