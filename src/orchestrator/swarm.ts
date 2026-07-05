import crypto from 'node:crypto'
import chalk from 'chalk'
import pLimit from 'p-limit'
import type { AgentFinding, AgentContext, AgentName, IAgent } from '../agents/base.js'
import { getAgentsForMode } from '../agents/registry.js'
import { synthesize as analyzeSynthesis } from '../agents/synthesis.js'
import { CombinedAnalyzer } from '../agents/combined.js'
import { CustomAgent } from '../agents/custom/agent.js'
import type { CodeChunk, FileManifest } from '../ingestion/types.js'
import type { SwarmResult, SwarmOptions, CrossAgentFinding } from './types.js'
import { triageFiles } from './triage.js'
import { AgentMemory } from './memory.js'
import { mergeFindings } from './merger.js'
import { scheduleBatches } from './scheduler.js'
import { getFallbackStats } from '../providers/router.js'
import { detectConflicts, arbitrateConflict, saveDecision } from './verdict.js'

// Providers don't expose a structured status/code field on thrown errors —
// they're plain Errors with the status baked into the message string (see
// src/providers/*.ts, e.g. `Cerebras error 401: ...`) — so we're stuck
// pattern-matching on the message. Word-boundary regexes avoid false
// positives on unrelated text that merely contains these digits.
function isFatalAuthError(message: string): boolean {
  const msg = message.toLowerCase()
  return (
    /\b401\b/.test(msg) ||
    /\b403\b/.test(msg) ||
    msg.includes('unauthorized') ||
    msg.includes('invalid api key') ||
    msg.includes('authentication')
  )
}

export async function runSwarm(
  allChunks: CodeChunk[],
  context: AgentContext,
  options: SwarmOptions = {},
  manifests?: FileManifest[]
): Promise<SwarmResult> {
  const runId = crypto.randomUUID().slice(0, 8)
  const startTime = Date.now()

  // Pass 1: Triage — reduce 400+ chunks to ~45 high-value chunks (unless exhaustive)
  if (!manifests && !options.exhaustive) {
    console.warn(
      chalk.yellow(
        '\n⚠ No file manifests provided — skipping triage and token-budget enforcement. ' +
          'All chunks will be reviewed regardless of maxReviewTokens.'
      )
    )
  }
  const reviewChunks =
    manifests && !options.exhaustive
      ? await triageFiles(manifests, allChunks, {
          maxReviewTokens: options.maxReviewTokens,
          strictTriage: options.strictTriage,
        })
      : allChunks

  // Economy mode replaces the N parallel per-domain BUILT-IN agents with a
  // single combined multi-domain analyzer that reviews all lenses in one
  // provider call per batch. This cuts the ~6x resend of the same chunk
  // content. Tradeoff: latency up, per-domain prompt richness down — see
  // combined.ts. Custom agents still run as separate per-domain calls even in
  // economy mode (alongside the combined analyzer), since they can't be
  // merged into the combined prompt reliably.
  const modeAgents = getAgentsForMode(
    context.mode,
    context.modeConfig?.agentOverrides,
    options.customAgents
  )
  const agents: IAgent[] = options.economyMode
    ? [new CombinedAnalyzer(), ...modeAgents.filter((a) => a instanceof CustomAgent)]
    : modeAgents
  const memory = new AgentMemory()

  const agentTimings: Partial<Record<AgentName, number>> = {}

  // Aborted when any agent hits a fatal auth error, so the other agents'
  // in-flight provider calls are cancelled instead of running to completion
  // and burning quota on a review that is about to throw anyway.
  const runAbort = new AbortController()

  // Run agents concurrently — rate-limit handling is done at the provider
  // layer (fetchWithRetry + FallbackProvider), not serialized here.
  const agentPromises = agents.map(async (agent) => {
    const agentStart = Date.now()
    options.onAgentStart?.(agent.name)

    let allFindings: AgentFinding[] = []
    let agentError: Error | undefined = undefined
    try {
      // batchTokenLimit isn't (yet) a formal field on SwarmOptions — read it
      // defensively so callers can override the scheduler's default soft
      // token limit without requiring a type change here.
      const batchTokenLimit = (options as SwarmOptions & { batchTokenLimit?: number })
        .batchTokenLimit
      const batches = scheduleBatches(reviewChunks, batchTokenLimit)
      const limit = pLimit(options.maxConcurrentBatches ?? 5) // Max concurrent batches per agent

      const batchPromises = batches.map((batch, batchIdx) =>
        limit(async () => {
          const agentTimeoutMs = options.timeoutMs ?? 300_000
          // One AbortController per batch. On timeout we abort it so the in-flight
          // provider fetch is cancelled (the underlying signal flows through
          // IAgent.analyze → provider.complete → fetchWithRetry) instead of
          // running to completion and burning provider quota after we've given up.
          const controller = new AbortController()
          const onAbort = () => controller.abort()
          options.signal?.addEventListener('abort', onAbort)
          runAbort.signal.addEventListener('abort', onAbort)
          if (options.signal?.aborted || runAbort.signal.aborted) controller.abort()

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
            // Attach the rejection guard BEFORE racing: if the timeout wins the
            // race, the await throws and a later .catch() would never run,
            // leaving the aborted analyze promise unhandled.
            analyzePromise.catch(() => {})
            batchFindings = await Promise.race([analyzePromise, timeoutPromise])
            return batchFindings
          } finally {
            if (timeoutHandle) clearTimeout(timeoutHandle)
            // Remove per-batch listeners — leaving them accumulates one closure
            // per batch on the shared signals (MaxListenersExceededWarning).
            options.signal?.removeEventListener('abort', onAbort)
            runAbort.signal.removeEventListener('abort', onAbort)
            options.onAgentBatchComplete?.(
              agent.name,
              batchIdx + 1,
              batches.length,
              batchFindings.length
            )
          }
        })
      )

      // allSettled, not all: one failed/timed-out batch must not throw away
      // the findings from batches that already succeeded.
      const results = await Promise.allSettled(batchPromises)
      // Collect every fulfilled batch's findings first, then decide whether to
      // throw. Throwing as soon as a fatal-auth rejection is spotted mid-loop
      // would skip any still-unvisited fulfilled results in this same
      // Promise.allSettled batch, silently discarding work that already
      // succeeded.
      let fatalError: Error | undefined
      for (const result of results) {
        if (result.status === 'fulfilled') {
          allFindings.push(...result.value)
        } else {
          const err = result.reason
          agentError = err instanceof Error ? err : new Error(String(err))

          if (isFatalAuthError(agentError.message)) {
            fatalError = agentError
          }
        }
      }

      if (fatalError) {
        runAbort.abort()
        throw fatalError
      }

      if (agentError) {
        console.warn(
          chalk.yellow(
            `\n⚠ ${agent.name}: ${agentError.message} (keeping ${allFindings.length} partial findings)`
          )
        )
      }
    } catch (err: unknown) {
      agentError = err instanceof Error ? err : new Error(String(err))

      if (isFatalAuthError(agentError.message)) {
        runAbort.abort()
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

  // Phase: Verdict Mode (Conflict Arbitration)
  const projectRoot = options.projectRoot ?? process.cwd()
  const finalFindings = mergedFindings

  if (!options.noVerdict) {
    const conflicts = detectConflicts(memory.getAll())
    for (const conflict of conflicts) {
      // Low-confidence conflicts come from a near-tie in the harden/relax
      // keyword tally (see verdict.ts's NEAR_TIE_MARGIN) — the "conflict" may
      // not be real, so don't spend an arbitration call or persist an ADR for it.
      if (conflict.confidence === 'low') continue

      options.onVerdictDetected?.(
        conflict.filePath,
        conflict.sideA.agentName,
        conflict.sideB.agentName
      )

      const verdict = await arbitrateConflict(conflict, context, options.signal)
      if (verdict) {
        options.onVerdictDecided?.(verdict.decision, verdict.confidence)

        // Save to ADR — a failed disk write must not abort the review
        let savedNote = ''
        try {
          const slug = await saveDecision(projectRoot, conflict, verdict)
          savedNote = `\nSaved as: ${slug}.md`
        } catch (err) {
          console.warn(
            chalk.yellow(
              `⚠ Failed to save ADR decision: ${err instanceof Error ? err.message : String(err)}`
            )
          )
        }

        // Inject into findings for synthesis
        finalFindings.push({
          id: crypto.randomUUID(),
          agentName: 'architecture',
          title: `[VERDICT] ${conflict.filePath}:${conflict.lineStart}-${conflict.lineEnd}`,
          description: `Decision: ${verdict.decision}\nTradeoff: ${verdict.tradeoff_accepted}${savedNote}`,
          filePath: conflict.filePath,
          lineStart: conflict.lineStart,
          lineEnd: conflict.lineEnd,
          severity: 'info',
          tags: ['architectural-decision'],
          scorePenalty: 0,
        })
      }
    }
  }

  // Handle Economy Mode internal verdicts. Respect --no-verdict: it must
  // suppress ADR persistence and description mutation here just as it gates the
  // arbitration block above.
  for (const finding of options.noVerdict ? [] : finalFindings) {
    if (finding.agentName === 'architecture' && finding.title.startsWith('[VERDICT]')) {
      // Parse tradeoff out of description. Models sometimes emit a literal
      // backslash-n instead of a real newline inside the JSON string, so
      // split on both.
      const lines = finding.description.split(/\r?\n|\\n/)
      const decisionStr =
        lines
          .find((l) => l.startsWith('Decision:'))
          ?.replace('Decision:', '')
          .trim() || ''
      const tradeoffStr =
        lines
          .find((l) => l.startsWith('Tradeoff:'))
          ?.replace('Tradeoff:', '')
          .trim() || ''
      const confidenceStr =
        lines
          .find((l) => l.startsWith('Confidence:'))
          ?.replace('Confidence:', '')
          .replace('%', '')
          .trim() || '50'
      const losingStr =
        lines
          .find((l) => l.startsWith('Losing side:'))
          ?.replace('Losing side:', '')
          .trim() || 'Unknown'

      // Save to disk if not already saved (hasn't been run through the arbitrateConflict loop above)
      if (!lines.some((l) => l.includes('Saved as:'))) {
        const fakeConflict = {
          filePath: finding.filePath || 'unknown',
          lineStart: finding.lineStart || 0,
          lineEnd: finding.lineEnd || 0,
          sideA: {
            agentName: 'CombinedAgent(Lens A)',
            title: '',
            description: '',
            severity: 'info',
            tags: [],
          } as any,
          sideB: {
            agentName: 'CombinedAgent(Lens B)',
            title: '',
            description: '',
            severity: 'info',
            tags: [],
          } as any,
        }
        const verdict = {
          decision: decisionStr,
          tradeoff_accepted: tradeoffStr,
          confidence: parseInt(confidenceStr, 10),
          losing_side: losingStr,
        }
        // A reworded/relabeled combined-mode output can fail the "Decision:"/
        // "Tradeoff:" line matching above, leaving both fields blank — don't
        // persist an empty ADR to disk in that case.
        if (!decisionStr && !tradeoffStr) {
          console.warn(
            chalk.yellow(
              `⚠ Could not parse economy-mode verdict for ${finding.filePath ?? 'unknown'} (empty decision/tradeoff) — skipping ADR save`
            )
          )
        } else {
          try {
            const slug = await saveDecision(projectRoot, fakeConflict as any, verdict)
            finding.description += `\nSaved as: ${slug}.md`
          } catch (err) {
            console.warn(
              chalk.yellow(
                `⚠ Failed to save ADR decision: ${err instanceof Error ? err.message : String(err)}`
              )
            )
          }
        }
      }
    }
  }

  try {
    options.onSynthesisStart?.()
    const synthStart = Date.now()
    synthesis = await analyzeSynthesis(finalFindings, crossAgentFindings, context)
    options.onSynthesisComplete?.(Date.now() - synthStart)
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    if (isFatalAuthError(errorMsg)) {
      throw err instanceof Error ? err : new Error(errorMsg)
    }

    console.warn(chalk.red(`⚠ Synthesis failed: ${errorMsg}`))
  }

  return {
    runId,
    findings: finalFindings,
    crossAgentFindings,
    synthesis,
    agentTimings: agentTimings as Record<AgentName, number>,
    totalChunks: reviewChunks.length,
    totalTokensEstimated: reviewChunks.reduce((sum, c) => sum + c.tokenCount, 0),
    durationMs: Date.now() - startTime,
    fallbackStats: getFallbackStats() ?? undefined,
  }
}
