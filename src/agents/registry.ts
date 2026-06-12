import type { IAgent, ReviewMode } from './base.js'
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

export function getAgentsForMode(mode: ReviewMode): IAgent[] {
  if (mode === 'ghost') return [new DeadCodeAgent()]
  return AGENT_REGISTRY
}
