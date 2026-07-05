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

/** Derived from BUILTIN_AGENTS for backward compatibility. */
export const AGENT_REGISTRY: IAgent[] = Array.from(BUILTIN_AGENTS.values())

export function getAgentsForMode(
  mode: ReviewMode,
  agentOverrides?: AgentName[],
  customAgentDefs: CustomAgentDefinition[] = []
): IAgent[] {
  const customAgents = new Map<string, CustomAgent>()
  for (const def of customAgentDefs) {
    customAgents.set(def.name, new CustomAgent(def))
  }

  // Merge built-in + custom for lookup
  const allAgents = new Map<string, IAgent>([...BUILTIN_AGENTS, ...customAgents])

  if (agentOverrides && agentOverrides.length > 0) {
    const agents: IAgent[] = []
    for (const name of agentOverrides) {
      const agent = allAgents.get(name)
      if (agent) agents.push(agent)
    }
    if (agents.length === 0) {
      throw new PaladeConfigError(
        `agentOverrides contains no recognized agent names: ${agentOverrides.join(', ')}`,
        'agentOverrides',
        `Available agents: ${[...allAgents.keys()].join(', ')}`
      )
    }
    return agents
  }
  // In practice swarm.ts always threads context.modeConfig.agentOverrides
  // through as `agentOverrides` above, so this only fires for direct callers
  // that skip modeConfig (e.g. tests). Derive the agent list from
  // GHOST_MODE.agentOverrides itself rather than a separately hardcoded name,
  // so there's a single source of truth for "what agents ghost mode runs".
  if (mode === 'ghost') {
    const ghostAgentName = GHOST_MODE.agentOverrides?.[0] ?? 'deadCode'
    return [allAgents.get(ghostAgentName) ?? BUILTIN_AGENTS.get('deadCode')!]
  }
  return [...AGENT_REGISTRY, ...customAgents.values()]
}
