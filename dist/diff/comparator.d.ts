import type { AgentFinding } from '../agents/base.js';
import type { ChangedFile, FindingDiff } from './types.js';
/**
 * Parse a unified diff for a single file and return the HEAD line ranges
 * that were added or modified (i.e. the `+` lines). Findings whose line range
 * overlaps these regions are considered "in scope" for this diff.
 *
 * Exported so orchestrator/verdict.ts's checkDecisionDrift can reuse this
 * same parser instead of maintaining its own inline copy — the two used to
 * drift apart, including sharing this same header-vs-content bug.
 */
export declare function addedLineRanges(diff: string): Array<[number, number]>;
/**
 * When no base-branch findings are available, scope head findings to only
 * those that fall within added/changed lines of the diff. This produces a
 * meaningful "introduced" set instead of marking every finding as new.
 */
export declare function scopeToDiff(findings: AgentFinding[], changedFiles: ChangedFile[]): AgentFinding[];
export declare function compareFindings(headFindings: AgentFinding[], baseFindings: AgentFinding[] | undefined, changedFiles: ChangedFile[]): FindingDiff;
export declare function rankIntroducedFindings(introduced: AgentFinding[]): AgentFinding[];
