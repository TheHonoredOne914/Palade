import { describe, it, expect } from 'vitest'
import { scheduleBatches, estimateTotalTokens } from './scheduler.js'
import type { CodeChunk } from '../ingestion/types.js'

function makeChunk(id: string, tokenCount: number, customLines?: number): CodeChunk {
  let lines = 0;
  let lineLength = 40;
  if (customLines) {
    lines = customLines;
    lineLength = Math.max(1, Math.floor((tokenCount * 4) / lines));
  } else {
    lines = Math.ceil((tokenCount * 4) / lineLength);
  }
  
  const content = Array.from({ length: lines }, (_, i) => `line: ${'x'.repeat(Math.max(0, lineLength - 6))}`).join('\n')
  return {
    id, filePath: 'test.ts', startLine: 1, endLine: lines,
    content, tokenCount, language: 'typescript'
  }
}

describe('scheduler', () => {
  describe('estimateTotalTokens', () => {
    it('sums tokenCount of all chunks', () => {
      const chunks = [makeChunk('1', 10), makeChunk('2', 20)]
      expect(estimateTotalTokens(chunks)).toBe(30)
    })
    it('returns 0 for empty array', () => {
      expect(estimateTotalTokens([])).toBe(0)
    })
  })

  describe('scheduleBatches', () => {
    it('handles empty input', () => {
      expect(scheduleBatches([])).toEqual([[]])
    })

    it('puts chunks in a single batch if total <= 8000', () => {
      // 2000 + 3000 = 5000 <= 8000
      const chunks = [makeChunk('1', 2000), makeChunk('2', 3000)]
      const batches = scheduleBatches(chunks)
      expect(batches).toHaveLength(1)
      expect(batches[0]).toHaveLength(2)
      expect(estimateTotalTokens(batches[0])).toBeLessThanOrEqual(5500) // allowing for minor length variations
    })

    it('splits into multiple batches if total > 8000', () => {
      // 5000 will be split, 4000 will be split. Total > 8000
      const chunks = [makeChunk('1', 2500), makeChunk('2', 2500), makeChunk('3', 2500), makeChunk('4', 2500)]
      const batches = scheduleBatches(chunks)
      expect(batches.length).toBeGreaterThanOrEqual(2)
    })

    it('splits an oversized chunk (tokenCount > 3000)', () => {
      // 4000 tokens = ~16000 chars = ~400 lines
      const chunk = makeChunk('huge', 4000)
      const batches = scheduleBatches([chunk])
      
      const allChunks = batches.flat()
      // Should be split because 4000 > 3000
      expect(allChunks.length).toBeGreaterThanOrEqual(2)
      expect(allChunks[0].id).toBe('huge-left')
      
      const leftLines = allChunks[0].content.split('\n').length
      const rightLines = allChunks[1].content.split('\n').length
      
      // Proportional overlap: 400 lines * 10% = 40 lines
      expect(leftLines + rightLines).toBeGreaterThan(400)
      expect(leftLines + rightLines).toBeLessThanOrEqual(400 + 40 + 5)
    })
    
    it('caps proportional overlap at 50 for very large chunks', () => {
      // 5000 tokens (will split once into ~2500, which is < 3000 limit) over 1000 lines
      const chunk = makeChunk('huge2', 5000, 1000)
      const batches = scheduleBatches([chunk])
      
      const allChunks = batches.flat()
      // Should have split exactly once
      expect(allChunks).toHaveLength(2)
      
      const leftLines = allChunks[0].content.split('\n').length
      const rightLines = allChunks[1].content.split('\n').length
      
      // The chunk had 1000 lines. 10% is 100, but capped at 50.
      expect(leftLines + rightLines).toBeGreaterThan(1000)
      expect(leftLines + rightLines).toBeLessThanOrEqual(1000 + 50 + 5)
    })
  })
})
