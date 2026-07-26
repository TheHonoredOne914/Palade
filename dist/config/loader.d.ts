import { type PaladeConfig } from './schema.js';
export declare function readPackageJson(projectRoot: string): Record<string, unknown> | null;
/**
 * Expand a declarative provider-share map ({ 'opencode-zen': 5, openrouter: 3 })
 * into per-agent agentProviders entries. Shares are consumed in the map's
 * insertion order, assigned over the active agents in registry priority order
 * (BUILTIN_NAMES prefix of agentCount) by default. Shares beyond the agent
 * list length are ignored; agents left without a share get no entry and fall
 * through to swarm.primary.
 *
 * `agentNames`, when given, overrides the BUILTIN_NAMES/agentCount-derived
 * list entirely. This config-load-time call has no idea what review mode
 * will run (modes with agentOverrides — onboard, ghost — dispatch a
 * completely different, fixed agent list that ignores agentCount), so a
 * caller that DOES know the actual resolved agent list (e.g. swarm.ts, once
 * getAgentsForMode() has run) can re-expand shares against the real
 * dispatched agents instead of the standard-mode assumption baked in here
 * (providers-002).
 */
export declare function expandProviderShares(shares: Record<string, number>, agentCount: number, agentNames?: string[]): Record<string, string>;
export declare function loadConfig(): Promise<PaladeConfig>;
