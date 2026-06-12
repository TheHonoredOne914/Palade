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

const MAX_CONCURRENT_AGENTS = 4
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

  const agents: IAgent[] = getAgentsForMode(context.mode)
  const memory = new AgentMemory()

  const agentTimings: Record<string, number> = {}
  let completedCount = 0
  const totalAgents = agents.length

  let consecutiveRateLimits = 0
  let sequentialMode = false

  // Execute agents sequentially with delays to respect rate limits
  const agentResults = await Promise.all(
    agents.map((agent, index) =>
      (async (): Promise<void> => {
        // Wait before starting this agent
        if (index > 0) {
          const delay = sequentialMode ? SEQUENTIAL_DELAY_MS : INTER_AGENT_DELAY_MS
          await new Promise(r => setTimeout(r, delay))
        }

        const agentStart = Date.now()
        options.onAgentStart?.(agent.name)

        // Create one batch from all review chunks
        const allFindings = await Promise.race([
          agent.analyze(reviewChunks, context).catch((err: Error) => {
            console.warn(`[swarm] ${agent.name} failed: ${err.message?.slice(0, 200)}`)
            return [] as AgentFinding[]
          }),
          new Promise<AgentFinding[]>((_, reject) =>
            setTimeout(
              () => reject(new Error(`Agent ${agent.name} timed out`)),
              300_000
            )
          )
        ]).catch((err: Error) => {
          console.warn(chalk.yellow(`⚠ ${agent.name}: ${err.message}`))

          if (err.message.includes('429') || err.message.includes('rate limit')) {
            consecutiveRateLimits++
            if (consecutiveRateLimits >= 3 && !sequentialMode) {
              console.warn(chalk.yellow('  Rate limits hit repeatedly — switching to sequential mode'))
              sequentialMode = true
            }
          }

          return [] as AgentFinding[]
        })

        memory.record(agent.name, allFindings)
        agentTimings[agent.name] = Date.now() - agentStart
        completedCount++
        options.onAgentComplete?.(agent.name, allFindings.length, agentTimings[agent.name])
      })()
    )
  )

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
