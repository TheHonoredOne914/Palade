import type { CodeChunk } from '../ingestion/types.js';
import { type AgentFinding, type AgentContext, type AgentName } from './base.js';
import type { IAgent } from './base.js';
/**
 * Economy-mode analyzer: runs ALL specialist domains in a single provider call
 * per batch, with domain-tagged output, instead of N parallel per-domain calls.
 *
 * This is the one token-efficiency mechanism that actually cuts the ~6x resend
 * of the same chunk content across agents. The other candidate mechanisms are
 * non-viable here:
 *   - Provider prefix caching: each agent has a DIFFERENT system prompt, so the
 *     shared chunk content (in the user-message position) never forms a shared
 *     cacheable prefix across agents. Intra-agent caching is already automatic.
 *   - Shared system-prompt prefix: the system prompts differ per domain, so
 *     there is no shared prefix to dedupe.
 *
 * Tradeoff taken (rule 5 — stated, not dodged): combining domains into one call
 *   - LOSES parallelism: 6 agents finish in ~1 wall-clock call length, but a
 *     single combined call must read all domains, so its latency is closer to
 *     the slowest agent than the fastest. Net: latency usually goes UP, spend
 *     goes DOWN. Users opt in when cost > latency.
 *   - WEAKENS domain specificity: one prompt can't be as richly tuned per
 *     domain as six dedicated prompts. Findings may be less precise.
 *   - KEEPS per-domain scoring: each finding is tagged with its agentName, so
 *     the category score breakdown and synthesis pipeline are unchanged.
 */
/** Per-domain instruction block appended to the combined system prompt. */
export interface DomainSpec {
    name: AgentName;
    label: string;
    focus: string;
}
export declare const DEFAULT_DOMAINS: DomainSpec[];
/**
 * A drop-in IAgent whose .analyze runs all domains in one provider call.
 * Carries a synthetic name for logging; real attribution comes from each
 * finding's agentName field.
 */
export declare class CombinedAnalyzer implements IAgent {
    readonly name: AgentName;
    readonly domains: DomainSpec[];
    constructor(domains?: DomainSpec[]);
    analyze(chunks: CodeChunk[], context: AgentContext, signal?: AbortSignal): Promise<AgentFinding[]>;
}
export declare function attributeFindings(findings: AgentFinding[], domains: DomainSpec[], provider?: string, model?: string): AgentFinding[];
