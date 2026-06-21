import type { CodeChunk } from '../ingestion/types.js'

const SOFT_TOKEN_LIMIT = 8_000
const HARD_CHUNK_LIMIT = 3_000

function splitChunk(chunk: CodeChunk): CodeChunk[] {
  const lines = chunk.content.split('\n')
  const mid = Math.floor(lines.length / 2)
  const overlap = 50
  const splitPoint = Math.max(0, mid - overlap)

  const leftContent = lines.slice(0, mid).join('\n')
  const rightContent = lines.slice(splitPoint).join('\n')

  return [
    {
      ...chunk,
      id: `${chunk.id}-left`,
      endLine: chunk.startLine + mid - 1,
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
  // Split oversized chunks
  const processedChunks: CodeChunk[] = []
  for (const chunk of chunks) {
    if (chunk.tokenCount > HARD_CHUNK_LIMIT) {
      const halves = splitChunk(chunk)
      for (const half of halves) {
        if (half.tokenCount > HARD_CHUNK_LIMIT) {
          const subHalves = splitChunk(half)
          processedChunks.push(...subHalves)
        } else {
          processedChunks.push(half)
        }
      }
    } else {
      processedChunks.push(chunk)
    }
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
