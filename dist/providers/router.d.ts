import type { PaladeConfig } from '../config/schema.js';
import type { IProvider, CompletionRequest, CompletionResponse } from './base.js';
export declare class AllProvidersExhaustedError extends Error {
    readonly attempts: {
        provider: string;
        finalError: string;
    }[];
    constructor(attempts: {
        provider: string;
        finalError: string;
    }[]);
}
export type ProviderRole = 'primary' | 'synthesis' | 'triage';
export interface ProviderAssignment {
    primary: IProvider;
    synthesis: IProvider;
    triage: IProvider;
}
export declare const PROVIDER_NAMES: readonly ["opencode-zen", "nvidia", "groq", "cerebras", "openrouter", "ollama"];
export type SupportedProviderName = (typeof PROVIDER_NAMES)[number];
export declare class FallbackProvider implements IProvider {
    private chain;
    private _fallbackCount;
    private _totalCount;
    private readonly roleStats;
    constructor(primary: IProvider, fallbacks: IProvider[]);
    get name(): string;
    get model(): string;
    /** Number of calls that fell back to a non-primary provider. */
    get fallbackCount(): number;
    /** Total calls attempted. */
    get totalCount(): number;
    /** Record one call's outcome under `role`, for role-separated stats (providers-005). */
    recordRoleCall(role: ProviderRole, usedFallback: boolean): void;
    getRoleStats(role: ProviderRole): {
        total: number;
        fallbacks: number;
    };
    complete(req: CompletionRequest): Promise<CompletionResponse>;
    isAvailable(): Promise<boolean>;
}
export declare function initRouter(config: PaladeConfig): Promise<ProviderAssignment>;
/**
 * Overwrite the per-agent provider routing table getProvider() reads. Used by
 * swarm.ts to re-expand config.swarm.providerShares against the ACTUAL agent
 * roster for this run once getAgentsForMode() has resolved it — the
 * config-load-time expansion (config/loader.ts's expandProviderShares) has no
 * idea which mode will run, so it assumes the standard-mode agent list, which
 * modes with agentOverrides (onboard, ghost) don't follow (providers-002).
 */
export declare function updateAgentProviders(agentProviders: Record<string, string>): void;
export declare function getProvider(role: ProviderRole, agentName?: string): IProvider;
export interface FallbackStats {
    primary: {
        total: number;
        fallbacks: number;
    };
    synthesis: {
        total: number;
        fallbacks: number;
    };
    triage: {
        total: number;
        fallbacks: number;
    };
}
export declare function getFallbackStats(): FallbackStats | null;
