import chalk from 'chalk'
import type { CodeChunk } from '../ingestion/types.js'
import {
  estimateTokens,
  MAX_TOKENS,
  CHARS_PER_TOKEN,
  hardSplitBudget,
} from '../ingestion/chunker.js'

const SOFT_TOKEN_LIMIT = 16_000
const HARD_CHUNK_LIMIT = MAX_TOKENS

// Economy mode's batch-size caps: tighter than the regular soft/hard limits
// above since a single combined-domain call already carries a larger output
// budget (see combined.ts's computeMaxTokens call, which scales by domain
// count), so batches need to be smaller to stay under provider context
// limits. Shared by every economy-mode call site (review/diff/watch CLI
// commands) instead of each hand-copying the same 6000/3000 literals
// (uicli-005).
export const ECONOMY_SOFT_TOKEN_CAP = 6000
export const ECONOMY_HARD_CHUNK_CAP = 3000

/**
 * Hard-truncate a chunk's content (dropping its contextPrefix first if that
 * alone would still exceed the limit) so it's guaranteed to fit under
 * `hardChunkLimit`. Used as the last resort once recursive splitting hits
 * its depth cap without shrinking below the limit (orchestrator-002).
 */
function hardTruncateChunk(chunk: CodeChunk, hardChunkLimit: number): CodeChunk {
  // Budget against the ing-003 safety-margined limit, not the raw
  // hardChunkLimit — estimateTokens' chars/4 approximation can understate a
  // dense chunk's real token count, so truncating to exactly the raw limit
  // could still leave the result over budget once counted for real.
  const effectiveLimit = hardSplitBudget(hardChunkLimit)
  const prefixTokens = estimateTokens(chunk.contextPrefix ?? '')
  const contextPrefix = prefixTokens < effectiveLimit ? chunk.contextPrefix : undefined
  const remainingTokens = Math.max(1, effectiveLimit - estimateTokens(contextPrefix ?? ''))
  const maxChars = remainingTokens * CHARS_PER_TOKEN
  const content = chunk.content.slice(0, maxChars)
  return {
    ...chunk,
    contextPrefix,
    content,
    tokenCount: estimateTokens((contextPrefix ?? '') + content),
  }
}

function splitChunk(chunk: CodeChunk, hardChunkLimit: number): CodeChunk[] {
  // A chunk whose contextPrefix ALONE exceeds the limit can never be split
  // below it by shrinking `content` — both halves re-inherit the full
  // prefix via the `...chunk` spreads below, so their tokenCount can never
  // drop under hardChunkLimit no matter how small content gets. Drop the
  // prefix entirely in that case rather than re-prepending it whole to two
  // chunks that are mathematically incapable of satisfying the limit
  // (orchestrator-001).
  const prefixTokens = estimateTokens(chunk.contextPrefix ?? '')
  const contextPrefix = prefixTokens < hardChunkLimit ? chunk.contextPrefix : undefined

  const lines = chunk.content.split('\n')
  const mid = Math.floor(lines.length / 2)
  const overlap = Math.min(50, Math.floor(lines.length * 0.1))

  // Try to find a natural break point near the midpoint:
  // blank line, closing brace, or end of a block. This avoids splitting
  // mid-function and sends more coherent context to specialist agents.
  let splitIdx = Math.max(1, mid)
  const searchRadius = Math.floor(lines.length * 0.15) // up to 15% of lines
  const breakPatterns = [/^\s*$/, /^\s*\}/, /^\s*\)\s*{?\s*$/]
  outer: for (let offset = 0; offset <= searchRadius; offset++) {
    for (const dir of [1, -1]) {
      const candidate = mid + dir * offset
      if (candidate > 0 && candidate < lines.length) {
        if (breakPatterns.some((p) => p.test(lines[candidate]))) {
          splitIdx = candidate
          break outer
        }
      }
    }
  }

  const splitPoint = Math.max(0, splitIdx - overlap)

  const leftContent = lines.slice(0, splitIdx).join('\n')
  const rightContent = lines.slice(splitPoint).join('\n')

  // Line-based splitting makes no progress on a chunk that's effectively one
  // oversized line (e.g. a minified file): leftContent stays the full input
  // and rightContent is empty, so recursing on the halves never shrinks
  // anything. Fall back to a raw character split in that case.
  if (leftContent.length === chunk.content.length && rightContent.length === 0) {
    const charMid = Math.floor(chunk.content.length / 2)
    const charOverlap = Math.min(200, Math.floor(chunk.content.length * 0.1))
    const charSplitPoint = Math.max(0, charMid - charOverlap)
    const leftChars = chunk.content.slice(0, charMid)
    const rightChars = chunk.content.slice(charSplitPoint)
    return [
      {
        ...chunk,
        id: `${chunk.id}-left`,
        contextPrefix,
        content: leftChars,
        tokenCount: estimateTokens((contextPrefix ?? '') + leftChars),
      },
      {
        ...chunk,
        id: `${chunk.id}-right`,
        contextPrefix,
        content: rightChars,
        tokenCount: estimateTokens((contextPrefix ?? '') + rightChars),
      },
    ]
  }

  return [
    {
      ...chunk,
      id: `${chunk.id}-left`,
      endLine: chunk.startLine + splitIdx - 1,
      contextPrefix,
      content: leftContent,
      tokenCount: estimateTokens((contextPrefix ?? '') + leftContent),
    },
    {
      ...chunk,
      id: `${chunk.id}-right`,
      startLine: chunk.startLine + splitPoint,
      contextPrefix,
      content: rightContent,
      tokenCount: estimateTokens((contextPrefix ?? '') + rightContent),
    },
  ]
}

export function estimateTotalTokens(chunks: CodeChunk[]): number {
  return chunks.reduce((sum, c) => sum + c.tokenCount, 0)
}

// Recursively split a single oversized chunk down to hardChunkLimit using
// splitChunk's natural-break-point + overlap logic above (blank
// line/closing-brace search near the midpoint, ~10% overlap between the two
// halves), falling back to a hard character truncation if splitting hasn't
// converged after 10 levels. Exported so other re-split call sites (e.g.
// pipeline.ts's post-context-injection re-chunk pass) can reuse the same
// overlap/break-point behavior scheduleBatches uses internally, instead of
// falling back to chunker.ts's simpler fixed-line, no-break-point
// splitLargeChunk (orch-004).
export function splitChunkToLimit(chunk: CodeChunk, hardChunkLimit: number, depth = 0): CodeChunk[] {
  if (depth > 10) {
    // Depth cap: splitting hasn't converged below hardChunkLimit after 10
    // levels (e.g. a single line whose contextPrefix alone is enormous).
    // Hard-truncate instead of returning the chunk oversized — an emitted
    // chunk over the limit gets truncated unpredictably at the provider
    // level instead of here, where we can at least log it (orchestrator-002).
    const truncated = hardTruncateChunk(chunk, hardChunkLimit)
    console.warn(
      chalk.yellow(
        `⚠ scheduler: chunk ${chunk.id} still exceeded the ${hardChunkLimit}-token limit after ${depth} splits — hard-truncated from ${chunk.tokenCount} to ${truncated.tokenCount} tokens`
      )
    )
    return [truncated]
  }
  // Gate on the ing-003 safety-margined budget, not the raw hardChunkLimit —
  // estimateTokens' chars/4 approximation can understate a dense chunk's real
  // token count, so a chunk that "fits" by the raw estimate could still
  // overflow the provider's real hard limit once actually counted.
  if (chunk.tokenCount <= hardSplitBudget(hardChunkLimit)) {
    return [chunk]
  }
  const halves = splitChunk(chunk, hardChunkLimit)
  return halves.flatMap((h) => splitChunkToLimit(h, hardChunkLimit, depth + 1))
}

export function scheduleBatches(
  chunks: CodeChunk[],
  softTokenLimit: number = SOFT_TOKEN_LIMIT,
  hardChunkLimit: number = HARD_CHUNK_LIMIT
): CodeChunk[][] {
  if (chunks.length === 0) return []

  const processedChunks: CodeChunk[] = []
  for (const chunk of chunks) {
    processedChunks.push(...splitChunkToLimit(chunk, hardChunkLimit))
  }

  // Real per-chunk token sum — this is what the bin-packing loop below
  // actually enforces softTokenLimit against (chunk.tokenCount is the real
  // size sent to the provider for each chunk), so the fast-path gate below
  // must use the SAME sum (orchestrator-004). splitChunk's split halves used
  // to also compute and thread an "overlap-adjusted" total (the token count
  // of the line/char range duplicated across both halves) up through
  // splitToLimit for exactly this purpose, but nothing ever consumed it — it
  // was computed, summed across every recursive split, and then discarded.
  // Removed rather than kept as dead plumbing (orchestrator-103).
  const rawTotalTokens = processedChunks.reduce((sum, c) => sum + c.tokenCount, 0)

  if (rawTotalTokens <= softTokenLimit) {
    return [processedChunks]
  }

  const batches: CodeChunk[][] = []
  let current: CodeChunk[] = []
  let currentTokens = 0

  for (const chunk of processedChunks) {
    if (currentTokens + chunk.tokenCount > softTokenLimit && current.length > 0) {
      batches.push(current)
      current = []
      currentTokens = 0
    }
    current.push(chunk)
    currentTokens += chunk.tokenCount
  }

  if (current.length > 0) batches.push(current)
  return batches
}
