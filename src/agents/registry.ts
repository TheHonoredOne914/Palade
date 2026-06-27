import type { IAgent, ReviewMode, AgentName } from './base.js'
import { SecurityAgent } from './specialist/security.js'
import { ArchitectureAgent } from './specialist/architecture.js'
import { PerformanceAgent } from './specialist/performance.js'
import { MaintainabilityAgent } from './specialist/maintainability.js'
import { DeadCodeAgent } from './specialist/deadCode.js'
import { TestIntelligenceAgent } from './specialist/testIntelligence.js'
import type { CustomAgentDefinition } from './custom/schema.js'
import { CustomAgent } from './custom/agent.js'

const BUILTIN_AGENTS = new Map<AgentName, IAgent>([
  ['security', new SecurityAgent()],
  ['architecture', new ArchitectureAgent()],
  ['performance', new PerformanceAgent()],
  ['maintainability', new MaintainabilityAgent()],
  ['deadCode', new DeadCodeAgent()],
  ['testIntelligence', new TestIntelligenceAgent()],
])

/** Derived from BUILTIN_AGENTS for backward compatibility. */
export const AGENT_REGISTRY: IAgent[] = Array.from(BUILTIN_AGENTS.values())

let customAgents: Map<string, CustomAgent> = new Map()

/** Register custom agents from user config. Called once at swarm startup. */
export function registerCustomAgents(defs: CustomAgentDefinition[]): void {
  customAgents = new Map()
  for (const def of defs) {
    customAgents.set(def.name, new CustomAgent(def))
  }
}

/** Get all registered custom agent names. */
export function getCustomAgentNames(): string[] {
  return Array.from(customAgents.keys())
}

export function getAgentsForMode(mode: ReviewMode, agentOverrides?: AgentName[]): IAgent[] {
  // Merge built-in + custom for lookup
  const allAgents = new Map<string, IAgent>([...BUILTIN_AGENTS, ...customAgents])

  if (agentOverrides && agentOverrides.length > 0) {
    const agents: IAgent[] = []
    for (const name of agentOverrides) {
      const agent = allAgents.get(name)
      if (agent) agents.push(agent)
    }
    return agents.length > 0 ? agents : AGENT_REGISTRY
  }
  if (mode === 'ghost') return [allAgents.get('deadCode') ?? BUILTIN_AGENTS.get('deadCode')!]
  return [...AGENT_REGISTRY, ...customAgents.values()]
}
