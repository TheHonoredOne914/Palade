import type { Defect } from './groundTruth.js';
export interface AgentClaim {
    file: string;
    lineStart: number;
    lineEnd?: number;
    severity?: 'low' | 'medium' | 'high' | 'critical';
    claim: string;
}
export type ClaimOutcome = 'tp' | 'fp';
export interface MatchResult {
    claim: AgentClaim;
    defect?: Defect;
    outcome: ClaimOutcome;
    reason: string;
}
export interface ScoreOptions {
    lineTolerance?: number;
}
export interface ScoreReport {
    agentName: string;
    precision: number;
    recall: number;
    f1: number;
    falsePositiveRate: number;
    realBugCount: number;
    truePositives: number;
    falsePositives: number;
    claimCount: number;
    matches: MatchResult[];
}
export declare function scoreAgent(agentName: string, claims: AgentClaim[], defects: Defect[], opts?: ScoreOptions): ScoreReport;
export interface AgentRun {
    agentName: string;
    claims: AgentClaim[];
}
export interface BenchmarkReport {
    perAgent: ScoreReport[];
    aggregate: {
        precision: number;
        recall: number;
        f1: number;
        falsePositiveRate: number;
        distinctRealBugsFound: number;
        realBugCount: number;
        totalClaims: number;
        totalFalsePositives: number;
    };
}
export declare function scoreAgents(runs: AgentRun[], defects: Defect[], opts?: ScoreOptions): BenchmarkReport;
