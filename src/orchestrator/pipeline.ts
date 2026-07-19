import crypto from 'node:crypto'
import { join } from 'node:path'
import chalk from 'chalk'
import type { AgentContext } from '../agents/base.js'
import type { ScopeOptions, CodeChunk, FileManifest } from '../ingestion/types.js'
import { walkProject } from '../ingestion/walker.js'
import { chunkFiles, estimateTokens, MAX_TOKENS } from '../ingestion/chunker.js'
import { buildKeywordIndex, getKeywordContext } from '../ingestion/keywordIndex.js'
import { buildRetrievedContext } from '../ingestion/contextPacks.js'
import { buildAnnotationSummary, parseFile } from '../ingestion/annotationParser.js'
import { buildRepoContext, renderRepoContext } from '../ingestion/repoContext.js'
import type { SwarmResult, SwarmOptions, ResolvedTarget } from './types.js'
import { estimateTotalTokens, splitChunkToLimit } from './scheduler.js'
import { runSwarm } from './swarm.js'
import { triageFiles } from './triage.js'
import { estimateRunCost } from '../ingestion/estimator.js'
import { CliExitError } from '../errors/types.js'
import { kvTable } from '../ui/layout.js'
import type { PaladeConfig } from '../config/schema.js'
import { readOptionalProjectDoc } from '../config/docs.js'

export interface PipelineOptions {
  projectRoot: string
  scope: ScopeOptions
  context: AgentContext
  swarmOptions?: SwarmOptions
  target?: ResolvedTarget
  dryRunConfig?: PaladeConfig
}

// Merge context from both sources, dedup by the (filePath, line range) the
// header names — NOT the raw header line. buildRetrievedContext and
// getKeywordContext format headers differently (score vs symbol name), so two
// blocks describing the exact same source chunk would otherwise carry
// different raw text and both survive, duplicating that chunk's content in
// the prompt.
export function contextBlockKey(header: string): string {
  const pathMatch = header.match(/^\/\/ --- (\S+)/)
  const lineMatch = header.match(/lines (\d+)-(\d+)/)
  if (pathMatch && lineMatch) {
    return `${pathMatch[1]}:${lineMatch[1]}-${lineMatch[2]}`
  }
  return header
}

export function mergeContexts(retrieved: string, keyword: string): string {
  if (!retrieved) return keyword
  if (!keyword) return retrieved
  const seen = new Set<string>()
  const blocks: string[] = []
  for (const src of [retrieved, keyword]) {
    const lines = src.split('\n')
    let i = 0
    while (i < lines.length) {
      if (lines[i].startsWith('// --- ')) {
        const key = contextBlockKey(lines[i])
        if (!seen.has(key)) {
          seen.add(key)
          const blockLines: string[] = [lines[i]]
          i++
          while (i < lines.length && !lines[i].startsWith('// --- ')) {
            blockLines.push(lines[i])
            i++
          }
          blocks.push(blockLines.join('\n'))
        } else {
          i++
          while (i < lines.length && !lines[i].startsWith('// --- ')) {
            i++
          }
        }
      } else {
        i++
      }
    }
  }
  if (blocks.length === 0) return ''
  return `\n\n/* [REPOSITORY CONTEXT] */\n${blocks.join('\n\n')}\n/* [END REPOSITORY CONTEXT] */\n\n`
}

export async function runPipeline(opts: PipelineOptions): Promise<SwarmResult> {
  const scope = { ...opts.scope }
  if (opts.target) {
    scope.targetPaths = opts.target.resolvedPaths
  }

  // If symbol chunks are provided (from :: syntax), skip walking and use them directly
  let manifests: FileManifest[]
  let chunks: CodeChunk[]

  if (scope.symbolChunks && scope.symbolChunks.length > 0) {
    chunks = scope.symbolChunks
    // Build a minimal manifest stub per touched file so downstream code
    // (annotation summary, triage, cross-referencing) still has something to
    // work with, without paying for a full project walk we don't need here.
    // Chunks are grouped by file first (a file can contribute more than one
    // chunk) so linesOfCode reflects every selected chunk's range, not just
    // the first one seen, and parseFile — disk I/O — runs once per distinct
    // file concurrently rather than serialized chunk-by-chunk.
    const chunksByPath = new Map<string, CodeChunk[]>()
    for (const chunk of chunks) {
      const existing = chunksByPath.get(chunk.filePath)
      if (existing) existing.push(chunk)
      else chunksByPath.set(chunk.filePath, [chunk])
    }
    manifests = await Promise.all(
      Array.from(chunksByPath.entries()).map(async ([filePath, fileChunks]) => {
        const absolutePath = join(opts.projectRoot, filePath)
        const annotations = await parseFile(absolutePath)
        const linesOfCode = fileChunks.reduce((sum, c) => sum + (c.endLine - c.startLine + 1), 0)
        return {
          path: filePath,
          absolutePath,
          language: fileChunks[0].language,
          sizeBytes: 0,
          linesOfCode,
          annotations,
          lastModified: new Date(),
        }
      })
    )
    console.log(
      `[pipeline] Symbol-scoped: ${chunksByPath.size} file(s) → ${chunks.length} chunk(s) (~${estimateTotalTokens(chunks).toLocaleString()} tokens)`
    )
  } else {
    manifests = await walkProject(opts.projectRoot, scope)
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

    chunks = await chunkFiles(manifests, opts.swarmOptions?.hardChunkLimit ?? MAX_TOKENS)

    console.log(
      `[pipeline] Chunking complete: ${manifests.length} files → ${chunks.length} chunks (~${estimateTotalTokens(chunks).toLocaleString()} tokens)`
    )
  }

  // Phase 11: Build annotation summary and apply ignores
  const annotationSummary = buildAnnotationSummary(manifests)

  // Filter out ignored files
  const ignoredSet = new Set(annotationSummary.ignoredFiles.map((f) => f.replace(/^\.?\/+/, '')))
  let activeChunks = chunks.filter((c) => !ignoredSet.has(c.filePath.replace(/^\.?\/+/, '')))

  // Triage should rank/consider the same file set the swarm actually reviews
  // — a manifest for an @palade-ignored file would otherwise still compete
  // for the token budget even though its chunks are dropped from review.
  const triageManifests = manifests.filter((m) => !ignoredSet.has(m.path.replace(/^\.?\/+/, '')))

  // Line-level ignores are applied to FINDINGS inside runSwarm — see
  // annotationSummary.ignoredLines passed below — not by dropping chunks
  // here. Removing a whole chunk because one line inside it carries
  // `@palade ignore` would silently hide up to a few hundred unrelated lines
  // from review. Filtering happens before cross-agent correlation and
  // synthesis run (not on the final result), since those can't be filtered
  // after the fact — see SwarmOptions.ignoredLines.

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

  // Build Keyword Index over every NON-IGNORED chunk (even unannotated/unscoped
  // ones) so we have a global knowledge base — but an @palade ignore-file'd
  // file must not be a source of injected context either, or its source gets
  // quoted into other prompts (and sent to third-party LLMs) despite being
  // excluded from review itself.
  const contextSourceChunks = chunks.filter(
    (c) => !ignoredSet.has(c.filePath.replace(/^\.?\/+/, ''))
  )
  const keywordIndex = buildKeywordIndex(contextSourceChunks)

  // Inject KEYWORD context into active chunks. Compute every prefix against the
  // pristine chunk corpus BEFORE mutating any chunk.content — otherwise an
  // earlier chunk's injected foreign-code block would leak into the retrieved
  // context of later chunks, making the result order-dependent.
  const contextPrefixes = activeChunks.map((chunk) =>
    mergeContexts(
      buildRetrievedContext(chunk, contextSourceChunks),
      getKeywordContext(chunk, keywordIndex)
    )
  )
  activeChunks.forEach((chunk, i) => {
    const contextPrefix = contextPrefixes[i]
    if (contextPrefix) {
      // Create a new chunk object instead of mutating the shared reference —
      // `chunks` (used to build the keyword index) and `activeChunks` share
      // the same CodeChunk objects, so mutating in-place would corrupt the
      // keyword index's content mapping.
      activeChunks[i] = {
        ...chunk,
        contextPrefix,
        tokenCount: estimateTokens(contextPrefix + chunk.content),
      }
    }
  })

  // Re-chunk any active chunk that grew beyond the run's configured hard
  // chunk limit after context injection — not the hardcoded chunker.ts
  // MAX_TOKENS, which ignores a tighter run-time hardChunkLimit (e.g. as low
  // as 3000 in economy mode), letting an oversized chunk slip through this
  // pass only to be re-split by scheduler.ts's own independent splitting
  // logic later (orchestrator-003).
  const hardChunkLimit = opts.swarmOptions?.hardChunkLimit ?? MAX_TOKENS
  activeChunks = activeChunks.flatMap((chunk) => {
    if ((chunk.tokenCount ?? estimateTokens(chunk.content)) > hardChunkLimit) {
      return splitChunkToLimit(chunk, hardChunkLimit)
    }
    return [chunk]
  })

  const context = { ...opts.context }
  context.annotations = annotationSummary
  const repoContextBlock = renderRepoContext(
    await buildRepoContext(manifests, contextSourceChunks, opts.projectRoot)
  )
  if (repoContextBlock) context.repoContext = repoContextBlock
  if (opts.target) {
    context.targetDescription = opts.target.definition.description
    context.targetFocus = opts.target.definition.focus
  }

  // Inject logic spec if available
  const specPath = opts.swarmOptions?.specPath ?? 'palade.spec.md'
  const specDoc = readOptionalProjectDoc(opts.projectRoot, specPath)
  if (specDoc.status === 'ok') {
    context.spec = specDoc.content
    console.log(`[pipeline] Loaded logic spec from ${specPath}`)
  } else if (specDoc.status === 'error') {
    console.log(chalk.yellow(`[pipeline] Failed to read spec file: ${specPath}`))
  }

  // Inject agent constitution if available
  const constitutionPath = opts.swarmOptions?.constitutionPath ?? '.palade/constitution.md'
  const constitutionDoc = readOptionalProjectDoc(opts.projectRoot, constitutionPath)
  if (constitutionDoc.status === 'ok') {
    context.constitution = constitutionDoc.content
    console.log(`[pipeline] Loaded agent constitution from ${constitutionPath}`)
  } else if (constitutionDoc.status === 'error') {
    console.log(chalk.yellow(`[pipeline] Failed to read constitution file: ${constitutionPath}`))
  }

  if (opts.dryRunConfig) {
    const reviewChunks = !opts.swarmOptions?.exhaustive
      ? await triageFiles(triageManifests, activeChunks, {
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
    {
      ...opts.swarmOptions,
      projectRoot: opts.projectRoot,
      ignoredLines: annotationSummary.ignoredLines,
    },
    triageManifests
  )
}
