import type { AgentContext } from '../agents/base.js'
import type { ScopeOptions } from '../ingestion/types.js'
import { walkProject } from '../ingestion/walker.js'
import { chunkFiles } from '../ingestion/chunker.js'
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

  const context = { ...opts.context }
  if (opts.target) {
    context.targetDescription = opts.target.definition.description
    context.targetFocus = opts.target.definition.focus
  }

  return runSwarm(chunks, context, opts.swarmOptions, manifests)
}
