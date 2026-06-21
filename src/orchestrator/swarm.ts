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

const INTER_AGENT_DELAY_MS = 3_000
const SEQUENTIAL_DELAY_MS = 15_000

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
    ? await triageFiles(manifests, allChunks)
    : allChunks

  const agents: IAgent[] = getAgentsForMode(context.mode, context.modeConfig?.agentOverrides)
  const memory = new AgentMemory()

  const agentTimings: Partial<Record<AgentName, number>> = {}
  let completedCount = 0
  const totalAgents = agents.length

  let consecutiveRateLimits = 0
  let sequentialMode = false

  // Run agents one at a time so rate-limit state (sequentialMode) set by an
  // earlier agent actually influences the delay of later ones. The previous
  // Promise.all version captured these flags by closure but computed each
  // agent's delay before its predecessor had finished, so the flag never had
  // any effect.
  for (let index = 0; index < agents.length; index++) {
    const agent = agents[index]

    if (index > 0) {
      const delay = sequentialMode ? SEQUENTIAL_DELAY_MS : INTER_AGENT_DELAY_MS
      await new Promise(r => setTimeout(r, delay))
    }

    const agentStart = Date.now()
    options.onAgentStart?.(agent.name)

    let allFindings: AgentFinding[] = []
    try {
      const agentTimeoutMs = options.timeoutMs ?? 300_000
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined
      const timeoutPromise = new Promise<AgentFinding[]>((_, reject) => {
        timeoutHandle = setTimeout(
          () => reject(new Error(`Agent ${agent.name} timed out`)),
          agentTimeoutMs
        )
        // Don't keep the event loop alive solely for this timeout.
        timeoutHandle.unref?.()
      })
      try {
        allFindings = await Promise.race([
          agent.analyze(reviewChunks, context),
          timeoutPromise,
        ])
      } finally {
        if (timeoutHandle) clearTimeout(timeoutHandle)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(chalk.yellow(`⚠ ${agent.name}: ${msg}`))

      if (msg.includes('429') || msg.includes('rate limit')) {
        consecutiveRateLimits++
        if (consecutiveRateLimits >= 3 && !sequentialMode) {
          console.warn(chalk.yellow('  Rate limits hit repeatedly — switching to sequential mode'))
          sequentialMode = true
        }
      }
      allFindings = []
    }

    memory.record(agent.name, allFindings)
    agentTimings[agent.name] = Date.now() - agentStart
    completedCount++
    options.onAgentComplete?.(agent.name, allFindings.length, agentTimings[agent.name]!)
  }

  const crossAgentFindings: CrossAgentFinding[] = memory.crossReference()
  const mergedFindings: AgentFinding[] = mergeFindings(memory.getAll())

  options.onSynthesisStart?.()
  const synthStart = Date.now()
  const synthesis = await analyzeSynthesis(mergedFindings, [], context)
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
