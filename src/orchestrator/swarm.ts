import crypto from 'node:crypto'
import chalk from 'chalk'
import pLimit from 'p-limit'
import type { AgentFinding, AgentContext, AgentName, IAgent } from '../agents/base.js'
import { getAgentsForMode } from '../agents/registry.js'
import { synthesize as analyzeSynthesis } from '../agents/synthesis.js'
import { CombinedAnalyzer } from '../agents/combined.js'
import type { CodeChunk, FileManifest } from '../ingestion/types.js'
import type { SwarmResult, SwarmOptions, CrossAgentFinding } from './types.js'
import { triageFiles } from './triage.js'
import { AgentMemory } from './memory.js'
import { mergeFindings } from './merger.js'
import { scheduleBatches } from './scheduler.js'
import { getFallbackStats } from '../providers/router.js'

export async function runSwarm(
  allChunks: CodeChunk[],
  context: AgentContext,
  options: SwarmOptions = {},
  manifests?: FileManifest[]
): Promise<SwarmResult> {
  const runId = crypto.randomUUID().slice(0, 8)
  const startTime = Date.now()

  // Pass 1: Triage — reduce 400+ chunks to ~45 high-value chunks (unless exhaustive)
  const reviewChunks =
    manifests && !options.exhaustive
      ? await triageFiles(manifests, allChunks, options.maxReviewTokens)
      : allChunks

  // Economy mode replaces the N parallel per-domain agents with a single
  // combined multi-domain analyzer that reviews all lenses in one provider
  // call per batch. This cuts the ~6x resend of the same chunk content.
  // Tradeoff: latency up, per-domain prompt richness down — see combined.ts.
  // Custom agents always run as separate per-domain calls even in economy
  // mode, since they can't be merged into the combined prompt reliably.
  const agents: IAgent[] = options.economyMode
    ? [new CombinedAnalyzer()]
    : getAgentsForMode(context.mode, context.modeConfig?.agentOverrides, options.customAgents)
  const memory = new AgentMemory()

  const agentTimings: Partial<Record<AgentName, number>> = {}

  // Run agents concurrently — rate-limit handling is done at the provider
  // layer (fetchWithRetry + FallbackProvider), not serialized here.
  const agentPromises = agents.map(async (agent) => {
    const agentStart = Date.now()
    options.onAgentStart?.(agent.name)

    let allFindings: AgentFinding[] = []
    let agentError: Error | undefined = undefined
    try {
      const batches = scheduleBatches(reviewChunks)
      const limit = pLimit(5) // Max 5 concurrent batches per agent

      const batchPromises = batches.map((batch, batchIdx) =>
        limit(async () => {
          const agentTimeoutMs = options.timeoutMs ?? 300_000
          // One AbortController per batch. On timeout we abort it so the in-flight
          // provider fetch is cancelled (the underlying signal flows through
          // IAgent.analyze → provider.complete → fetchWithRetry) instead of
          // running to completion and burning provider quota after we've given up.
          const controller = new AbortController()
          if (options.signal) {
            options.signal.addEventListener('abort', () => controller.abort())
            if (options.signal.aborted) controller.abort()
          }

          let timeoutHandle: ReturnType<typeof setTimeout> | undefined
          const timeoutPromise = new Promise<AgentFinding[]>((_, reject) => {
            timeoutHandle = setTimeout(() => {
              controller.abort()
              reject(new Error(`Agent ${agent.name} timed out`))
            }, agentTimeoutMs)
            timeoutHandle.unref?.()
          })
          let batchFindings: AgentFinding[] = []
          try {
            const analyzePromise = agent.analyze(batch, context, controller.signal)
            batchFindings = await Promise.race([analyzePromise, timeoutPromise])
            analyzePromise.catch(() => {})
            return batchFindings
          } finally {
            if (timeoutHandle) clearTimeout(timeoutHandle)
            options.onAgentBatchComplete?.(
              agent.name,
              batchIdx + 1,
              batches.length,
              batchFindings.length
            )
          }
        })
      )

      const results = await Promise.all(batchPromises)
      allFindings = results.flat()
    } catch (err: unknown) {
      agentError = err instanceof Error ? err : new Error(String(err))

      const msg = agentError.message.toLowerCase()
      const isFatalAuth =
        msg.includes('401') ||
        msg.includes('403') ||
        msg.includes('unauthorized') ||
        msg.includes('invalid api key') ||
        msg.includes('authentication')
      if (isFatalAuth) {
        throw agentError
      }

      console.warn(
        chalk.yellow(
          `\n⚠ ${agent.name}: ${agentError.message} (keeping ${allFindings.length} partial findings)`
        )
      )
    }

    try {
      memory.record(agent.name, allFindings)
      agentTimings[agent.name] = Date.now() - agentStart
      options.onAgentComplete?.(
        agent.name,
        allFindings.length,
        agentTimings[agent.name]!,
        agentError
      )
    } catch (err) {
      console.warn(
        chalk.yellow(
          `⚠ Error in agent completion callback for ${agent.name}: ${err instanceof Error ? err.message : String(err)}`
        )
      )
    }
  })

  await Promise.all(agentPromises)

  const crossAgentFindings: CrossAgentFinding[] = memory.crossReference()
  const mergedFindings: AgentFinding[] = mergeFindings(memory.getAll())

  let synthesis: any = {
    executiveSummary: 'Synthesis failed or was skipped.',
    priorityFixes: [],
    crossCuttingObservations: [],
    debtEstimate: { critical: 0, high: 0, medium: 0, low: 0, total: 0, highestROIFix: '' },
  }

  try {
    options.onSynthesisStart?.()
    const synthStart = Date.now()
    synthesis = await analyzeSynthesis(mergedFindings, crossAgentFindings, context)
    options.onSynthesisComplete?.(Date.now() - synthStart)
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    const msgLower = errorMsg.toLowerCase()
    const isFatalAuth =
      msgLower.includes('401') ||
      msgLower.includes('403') ||
      msgLower.includes('unauthorized') ||
      msgLower.includes('invalid api key') ||
      msgLower.includes('authentication')
    if (isFatalAuth) {
      throw err instanceof Error ? err : new Error(errorMsg)
    }

    console.warn(chalk.red(`⚠ Synthesis failed: ${errorMsg}`))
  }

  return {
    runId,
    findings: mergedFindings,
    crossAgentFindings,
    synthesis,
    agentTimings: agentTimings as Record<AgentName, number>,
    totalChunks: reviewChunks.length,
    totalTokensEstimated: reviewChunks.reduce((sum, c) => sum + c.tokenCount, 0),
    durationMs: Date.now() - startTime,
    fallbackStats: getFallbackStats() ?? undefined,
  }
}
