import type { CodeChunk, Language } from '../ingestion/types.js';
import type { ModeConfig } from '../modes/index.js';
import { type IProvider, type CompletionRequest, type CompletionResponse } from '../providers/base.js';
export declare function formatSpecAndConstitution(context?: AgentContext): string;
export type ReviewMode = 'standard' | 'security' | 'onboard' | 'debt' | 'ghost';
/** Built-in agent names. Custom agents use arbitrary strings. */
export type AgentName = 'security' | 'architecture' | 'performance' | 'maintainability' | 'deadCode' | 'testIntelligence' | 'pragmatism' | 'logic' | (string & {});
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export interface AgentFinding {
    id: string;
    agentName: AgentName;
    severity: Severity;
    title: string;
    description: string;
    filePath?: string;
    lineStart?: number;
    lineEnd?: number;
    symbolName?: string;
    tags: string[];
    /**
     * Explicit per-finding penalty override (set by custom agents with
     * severityPenalty config, or economy-mode attribution). Left unset for
     * built-in specialist findings so calculateScore's configured
     * severityWeights actually apply instead of being shadowed by a value
     * pre-baked from the default SEVERITY_PENALTY table — see scorer/calculator.ts.
     */
    scorePenalty?: number;
    findingFingerprint?: string;
    estimatedHours?: number;
    hoursWasted?: number;
    /** The provider that actually produced this finding (may differ from primary on fallback). */
    provider?: string;
    /** The model that actually produced this finding. */
    model?: string;
    complexity?: number;
    /** When this finding results from merging findings across agents, the original agent names. */
    mergedFromAgents?: AgentName[];
}
export interface DiffContext {
    baseBranch: string;
    headBranch: string;
    changedFiles: Array<{
        path: string;
        status: 'added' | 'modified' | 'deleted';
        additions: number;
        deletions: number;
        diff: string;
    }>;
}
export interface AnnotationSummary {
    reviewRequests: Array<{
        filePath: string;
        line: number;
        reason: string;
    }>;
    focusRequests: Array<{
        filePath: string;
        line: number;
        domain: string;
    }>;
    ignoredFiles: string[];
    ignoredLines: Array<{
        filePath: string;
        startLine: number;
    }>;
}
export interface AgentContext {
    targetDescription?: string;
    targetFocus?: string[];
    projectLanguages: Language[];
    totalFiles: number;
    totalChunks: number;
    mode: ReviewMode;
    diffContext?: DiffContext;
    annotations?: AnnotationSummary;
    modeConfig?: ModeConfig;
    /** Optional user-provided architectural/business logic spec */
    spec?: string;
    /** The formal constitution with behavioral guidelines for the agents */
    constitution?: string;
    /** Pre-rendered repository-wide context block (see ingestion/repoContext.ts) */
    repoContext?: string;
    /**
     * Whether to append the built-in Ponytail/Karpathy/GStack skills block to
     * this agent's system prompt. Defaults to true (unset === enabled) so
     * behavior is unchanged unless a caller explicitly opts out via
     * `swarm.includeSkills: false` in config.
     */
    includeSkills?: boolean;
    /**
     * Full set of known project-relative file paths (from FileManifest),
     * populated by runSwarm when manifests are available. Lets
     * verifyCriticalHighFindings distinguish a finding that cites a real
     * project file outside the CURRENT BATCH (e.g. surfaced via injected
     * cross-file/repoContext) from a genuinely hallucinated file path.
     */
    knownFilePaths?: Set<string>;
    /**
     * Concurrency cap for provider calls made within a single analyze() call
     * (e.g. verifyCriticalHighFindings' self-consistency checks). Mirrors
     * SwarmOptions.maxConcurrentBatches so per-batch verification concurrency
     * respects the same configured value swarm.ts uses for batch scheduling.
     */
    maxConcurrentBatches?: number;
}
export interface IAgent {
    name: AgentName;
    analyze(chunks: CodeChunk[], context: AgentContext, signal?: AbortSignal): Promise<AgentFinding[]>;
}
export declare function computeMaxTokens(chunkCount: number, domainCount?: number): number;
export declare function buildChunkContext(chunks: CodeChunk[]): string;
export declare function unparsableResponseFinding(agentName: AgentName, reason: string): AgentFinding[];
export declare function parseFindingsResponse(raw: string, agentName: AgentName, trustModelAgentName?: boolean): AgentFinding[];
export declare function buildSystemPrompt(base: string, context: AgentContext, modeConfig?: ModeConfig): string;
/** True when parseFindingsResponse returned ONLY its parse-failure sentinel. */
export declare function isParseFailureSentinel(findings: AgentFinding[]): boolean;
/**
 * Calls the provider and parses the findings response, retrying ONCE with a
 * strict JSON-only correction if the first response was unparsable (prose or
 * garbled output instead of a JSON array). Weak free-tier models frequently
 * recover on a strict retry — this was the dominant failure mode in
 * docs/BENCHMARKS.md (2–4 of 6 agents returning unparsable output). Bounded to
 * a single extra call so a persistently broken model can't loop. If the retry
 * also fails, the original parse-failure sentinel is returned so the
 * review-incomplete signal still reaches the user.
 *
 * Note: an empty-but-valid `[]` response ("found nothing") is NOT a parse
 * failure and never triggers a retry.
 */
export declare function completeAndParseFindings(provider: IProvider, request: CompletionRequest, agentName: AgentName, trustModelAgentName?: boolean): Promise<{
    findings: AgentFinding[];
    response: CompletionResponse;
}>;
/**
 * Re-asks the model a strict YES/NO question to confirm each critical/high
 * finding against the actual code chunk it references, dropping any it can't
 * confirm. Shared so every analyze() path (per-domain specialists AND the
 * combined economy-mode analyzer) verifies critical/high findings the same
 * way instead of only some paths guarding against false positives.
 */
export declare function verifyCriticalHighFindings(findings: AgentFinding[], chunks: CodeChunk[], provider: IProvider, context?: AgentContext, signal?: AbortSignal): Promise<AgentFinding[]>;
/**
 * Annotate findings with the cyclomatic complexity of the code chunk they
 * reference (used later for maintainability-penalty scaling in the scorer).
 * Shared so every analyze() path — per-domain specialists, the combined
 * economy-mode analyzer, and custom agents — annotates complexity the same
 * way instead of only some paths populating it.
 */
export declare function annotateComplexity(findings: AgentFinding[], chunks: CodeChunk[]): AgentFinding[];
export declare abstract class BaseSpecialistAgent implements IAgent {
    abstract name: AgentName;
    protected abstract getSystemPrompt(context?: AgentContext): string;
    analyze(chunks: CodeChunk[], context: AgentContext, signal?: AbortSignal): Promise<AgentFinding[]>;
}
