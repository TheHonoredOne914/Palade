import chalk from 'chalk'
import type { IAgent, AgentName } from '../agents/base.js'
import { CustomAgent } from '../agents/custom/agent.js'
import { CombinedAnalyzer, DEFAULT_DOMAINS } from '../agents/combined.js'
import { ECONOMY_SOFT_TOKEN_CAP, ECONOMY_HARD_CHUNK_CAP } from './scheduler.js'
import { expandProviderShares } from '../config/loader.js'
import { updateAgentProviders } from '../providers/router.js'

/**
 * Applies economy-mode agent collapsing AND (when providerShares is given)
 * the declarative provider-share remap, in one shared place — swarm.ts used
 * to duplicate this exact remap logic inline (expand shares against the
 * pre-collapse roster, call updateAgentProviders, then re-map onto
 * 'combined' after collapsing) with its own copy that watch.ts's call site
 * never got, so economy mode silently ignored config.swarm.providerShares
 * whenever this function (not swarm.ts's inline copy) was the one routing
 * (orchestrator-001).
 */
export function applyEconomyRouting(
  agents: IAgent[],
  economyMode: boolean,
  providerShares?: Record<string, number>
): IAgent[] {
  // Expand + apply provider shares against the pre-collapse roster BEFORE any
  // economy-mode collapsing below — economy mode's own CombinedAnalyzer name
  // ('combined') doesn't exist yet at this point, so this always targets the
  // real per-domain agent names.
  let expandedAgentProviders: Record<string, string> | undefined
  if (providerShares && Object.keys(providerShares).length > 0) {
    expandedAgentProviders = expandProviderShares(
      providerShares,
      agents.length,
      agents.map((a) => a.name)
    )
    updateAgentProviders(expandedAgentProviders)
  }

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

  // The share expansion above was keyed by the pre-collapse specialist names
  // (security, architecture, ...) — CombinedAnalyzer replaces all of them
  // with a single agent named 'combined', so those entries are now orphaned
  // and getProvider('primary', 'combined') would never find an override,
  // silently falling back to swarm.primary regardless of configured shares.
  // Re-map onto 'combined' directly: pick the plurality provider (largest
  // configured share; ties keep the first configured key, since Array#sort
  // is stable) so economy mode still respects at least one meaningfully-
  // chosen provider. Merge with (rather than replace) the prior expansion so
  // custom agents' own entries — unaffected by the collapse — aren't lost.
  if (providerShares && Object.keys(providerShares).length > 0) {
    const [pluralityProvider] = Object.entries(providerShares).sort((a, b) => b[1] - a[1])[0]
    updateAgentProviders({
      ...(expandedAgentProviders ?? {}),
      combined: pluralityProvider,
    })
  }

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
