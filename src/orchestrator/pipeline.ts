import type { AgentContext } from '../agents/base.js'
import type { ScopeOptions } from '../ingestion/types.js'
import { walkProject } from '../ingestion/walker.js'
import { chunkFiles } from '../ingestion/chunker.js'
import { buildAnnotationSummary } from '../ingestion/annotationParser.js'
import type { SwarmResult, SwarmOptions, ResolvedTarget } from './types.js'
import { estimateTotalTokens } from './scheduler.js'
import { runSwarm } from './swarm.js'

export interface PipelineOptions {
  projectRoot: string
  scope: ScopeOptions
  context: AgentContext
  swarmOptions?: SwarmOptions
  target?: ResolvedTarget
  allTargets?: ResolvedTarget[]
}

export async function runPipeline(opts: PipelineOptions): Promise<SwarmResult> {
  const scope = { ...opts.scope }
  if (opts.target) {
    scope.targetPaths = opts.target.resolvedPaths
  }

  const manifests = await walkProject(opts.projectRoot, scope)
  const chunks = await chunkFiles(manifests)

  console.log(
    `[pipeline] Chunking complete: ${manifests.length} files → ${chunks.length} chunks (~${estimateTotalTokens(chunks).toLocaleString()} tokens)`
  )

  // Phase 11: Build annotation summary and apply ignores
  const annotationSummary = buildAnnotationSummary(manifests, chunks)

  // Filter out ignored files
  let activeChunks = chunks.filter(
    (c) => !annotationSummary.ignoredFiles.includes(c.filePath)
  )

  // Filter out ignored lines
  activeChunks = activeChunks.filter(
    (c) =>
      !annotationSummary.ignoredLines.some(
        (il) =>
          il.filePath === c.filePath &&
          il.startLine >= c.startLine &&
          il.startLine <= c.endLine
      )
  )

  // If --annotations flag: scope to only annotated chunks
  if (scope.annotationsOnly) {
    activeChunks = activeChunks.filter(
      (c) =>
        annotationSummary.reviewRequests.some((r) => {
          const chunk = chunks.find(
            (ch) =>
              ch.filePath === r.filePath &&
              ch.startLine <= r.line &&
              ch.endLine >= r.line
          )
          return chunk?.id === c.id
        }) ||
        annotationSummary.focusRequests.some((f) => {
          const chunk = chunks.find(
            (ch) =>
              ch.filePath === f.filePath &&
              ch.startLine <= f.line &&
              ch.endLine >= f.line
          )
          return chunk?.id === c.id
        })
    )
  }

  const context = { ...opts.context }
  context.annotations = annotationSummary
  if (opts.target) {
    context.targetDescription = opts.target.definition.description
    context.targetFocus = opts.target.definition.focus
  }

  return runSwarm(activeChunks, context, opts.swarmOptions, manifests)
}
