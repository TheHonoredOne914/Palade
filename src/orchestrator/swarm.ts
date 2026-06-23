import crypto from 'node:crypto'
import chalk from 'chalk'
import type { AgentFinding, AgentContext, AgentName, IAgent } from '../agents/base.js'
import { getAgentsForMode } from '../agents/registry.js'
import { synthesize as analyzeSynthesis } from '../agents/synthesis.js'
import type { CodeChunk, FileManifest } from '../ingestion/types.js'
import type { SwarmResult, SwarmOptions, CrossAgentFinding } from './types.js'
import { triageFiles } from './triage.js'
import { AgentMemory } from './memory.js'
import { mergeFindings } from './merger.js'
import { scheduleBatches } from './scheduler.js'

export async function runSwarm(
  allChunks: CodeChunk[],
  context: AgentContext,
  options: SwarmOptions = {},
  manifests?: FileManifest[]
): Promise<SwarmResult> {
  const runId = crypto.randomUUID().slice(0, 8)
  const startTime = Date.now()

  // Pass 1: Triage — reduce 400+ chunks to ~45 high-value chunks
  const reviewChunks = manifests
    ? await triageFiles(manifests, allChunks, options.maxReviewTokens)
    : allChunks

  const agents: IAgent[] = getAgentsForMode(context.mode, context.modeConfig?.agentOverrides)
  const memory = new AgentMemory()

  const agentTimings: Partial<Record<AgentName, number>> = {}
  let completedCount = 0
  const totalAgents = agents.length

  // Run agents concurrently — rate-limit handling is done at the provider
  // layer (fetchWithRetry + FallbackProvider), not serialized here.
  const agentPromises = agents.map(async (agent) => {
    const agentStart = Date.now()
    options.onAgentStart?.(agent.name)

    let allFindings: AgentFinding[] = []
    try {
      const batches = scheduleBatches(reviewChunks)
      for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
        const batch = batches[batchIdx]
        const agentTimeoutMs = options.timeoutMs ?? 300_000
        let timeoutHandle: ReturnType<typeof setTimeout> | undefined
        const timeoutPromise = new Promise<AgentFinding[]>((_, reject) => {
          timeoutHandle = setTimeout(
            () => reject(new Error(`Agent ${agent.name} timed out`)),
            agentTimeoutMs
          )
          timeoutHandle.unref?.()
        })
        let batchFindings: AgentFinding[] = []
        try {
          batchFindings = await Promise.race([
            agent.analyze(batch, context),
            timeoutPromise,
          ])
          allFindings.push(...batchFindings)
        } finally {
          if (timeoutHandle) clearTimeout(timeoutHandle)
        }
        options.onAgentBatchComplete?.(agent.name, batchIdx + 1, batches.length, batchFindings.length)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(
        chalk.yellow(`⚠ ${agent.name}: ${msg} (keeping ${allFindings.length} partial findings)`)
      )
      // Keep partial findings from successful batches rather than discarding
      // everything when a later batch times out or fails.
    }

    memory.record(agent.name, allFindings)
    agentTimings[agent.name] = Date.now() - agentStart
    completedCount++
    options.onAgentComplete?.(agent.name, allFindings.length, agentTimings[agent.name]!)
  })

  await Promise.all(agentPromises)

  const crossAgentFindings: CrossAgentFinding[] = memory.crossReference()
  const mergedFindings: AgentFinding[] = mergeFindings(memory.getAll())

  options.onSynthesisStart?.()
  const synthStart = Date.now()
  const synthesis = await analyzeSynthesis(mergedFindings, crossAgentFindings, context)
  options.onSynthesisComplete?.(Date.now() - synthStart)

  return {
    runId,
    findings: mergedFindings,
    crossAgentFindings,
    synthesis,
    agentTimings: agentTimings as Record<AgentName, number>,
    totalChunks: reviewChunks.length,
    totalTokensEstimated: reviewChunks.reduce((sum, c) => sum + c.tokenCount, 0),
    durationMs: Date.now() - startTime,
  }
}
