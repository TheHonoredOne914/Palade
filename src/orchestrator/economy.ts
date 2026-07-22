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

// Takes usingCombinedAnalyzer — whether applyEconomyRouting() actually swapped
// in a CombinedAnalyzer — rather than the raw economyMode flag. economyMode
// alone doesn't guarantee CombinedAnalyzer is in play (applyEconomyRouting
// falls back to standard per-agent dispatch when <= 1 built-in agent is
// active), so clamping on the raw flag would tighten softTokenLimit/
// hardChunkLimit for agents that aren't CombinedAnalyzer and were never
// meant to receive economy-sized batches (orchestrator-101). Callers should
// derive usingCombinedAnalyzer from applyEconomyRouting's actual output,
// e.g. `agents.some((a) => a instanceof CombinedAnalyzer)`.
export function applyEconomyLimits(
  usingCombinedAnalyzer: boolean,
  softTokenLimit?: number,
  hardChunkLimit?: number
): { softTokenLimit?: number; hardChunkLimit?: number } {
  return {
    softTokenLimit: usingCombinedAnalyzer
      ? Math.min(softTokenLimit ?? Infinity, ECONOMY_SOFT_TOKEN_CAP)
      : softTokenLimit,
    hardChunkLimit: usingCombinedAnalyzer
      ? Math.min(hardChunkLimit ?? Infinity, ECONOMY_HARD_CHUNK_CAP)
      : hardChunkLimit,
  }
}
