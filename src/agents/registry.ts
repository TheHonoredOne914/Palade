import type { IAgent, ReviewMode, AgentName } from './base.js'
import { SecurityAgent } from './specialist/security.js'
import { ArchitectureAgent } from './specialist/architecture.js'
import { PerformanceAgent } from './specialist/performance.js'
import { MaintainabilityAgent } from './specialist/maintainability.js'
import { DeadCodeAgent } from './specialist/deadCode.js'
import { TestIntelligenceAgent } from './specialist/testIntelligence.js'

export const AGENT_REGISTRY: IAgent[] = [
  new SecurityAgent(),
  new ArchitectureAgent(),
  new PerformanceAgent(),
  new MaintainabilityAgent(),
  new DeadCodeAgent(),
  new TestIntelligenceAgent(),
]

const AGENT_MAP: Record<AgentName, IAgent> = {
  security: new SecurityAgent(),
  architecture: new ArchitectureAgent(),
  performance: new PerformanceAgent(),
  maintainability: new MaintainabilityAgent(),
  deadCode: new DeadCodeAgent(),
  testIntelligence: new TestIntelligenceAgent(),
}

export function getAgentsForMode(
  mode: ReviewMode,
  agentOverrides?: AgentName[]
): IAgent[] {
  if (agentOverrides && agentOverrides.length > 0) {
    const agents: IAgent[] = []
    for (const name of agentOverrides) {
      const agent = AGENT_MAP[name]
      if (agent) agents.push(agent)
    }
    return agents.length > 0 ? agents : AGENT_REGISTRY
  }
  if (mode === 'ghost') return [new DeadCodeAgent()]
  return AGENT_REGISTRY
}
