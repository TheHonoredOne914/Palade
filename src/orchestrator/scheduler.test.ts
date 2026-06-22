import { describe, it, expect } from 'vitest'
import { scheduleBatches, estimateTotalTokens } from './scheduler.js'
import type { CodeChunk } from '../ingestion/types.js'

function chunk(tokenCount: number, id = 'c'): CodeChunk {
  return {
    id,
    filePath: 'src/a.ts',
    startLine: 1,
    endLine: 10,
    content: 'x',
    tokenCount,
    language: 'typescript',
  }
}

describe('orchestrator/scheduler', () => {
  describe('estimateTotalTokens', () => {
    it('sums token counts', () => {
      expect(estimateTotalTokens([chunk(100), chunk(200), chunk(50)])).toBe(350)
    })

    it('is zero for empty input', () => {
      expect(estimateTotalTokens([])).toBe(0)
    })
  })

  describe('scheduleBatches', () => {
    it('returns a single batch when under the soft limit', () => {
      const batches = scheduleBatches([chunk(1000), chunk(1000)])
      expect(batches).toHaveLength(1)
      expect(batches[0]).toHaveLength(2)
    })

    it('splits into multiple batches over the soft limit', () => {
      // SOFT_TOKEN_LIMIT = 8000
      const batches = scheduleBatches([chunk(3000), chunk(3000), chunk(3000)])
      expect(batches.length).toBeGreaterThan(1)
      // every batch respects the limit (except one that may hold a single oversize chunk)
      for (const batch of batches) {
        const total = batch.reduce((s, c) => s + c.tokenCount, 0)
        // a single chunk that alone exceeds the limit lands in its own batch
        const isSingleOversized = batch.length === 1 && batch[0].tokenCount > 8000
        expect(isSingleOversized || total <= 8000).toBe(true)
      }
    })

    it('splits oversized chunks (over HARD_CHUNK_LIMIT)', () => {
      const batches = scheduleBatches([chunk(4000)])
      // HARD_CHUNK_LIMIT = 3000 -> split into left/right
      const allChunks = batches.flat()
      expect(allChunks.length).toBeGreaterThan(1)
    })

    it('handles empty input', () => {
      expect(scheduleBatches([])).toEqual([[]])
    })

    it('splits a large chunk set into multiple batches under the soft limit', () => {
      const manyChunks = Array.from({ length: 10 }, (_, i) => chunk(2000, `c${i}`))
      const batches = scheduleBatches(manyChunks)
      expect(batches.length).toBeGreaterThan(1)
      for (const batch of batches) {
        const total = batch.reduce((s, c) => s + c.tokenCount, 0)
        const isSingleOversized = batch.length === 1 && batch[0].tokenCount > 8000
        expect(isSingleOversized || total <= 8000).toBe(true)
      }
    })
  })
})
