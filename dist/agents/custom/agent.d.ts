import type { CodeChunk } from '../../ingestion/types.js';
import { type AgentFinding, type AgentContext, type IAgent, type AgentName, type Severity } from '../base.js';
import type { CustomAgentDefinition } from './schema.js';
export declare class CustomAgent implements IAgent {
    readonly name: AgentName;
    private readonly systemPrompt;
    private readonly penaltyOverrides;
    readonly domain: string;
    constructor(def: CustomAgentDefinition);
    /**
     * Get the explicit per-agent score penalty override for a severity, if the
     * custom agent definition configured one. Returns undefined when no
     * override is configured so the caller leaves f.scorePenalty unset and lets
     * calculateScore's configured severityWeights apply uniformly, same as
     * built-in specialists (see base.ts's parseFindingsResponse).
     */
    getScorePenalty(severity: Severity): number | undefined;
    analyze(chunks: CodeChunk[], context: AgentContext, signal?: AbortSignal): Promise<AgentFinding[]>;
}
