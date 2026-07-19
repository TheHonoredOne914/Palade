import chalk from 'chalk'
import type { IAgent, AgentName } from '../agents/base.js'
import { CustomAgent } from '../agents/custom/agent.js'
import { CombinedAnalyzer, DEFAULT_DOMAINS } from '../agents/combined.js'
import { ECONOMY_SOFT_TOKEN_CAP, ECONOMY_HARD_CHUNK_CAP } from './scheduler.js'

export function applyEconomyRouting(agents: IAgent[], economyMode: boolean): IAgent[] {
  if (!economyMode) return agents
  const builtInAgents = agents.filter((a) => !(a instanceof CustomAgent))
  const customAgents = agents.filter((a) => a instanceof CustomAgent)

  if (builtInAgents.length <= 1) {
    if (builtInAgents.length === 1) {
      console.warn(
        chalk.yellow(
          '⚠ Economy mode requested but only 1 built-in agent active — falling back to standard mode.'
        )
      )
    }
    return agents
  }

  const activeDomains = builtInAgents.map((a) => {
    const defaultSpec = DEFAULT_DOMAINS.find((d) => d.name === a.name)
    return defaultSpec || { name: a.name as AgentName, label: a.name, focus: 'General code review' }
  })
  return [new CombinedAnalyzer(activeDomains), ...customAgents]
}

export function applyEconomyLimits(
  economyMode: boolean,
  softTokenLimit?: number,
  hardChunkLimit?: number
): { softTokenLimit?: number; hardChunkLimit?: number } {
  return {
    softTokenLimit: economyMode
      ? Math.min(softTokenLimit ?? Infinity, ECONOMY_SOFT_TOKEN_CAP)
      : softTokenLimit,
    hardChunkLimit: economyMode
      ? Math.min(hardChunkLimit ?? Infinity, ECONOMY_HARD_CHUNK_CAP)
      : hardChunkLimit,
  }
}
