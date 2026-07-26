import type { IAgent, ReviewMode, AgentName } from './base.js';
import type { CustomAgentDefinition } from './custom/schema.js';
export declare const BUILTIN_NAMES: AgentName[];
/**
 * Derived from BUILTIN_AGENTS for backward compatibility.
 *
 * Array order IS the intentional priority order: when agentCount trims this
 * list down to a prefix (see getAgentsForMode below), security/architecture/
 * performance are prioritized and kept longest, while maintainability/
 * deadCode/testIntelligence/pragmatism/logic are dropped first — in that
 * reverse-insertion order, so logic goes first, then pragmatism, then
 * testIntelligence (testIntelligence survives longest of those three, but
 * still drops before deadCode/maintainability) — matching BUILTIN_AGENTS's
 * actual insertion order above (agents-104).
 */
export declare const AGENT_REGISTRY: IAgent[];
export declare function getAgentsForMode(mode: ReviewMode, agentOverrides?: AgentName[], customAgentDefs?: CustomAgentDefinition[], agentCount?: number): IAgent[];
