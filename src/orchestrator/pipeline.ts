import crypto from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import chalk from 'chalk'
import type { AgentContext } from '../agents/base.js'
import type { ScopeOptions, CodeChunk } from '../ingestion/types.js'
import { walkProject } from '../ingestion/walker.js'
import { chunkFiles, estimateTokens } from '../ingestion/chunker.js'
import { buildKeywordIndex, getKeywordContext } from '../ingestion/keywordIndex.js'
import { buildAnnotationSummary } from '../ingestion/annotationParser.js'
import type { SwarmResult, SwarmOptions, ResolvedTarget } from './types.js'
import { estimateTotalTokens } from './scheduler.js'
import { runSwarm } from './swarm.js'
import { triageFiles } from './triage.js'
import { estimateRunCost } from '../ingestion/estimator.js'
import { CliExitError } from '../errors/types.js'
import { kvTable } from '../ui/layout.js'
import type { PaladeConfig } from '../config/schema.js'

export interface PipelineOptions {
  projectRoot: string
  scope: ScopeOptions
  context: AgentContext
  swarmOptions?: SwarmOptions
  target?: ResolvedTarget
  allTargets?: ResolvedTarget[]
  dryRunConfig?: PaladeConfig
}

export async function runPipeline(opts: PipelineOptions): Promise<SwarmResult> {
  const scope = { ...opts.scope }
  if (opts.target) {
    scope.targetPaths = opts.target.resolvedPaths
  }

  // If symbol chunks are provided (from :: syntax), skip walking and use them directly
  let manifests = await walkProject(opts.projectRoot, scope)
  let chunks: CodeChunk[]

  if (scope.symbolChunks && scope.symbolChunks.length > 0) {
    chunks = scope.symbolChunks
    console.log(
      `[pipeline] Symbol-scoped: 1 symbol → 1 chunk (~${estimateTotalTokens(chunks).toLocaleString()} tokens)`
    )
  } else {
    if (manifests.length === 0) {
      console.log(chalk.yellow('\n  No files found to review.'))
      console.log(chalk.dim('  Check your scope flags or .paladeignore rules.'))
      return {
        runId: crypto.randomUUID().slice(0, 8),
        findings: [],
        crossAgentFindings: [],
        synthesis: {
          executiveSummary: 'No files found to review.',
          priorityFixes: [],
          crossCuttingObservations: [],
          debtEstimate: { critical: 0, high: 0, medium: 0, low: 0, total: 0, highestROIFix: '' },
        },
        agentTimings: {} as Record<string, number>,
        totalChunks: 0,
        totalTokensEstimated: 0,
        durationMs: 0,
      }
    }

    chunks = await chunkFiles(manifests)

    console.log(
      `[pipeline] Chunking complete: ${manifests.length} files → ${chunks.length} chunks (~${estimateTotalTokens(chunks).toLocaleString()} tokens)`
    )
  }

  // Phase 11: Build annotation summary and apply ignores
  const annotationSummary = buildAnnotationSummary(manifests, chunks)

  // Filter out ignored files
  const ignoredSet = new Set(annotationSummary.ignoredFiles.map((f) => f.replace(/^\.?\/+/, '')))
  let activeChunks = chunks.filter((c) => !ignoredSet.has(c.filePath.replace(/^\.?\/+/, '')))

  // Filter out ignored lines
  activeChunks = activeChunks.filter(
    (c) =>
      !annotationSummary.ignoredLines.some(
        (il) =>
          il.filePath === c.filePath && il.startLine >= c.startLine && il.startLine <= c.endLine
      )
  )

  // If --annotations flag: scope to only annotated chunks
  if (scope.annotationsOnly) {
    activeChunks = activeChunks.filter(
      (c) =>
        annotationSummary.reviewRequests.some(
          (r) => c.filePath === r.filePath && c.startLine <= r.line && c.endLine >= r.line
        ) ||
        annotationSummary.focusRequests.some(
          (f) => c.filePath === f.filePath && c.startLine <= f.line && c.endLine >= f.line
        )
    )
  }

  // Build Keyword Index over ALL chunks (even unannotated/unscoped) so we have a global knowledge base
  const keywordIndex = buildKeywordIndex(chunks)

  // Inject KEYWORD context into active chunks
  for (const chunk of activeChunks) {
    const keywordContext = getKeywordContext(chunk, keywordIndex)
    if (keywordContext) {
      chunk.content = keywordContext + chunk.content
      chunk.tokenCount = estimateTokens(chunk.content)
    }
  }

  const context = { ...opts.context }
  context.annotations = annotationSummary
  if (opts.target) {
    context.targetDescription = opts.target.definition.description
    context.targetFocus = opts.target.definition.focus
  }

  // Inject logic spec if available
  const specPath = opts.swarmOptions?.specPath ?? 'palade.spec.md'
  const absoluteSpecPath = join(opts.projectRoot, specPath)
  if (existsSync(absoluteSpecPath)) {
    try {
      context.spec = readFileSync(absoluteSpecPath, 'utf-8')
      console.log(`[pipeline] Loaded logic spec from ${specPath}`)
    } catch {
      console.log(chalk.yellow(`[pipeline] Failed to read spec file: ${specPath}`))
    }
  }

  if (opts.dryRunConfig) {
    const reviewChunks =
      manifests && !opts.swarmOptions?.exhaustive
        ? await triageFiles(manifests, activeChunks, {
            maxReviewTokens: opts.swarmOptions?.maxReviewTokens,
            strictTriage: opts.swarmOptions?.strictTriage,
          })
        : activeChunks

    const estimate = estimateRunCost(reviewChunks, opts.dryRunConfig)

    console.log(chalk.bold('\nDry Run Estimate:'))
    console.log(
      kvTable([
        ['Total Chunks:', String(estimate.totalChunks)],
        ['Total Input Tokens:', String(estimate.totalInputTokens)],
        ['Agents per chunk:', String(estimate.agentCount)],
        ['Estimated Output:', String(estimate.estimatedOutputTokens)],
        ['Total Tokens (Est):', String(estimate.estimatedTotalTokens)],
      ])
    )
    console.log('\nEstimated Cost (USD):')

    const costEntries = Object.entries(estimate.estimatedCostUsd)
      .filter(([_, cost]) => cost !== null)
      .map(([provider, cost]) => [provider + ':', `$${cost?.toFixed(2)}`])

    if (costEntries.length > 0) {
      console.log(kvTable(costEntries as [string, string][]))
    } else {
      console.log('  No known pricing for configured providers.')
    }
    console.log()

    throw new CliExitError(0)
  }

  return runSwarm(
    activeChunks,
    context,
    { ...opts.swarmOptions, projectRoot: opts.projectRoot },
    manifests
  )
}
