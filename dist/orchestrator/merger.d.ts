import type { AgentFinding, Severity } from '../agents/base.js';
export declare const SEVERITY_RANK: Record<Severity, number>;
export declare function jaccardSimilarity(a: string, b: string): number;
export declare const NEAR_MATCH_WINDOW_LINES = 60;
export declare const NEAR_MATCH_SAME_AGENT_THRESHOLD = 0.5;
export declare const NEAR_MATCH_CROSS_AGENT_THRESHOLD = 0.7;
/** Optional overrides for the near-match tunables, defaulting to the module constants above. */
export interface NearMatchOptions {
    windowLines?: number;
    sameAgentThreshold?: number;
    crossAgentThreshold?: number;
}
/**
 * True when two findings are close enough in location and similar enough in
 * title to be considered "the same issue, reported near the same place" —
 * shared by merger.ts's own dedup (below) and memory.ts's cross-agent
 * correlation.
 */
/**
 * True when two findings' starting lines are within `windowLines` of each
 * other. Pulled out of isNearMatch so other line-proximity checks (e.g.
 * verdict.ts's conflict detector) can share the exact same window logic
 * instead of a second hand-rolled formula — verdict.ts used to have its own
 * gap/overlap check hardcoded to a 5-line window, independent of this
 * module's 60-line NEAR_MATCH_WINDOW_LINES (orchestrator-007).
 */
export declare function linesAreNear(a: AgentFinding, b: AgentFinding, windowLines?: number): boolean;
export declare function isNearMatch(a: AgentFinding, b: AgentFinding, opts?: NearMatchOptions): boolean;
export declare function mergeFindings(findings: AgentFinding[], opts?: NearMatchOptions): AgentFinding[];
export declare function groupBySeverity(findings: AgentFinding[]): Record<'critical' | 'high' | 'medium' | 'low' | 'info', AgentFinding[]>;
