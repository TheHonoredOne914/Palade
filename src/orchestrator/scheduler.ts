import type { CodeChunk } from '../ingestion/types.js'

const SOFT_TOKEN_LIMIT = 8_000
const HARD_CHUNK_LIMIT = 3_000

function splitChunk(chunk: CodeChunk): CodeChunk[] {
  const lines = chunk.content.split('\n')
  const mid = Math.floor(lines.length / 2)
  const overlap = Math.min(50, Math.floor(lines.length * 0.1))

  // Try to find a natural break point near the midpoint:
  // blank line, closing brace, or end of a block. This avoids splitting
  // mid-function and sends more coherent context to specialist agents.
  let splitIdx = Math.max(1, mid)
  const searchRadius = Math.floor(lines.length * 0.15) // up to 15% of lines
  const breakPatterns = [/^\s*$/, /^\s*\}/, /^\s*\)\s*{?\s*$/]
  outer:
  for (let offset = 0; offset <= searchRadius; offset++) {
    for (const dir of [1, -1]) {
      const candidate = mid + dir * offset
      if (candidate > 0 && candidate < lines.length) {
        if (breakPatterns.some(p => p.test(lines[candidate]))) {
          splitIdx = candidate
          break outer
        }
      }
    }
  }

  const splitPoint = Math.max(0, splitIdx - overlap)

  const leftContent = lines.slice(0, splitIdx).join('\n')
  const rightContent = lines.slice(splitPoint).join('\n')

  return [
    {
      ...chunk,
      id: `${chunk.id}-left`,
      endLine: chunk.startLine + splitIdx - 1,
      content: leftContent,
      tokenCount: estimateTokens(leftContent),
    },
    {
      ...chunk,
      id: `${chunk.id}-right`,
      startLine: chunk.startLine + splitPoint,
      content: rightContent,
      tokenCount: estimateTokens(rightContent),
    },
  ]
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

export function estimateTotalTokens(chunks: CodeChunk[]): number {
  return chunks.reduce((sum, c) => sum + c.tokenCount, 0)
}

export function scheduleBatches(chunks: CodeChunk[]): CodeChunk[][] {
  if (chunks.length === 0) return []
  // Split oversized chunks recursively to ensure all pieces are under HARD_CHUNK_LIMIT
  function splitToLimit(chunk: CodeChunk, depth = 0): CodeChunk[] {
    if (depth > 10) {
      // Safety guard: stop recursing if we can't split below limit
      return [chunk]
    }
    if (chunk.tokenCount <= HARD_CHUNK_LIMIT) {
      return [chunk]
    }
    const halves = splitChunk(chunk)
    return halves.flatMap(h => splitToLimit(h, depth + 1))
  }

  const processedChunks: CodeChunk[] = []
  for (const chunk of chunks) {
    processedChunks.push(...splitToLimit(chunk))
  }

  const totalTokens = processedChunks.reduce((sum, c) => sum + c.tokenCount, 0)

  if (totalTokens <= SOFT_TOKEN_LIMIT) {
    return [processedChunks]
  }

  const batches: CodeChunk[][] = []
  let current: CodeChunk[] = []
  let currentTokens = 0

  for (const chunk of processedChunks) {
    if (currentTokens + chunk.tokenCount > SOFT_TOKEN_LIMIT && current.length > 0) {
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
