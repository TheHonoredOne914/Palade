import type { IAgent, ReviewMode, AgentName } from './base.js'
import { PaladeConfigError } from '../errors/types.js'
import { GHOST_MODE } from '../modes/ghost.js'
import { SecurityAgent } from './specialist/security.js'
import { ArchitectureAgent } from './specialist/architecture.js'
import { PerformanceAgent } from './specialist/performance.js'
import { MaintainabilityAgent } from './specialist/maintainability.js'
import { DeadCodeAgent } from './specialist/deadCode.js'
import { TestIntelligenceAgent } from './specialist/testIntelligence.js'
import { PragmatismAgent } from './specialist/pragmatism.js'
import { LogicAgent } from './specialist/logic.js'
import type { CustomAgentDefinition } from './custom/schema.js'
import { CustomAgent } from './custom/agent.js'

const BUILTIN_AGENTS = new Map<AgentName, IAgent>([
  ['security', new SecurityAgent()],
  ['architecture', new ArchitectureAgent()],
  ['performance', new PerformanceAgent()],
  ['maintainability', new MaintainabilityAgent()],
  ['deadCode', new DeadCodeAgent()],
  ['testIntelligence', new TestIntelligenceAgent()],
  ['pragmatism', new PragmatismAgent()],
  ['logic', new LogicAgent()],
])

// Derived from BUILTIN_AGENTS's key set (insertion order preserved by Map)
// rather than hand-typed, so this can't drift from the map above the way it
// once could — mirrors AGENT_REGISTRY's derivation just below.
export const BUILTIN_NAMES = Array.from(BUILTIN_AGENTS.keys()) as AgentName[]

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
export const AGENT_REGISTRY: IAgent[] = Array.from(BUILTIN_AGENTS.values())

export function getAgentsForMode(
  mode: ReviewMode,
  agentOverrides?: AgentName[],
  customAgentDefs: CustomAgentDefinition[] = [],
  agentCount?: number
): IAgent[] {
  const customAgents = new Map<string, CustomAgent>()
  for (const def of customAgentDefs) {
    customAgents.set(def.name, new CustomAgent(def))
  }

  // Merge built-in + custom for lookup
  const allAgents = new Map<string, IAgent>([...BUILTIN_AGENTS, ...customAgents])

  // In practice swarm.ts always threads context.modeConfig.agentOverrides
  // through as `agentOverrides`, so this fallback only fires for direct
  // callers that skip modeConfig (e.g. tests). Derive it from
  // GHOST_MODE.agentOverrides itself rather than a separately hardcoded name,
  // so there's a single source of truth for "what agents ghost mode runs" —
  // and route it through the SAME branch below as an explicit override, so
  // ghost mode also gets the additive custom-agent merge instead of
  // hand-rolling a single-agent array that silently drops every custom agent.
  const effectiveOverrides =
    agentOverrides && agentOverrides.length > 0
      ? agentOverrides
      : mode === 'ghost'
        ? (GHOST_MODE.agentOverrides ?? ['deadCode'])
        : undefined

  if (effectiveOverrides && effectiveOverrides.length > 0) {
    // De-dupe before resolving to agent instances — a repeated name in
    // agentOverrides (e.g. user config typo/duplication) used to push the
    // same agent instance into `agents` once per repetition, running it
    // multiple times per batch for no benefit (agents-103).
    const dedupedOverrides = Array.from(new Set(effectiveOverrides))
    const agents: IAgent[] = []
    const unmatched: AgentName[] = []
    for (const name of dedupedOverrides) {
      const agent = allAgents.get(name)
      if (agent) agents.push(agent)
      else unmatched.push(name)
    }
    if (agents.length === 0) {
      throw new PaladeConfigError(
        `agentOverrides contains no recognized agent names: ${effectiveOverrides.join(', ')}`,
        'agentOverrides',
        `Available agents: ${[...allAgents.keys()].join(', ')}`
      )
    }
    // A typo'd/unknown name mixed in with otherwise-valid names used to be
    // silently dropped as long as at least one other name resolved — fail
    // fast instead, matching the all-invalid case above and the custom agent
    // loader's fail-fast pattern, so a config with one bad entry doesn't
    // silently narrow the swarm with no warning.
    if (unmatched.length > 0) {
      throw new PaladeConfigError(
        `agentOverrides contains unrecognized agent names: ${unmatched.join(', ')}`,
        'agentOverrides',
        `Available agents: ${[...allAgents.keys()].join(', ')}`
      )
    }
    // Custom agents are additive here too, matching the default branch below —
    // otherwise a mode with agentOverrides set (e.g. ghost/onboard via
    // modeConfig) silently drops every custom agent the user configured.
    // Skip any custom agent already present via an explicit override name to
    // avoid double-including it.
    const overriddenNames = new Set(agents.map((a) => a.name))
    for (const customAgent of customAgents.values()) {
      if (!overriddenNames.has(customAgent.name)) agents.push(customAgent)
    }
    return agents
  }
  // Custom agents are additive and never counted against the cap — the cap
  // is on built-in specialist parallelism (matches config.swarm.agentCount's
  // usage in the cost estimator and CLI progress counters, see
  // src/ingestion/estimator.ts and src/cli/commands/diff.ts).
  const builtIns =
    agentCount && agentCount > 0 ? AGENT_REGISTRY.slice(0, agentCount) : AGENT_REGISTRY
  return [...builtIns, ...customAgents.values()]
}
