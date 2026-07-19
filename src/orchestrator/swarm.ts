import crypto from 'node:crypto'
import chalk from 'chalk'
import pLimit from 'p-limit'
import type { AgentFinding, AgentContext, AgentName, IAgent } from '../agents/base.js'
import { getAgentsForMode } from '../agents/registry.js'
import { synthesize as analyzeSynthesis, type SynthesisResult } from '../agents/synthesis.js'
import { CombinedAnalyzer, DEFAULT_DOMAINS } from '../agents/combined.js'
import { CustomAgent } from '../agents/custom/agent.js'
import type { CodeChunk, FileManifest } from '../ingestion/types.js'
import type { SwarmResult, SwarmOptions, CrossAgentFinding } from './types.js'
import { triageFiles } from './triage.js'
import { AgentMemory } from './memory.js'
import { mergeFindings } from './merger.js'
import {
  scheduleBatches,
  estimateTotalTokens,
  ECONOMY_SOFT_TOKEN_CAP,
  ECONOMY_HARD_CHUNK_CAP,
} from './scheduler.js'
import { getFallbackStats, updateAgentProviders } from '../providers/router.js'
import { expandProviderShares } from '../config/loader.js'
import { isFatalAuthError } from '../providers/errorClassification.js'
import { detectConflicts, arbitrateConflict, saveDecision } from './verdict.js'
import { applyLineIgnores } from '../ingestion/annotationParser.js'
import { ReviewCancelledError } from '../errors/types.js'

export async function runSwarm(
  allChunks: CodeChunk[],
  context: AgentContext,
  options: SwarmOptions = {},
  manifests?: FileManifest[]
): Promise<SwarmResult> {
  const runId = crypto.randomUUID().slice(0, 8)
  const startTime = Date.now()

  if (options.signal?.aborted) {
    throw new ReviewCancelledError()
  }

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
    options.customAgents,
    options.agentCount
  )

  // config-load time's expandProviderShares (config/loader.ts) assumes the
  // standard-mode agent roster (BUILTIN_NAMES prefix of agentCount) — modes
  // with agentOverrides (onboard, ghost) dispatch a different fixed agent
  // list that ignores agentCount entirely, so that expansion can silently not
  // match who actually runs. Re-expand here against the real resolved roster
  // now that getAgentsForMode() has run (providers-002).
  let expandedAgentProviders: Record<string, string> | undefined
  if (options.providerShares) {
    expandedAgentProviders = expandProviderShares(
      options.providerShares,
      modeAgents.length,
      modeAgents.map((a) => a.name)
    )
    updateAgentProviders(expandedAgentProviders)
  }

  let agents: IAgent[] = modeAgents
  if (options.economyMode) {
    const builtInAgents = modeAgents.filter((a) => !(a instanceof CustomAgent))
    const customAgents = modeAgents.filter((a) => a instanceof CustomAgent)

    // Ghost mode or heavily filtered modes might only have 1 built-in agent.
    // Combining 1 agent defeats the purpose of economy mode (which is to batch N domains)
    // and just degrades prompt quality. So if <= 1 built-in agent, just run standard mode.
    if (builtInAgents.length <= 1) {
      console.warn(
        chalk.yellow(
          '⚠ Economy mode requested but only 1 built-in agent active — falling back to standard mode.'
        )
      )
    }
    if (builtInAgents.length > 1) {
      const activeDomains = builtInAgents.map((a) => {
        const defaultSpec = DEFAULT_DOMAINS.find((d) => d.name === a.name)
        return (
          defaultSpec || { name: a.name as AgentName, label: a.name, focus: 'General code review' }
        )
      })
      agents = [new CombinedAnalyzer(activeDomains), ...customAgents]

      // The share expansion above was keyed by the pre-collapse specialist
      // names (security, architecture, ...) — CombinedAnalyzer replaces all
      // of them with a single agent named 'combined', so those entries are
      // now orphaned and getProvider('primary', 'combined') would never find
      // an override, silently falling back to swarm.primary regardless of
      // configured shares (providers-006). Re-map onto 'combined' directly:
      // pick the plurality provider (largest configured share; ties keep the
      // first configured key, since Array#sort is stable) so economy mode
      // still respects at least one meaningfully-chosen provider. Merge with
      // (rather than replace) the prior expansion so custom agents' own
      // entries — unaffected by the collapse — aren't lost.
      if (options.providerShares && Object.keys(options.providerShares).length > 0) {
        const [pluralityProvider] = Object.entries(options.providerShares).sort(
          (a, b) => b[1] - a[1]
        )[0]
        updateAgentProviders({
          ...(expandedAgentProviders ?? {}),
          combined: pluralityProvider,
        })
      }
    }
  }

  // Economy-mode batch-size narrowing used to be only a convention followed
  // by CLI command callers (review/diff/watch), not enforced here — a caller
  // that set economyMode: true without also narrowing softTokenLimit/
  // hardChunkLimit would send oversized batches to CombinedAnalyzer's
  // context window. Clamp here so it's a runSwarm-level guarantee; only
  // tightens the caller's values, never loosens ones already tighter than
  // the economy caps (orchestrator-002).
  //
  // Gated on whether a CombinedAnalyzer actually ended up in `agents` — not
  // on the raw options.economyMode flag — because economyMode with <= 1
  // built-in agent falls back to running agents individually (standard mode)
  // above, and that fallback path's chunks are never sent through
  // CombinedAnalyzer's larger multi-domain batches, so narrowing to the
  // tighter economy caps there would needlessly shrink batches with no
  // corresponding benefit (orchestrator-008).
  const usingCombined = agents.some((a) => a instanceof CombinedAnalyzer)
  const softTokenLimit = usingCombined
    ? Math.min(options.softTokenLimit ?? Infinity, ECONOMY_SOFT_TOKEN_CAP)
    : options.softTokenLimit
  const hardChunkLimit = usingCombined
    ? Math.min(options.hardChunkLimit ?? Infinity, ECONOMY_HARD_CHUNK_CAP)
    : options.hardChunkLimit

  const memory = new AgentMemory()

  const agentTimings: Partial<Record<AgentName, number>> = {}
  // Categories whose every batch errored out (agentError set, zero findings
  // recovered) — distinct from a category that genuinely ran clean. Threaded
  // through SwarmResult so calculateScore can exclude these instead of
  // scoring them a free 100 (scorer-001).
  const failedCategories = new Set<AgentName>()

  // Augment the caller-supplied context with data only runSwarm has: the
  // project-wide known file list (so verifyCriticalHighFindings can tell a
  // real-but-out-of-batch file reference from a hallucinated one) and the
  // configured batch concurrency (so per-batch verification concurrency
  // matches the same cap used for batch scheduling below) (agents-001,
  // agents-002).
  const agentContext: AgentContext = {
    ...context,
    knownFilePaths: manifests ? new Set(manifests.map((m) => m.path)) : context.knownFilePaths,
    maxConcurrentBatches: options.maxConcurrentBatches ?? context.maxConcurrentBatches,
  }

  // Aborted when any agent hits a fatal auth error, so the other agents'
  // in-flight provider calls are cancelled instead of running to completion
  // and burning quota on a review that is about to throw anyway.
  const runAbort = new AbortController()

  // Run agents concurrently — rate-limit handling is done at the provider
  // layer (fetchWithRetry + FallbackProvider), not serialized here. Batch
  // scheduling happens per-agent below, using options.softTokenLimit /
  // options.hardChunkLimit (the actual formal SwarmOptions fields).
  const agentPromises = agents.map(async (agent) => {
    const agentStart = Date.now()
    try {
      options.onAgentStart?.(agent.name)
    } catch (err) {
      console.warn(
        chalk.yellow(
          `⚠ Error in agent start callback for ${agent.name}: ${err instanceof Error ? err.message : String(err)}`
        )
      )
    }

    const allFindings: AgentFinding[] = []
    let agentError: Error | undefined = undefined
    try {
      // Economy mode's tightened caps exist for CombinedAnalyzer's larger
      // multi-domain output — a CustomAgent instance runs as a single-domain
      // call just like standard mode, so it doesn't need (and shouldn't be
      // squeezed by) the smaller economy budget. Use the caller's original,
      // non-narrowed limits for it instead (orchestrator-005).
      const agentSoftTokenLimit =
        agent instanceof CustomAgent ? options.softTokenLimit : softTokenLimit
      const agentHardChunkLimit =
        agent instanceof CustomAgent ? options.hardChunkLimit : hardChunkLimit
      const batches = scheduleBatches(reviewChunks, agentSoftTokenLimit, agentHardChunkLimit)
      const limit = pLimit(options.maxConcurrentBatches ?? 5) // Max concurrent batches per agent

      const batchPromises = batches.map((batch, batchIdx) =>
        limit(async () => {
          const agentTimeoutMs = options.timeoutMs ?? 600_000
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
            const analyzePromise = agent.analyze(batch, agentContext, controller.signal)
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

          if (isFatalAuthError(agentError)) {
            fatalError = agentError
          }
        }
      }

      // A user-initiated cancellation (Ctrl+C) must stop the whole run, not
      // just get logged as a recoverable per-batch error — otherwise the
      // swarm finishes "successfully" with whatever partial findings existed
      // at the moment of cancellation, and the caller has no way to tell a
      // cancelled run from a clean one.
      if (options.signal?.aborted) {
        runAbort.abort()
        throw new ReviewCancelledError()
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

      if (options.signal?.aborted) {
        runAbort.abort()
        throw new ReviewCancelledError()
      }

      if (isFatalAuthError(agentError)) {
        runAbort.abort()
        // Record whatever batches already succeeded before this fatal error
        // was raised — otherwise the rethrow below skips the memory.record()
        // call further down in this same agent promise, silently losing
        // partial findings from batches that completed fine.
        memory.record(agent.name, applyLineIgnores(allFindings, options.ignoredLines ?? []))
        // Attach the partial findings collected so far to the thrown error so
        // a caller that catches it (review.ts, diff.ts currently just log the
        // message) COULD recover them instead of the generic re-throw making
        // this "preserve partial findings" step unreachable in practice.
        Object.assign(agentError, { partialFindings: memory.getAll() })
        throw agentError
      }

      console.warn(
        chalk.yellow(
          `\n⚠ ${agent.name}: ${agentError.message} (keeping ${allFindings.length} partial findings)`
        )
      )
    }

    // This agent's batches all errored out and none produced a finding —
    // mark it (and, for the economy-mode combined agent, every domain it
    // covers) as failed so calculateScore doesn't average in a free 100 for
    // a category that never actually got reviewed (scorer-001).
    if (agentError && allFindings.length === 0) {
      if (agent instanceof CombinedAnalyzer) {
        for (const d of agent.domains) failedCategories.add(d.name)
      } else {
        failedCategories.add(agent.name)
      }
    }

    // Drop @palade-ignored findings here, before they ever reach memory —
    // crossReference() and mergeFindings() read straight from memory, and
    // synthesis runs on their output, so filtering only the final result
    // (as callers used to) let ignored findings leak into the executive
    // summary and cross-agent penalties, which carry no per-line info and
    // can't be filtered after the fact. Left outside the try/catch below —
    // that catch exists only to guard the user-supplied onAgentComplete
    // callback, not this bookkeeping; a throw here must propagate instead of
    // being silently swallowed with a misleading "callback error" warning.
    memory.record(agent.name, applyLineIgnores(allFindings, options.ignoredLines ?? []))
    agentTimings[agent.name] = Date.now() - agentStart
    try {
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

  // Use allSettled instead of all: if one agent hits a fatal auth error and
  // re-throws, Promise.all would reject immediately, discarding the findings
  // from agents that were still in-flight or already succeeded. allSettled
  // waits for every agent to finish, then we collect results below.
  const agentResults = await Promise.allSettled(agentPromises)
  for (const result of agentResults) {
    // Agent-level rejections (fatal auth / cancelled) are already handled
    // inside each agent promise — they record partial findings before throwing.
    // A rejection here means the agent's own catch couldn't recover.
    if (result.status === 'rejected') {
      const err = result.reason instanceof Error ? result.reason : new Error(String(result.reason))
      if (err instanceof ReviewCancelledError) throw err
      // A fatal auth error must abort the whole run rather than resolve
      // "successfully" with whatever partial findings existed — otherwise a
      // dead API key silently produces a clean-looking report.
      if (isFatalAuthError(err)) throw err
      console.warn(chalk.yellow(`⚠ Agent failed: ${err.message}`))
    }
  }

  const crossAgentFindings: CrossAgentFinding[] = memory.crossReference()
  const mergedFindings: AgentFinding[] = mergeFindings(memory.getAll(), {
    windowLines: options.nearMatchWindowLines,
    sameAgentThreshold: options.nearMatchSameAgentThreshold,
    crossAgentThreshold: options.nearMatchCrossAgentThreshold,
  })

  let synthesis: SynthesisResult = {
    executiveSummary: 'Synthesis failed or was skipped.',
    priorityFixes: [],
    crossCuttingObservations: [],
    debtEstimate: { critical: 0, high: 0, medium: 0, low: 0, total: 0, highestROIFix: '' },
  }

  // Phase: Verdict Mode (Conflict Arbitration)
  const projectRoot = options.projectRoot ?? process.cwd()
  // Copy mergedFindings so verdict injection doesn't mutate the original
  const finalFindings = [...mergedFindings]

  if (!options.noVerdict) {
    const conflicts = detectConflicts(mergedFindings)
    // Conflicts used to be arbitrated one at a time (await inside a for-of
    // loop), so N conflicts meant N sequential LLM round-trips stacking up
    // pure latency at the end of the run. Arbitration calls are independent
    // of each other, so run them concurrently under the same per-agent batch
    // concurrency cap used elsewhere in the swarm.
    const limit = pLimit(options.maxConcurrentBatches ?? 5)
    await Promise.allSettled(
      conflicts.map((conflict) =>
        limit(async () => {
          // detectConflicts does NOT pre-filter by keyword agreement — every
          // overlapping cross-agent finding pair it returns is queued for
          // arbitration unconditionally, regardless of confidence. The
          // opposite/nearTie keyword tally only sets the informational
          // `confidence` field on the Conflict; it never gates whether
          // arbitration happens. Let the LLM's own `is_conflict` field below
          // make the final call instead of gating on the tally here.
          options.onVerdictDetected?.(
            conflict.filePath,
            conflict.sideA.agentName,
            conflict.sideB.agentName
          )

          const verdict = await arbitrateConflict(conflict, context, options.signal)
          if (verdict && verdict.is_conflict) {
            options.onVerdictDecided?.(verdict.decision, verdict.confidence)

            // Save to ADR — a failed disk write must not abort the review
            let savedNote = ''
            try {
              const slug = await saveDecision(
                projectRoot,
                conflict,
                verdict,
                options.decisionsRetentionLimit
              )
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
              tags: ['architectural-decision', 'arbitration-verdict'],
              scorePenalty: 0,
            })
          }
        })
      )
    )
  }

  if (!options.noSynthesis) {
    try {
      options.onSynthesisStart?.()
      const synthStart = Date.now()
      synthesis = await analyzeSynthesis(finalFindings, crossAgentFindings, context, {
        signal: options.signal,
        maxSynthesisFindings: options.maxSynthesisFindings,
        synthesisTimeoutMs: options.synthesisTimeoutMs,
        severityWeights: options.severityWeights,
      })
      options.onSynthesisComplete?.(Date.now() - synthStart)
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      if (isFatalAuthError(error)) {
        throw error
      }

      console.warn(chalk.red(`⚠ Synthesis failed: ${error.message}`))
    }
  }

  return {
    runId,
    findings: finalFindings,
    crossAgentFindings,
    synthesis,
    agentTimings,
    agentsRun: modeAgents.map((a) => a.name),
    failedCategories: Array.from(failedCategories),
    totalChunks: reviewChunks.length,
    totalTokensEstimated: estimateTotalTokens(reviewChunks),
    durationMs: Date.now() - startTime,
    fallbackStats: getFallbackStats() ?? undefined,
  }
}
