import { describe, it, expect } from 'vitest'
import { scheduleBatches, estimateTotalTokens } from '../orchestrator/scheduler.js'
import { validateAndFingerprintFindings } from '../orchestrator/findingValidation.js'
import { jaccardSimilarity } from '../orchestrator/merger.js'
import { MAX_TOKENS, estimateTokens } from '../ingestion/chunker.js'
import type { AgentFinding } from '../agents/base.js'
import {
  SCHEDULER_DEFECTS,
  FINDING_VALIDATION_DEFECTS,
  ALL_DEFECTS,
  realBugCount,
} from './groundTruth.js'
import { scoreAgents, type AgentRun } from './scorer.js'
import {
  makeMinifiedChunk,
  makeNormalChunk,
  makeMixedChunk,
  makeHugeSingleLineChunk,
  makeWindowsPathChunk,
  makeRelativePathChunk,
} from './inputs.js'

function allChunks(batches: ReturnType<typeof scheduleBatches>) {
  return batches.flat()
}

describe('benchmark/ground-truth: scheduler splitting behavior', () => {
  it('minified single-line chunk splits via character fallback (S2/S3 traps are false)', () => {
    const batches = scheduleBatches([makeMinifiedChunk()])
    const chunks = allChunks(batches)
    expect(chunks.length).toBeGreaterThanOrEqual(2)
    for (const c of chunks) {
      expect(c.tokenCount).toBeLessThanOrEqual(MAX_TOKENS + 1)
      expect(c.startLine).toBeLessThanOrEqual(c.endLine)
    }
    const totalChars = chunks.reduce((s, c) => s + c.content.length, 0)
    expect(totalChars).toBeGreaterThan(makeMinifiedChunk().content.length)
  })

  it('normal multi-function chunk splits by lines with valid, overlapping ranges', () => {
    const batches = scheduleBatches([makeNormalChunk()])
    const chunks = allChunks(batches)
    expect(chunks.length).toBeGreaterThanOrEqual(2)
    for (const c of chunks) {
      expect(c.tokenCount).toBeLessThanOrEqual(MAX_TOKENS + 1)
      expect(c.startLine).toBeLessThanOrEqual(c.endLine)
    }
    for (let i = 1; i < chunks.length; i++) {
      const prev = chunks[i - 1]
      const cur = chunks[i]
      expect(cur.startLine).toBeLessThanOrEqual(prev.endLine + 1)
    }
  })

  it('mixed chunk splits both the normal and minified sections', () => {
    const batches = scheduleBatches([makeMixedChunk()])
    const chunks = allChunks(batches)
    expect(chunks.length).toBeGreaterThanOrEqual(2)
    for (const c of chunks) {
      expect(c.tokenCount).toBeLessThanOrEqual(MAX_TOKENS + 1)
    }
  })

  it('huge single-line chunk exceeds HARD limit after depth cap (S1 real bug)', () => {
    const batches = scheduleBatches([makeHugeSingleLineChunk()])
    const chunks = allChunks(batches)
    const overLimit = chunks.filter((c) => c.tokenCount > MAX_TOKENS)
    expect(overLimit.length).toBeGreaterThan(0)
  })
})

describe('benchmark/ground-truth: findingValidation behavior', () => {
  it('Windows-path finding matches Windows-path chunk (F1 trap is false)', () => {
    const f: AgentFinding = {
      id: 'i',
      agentName: 'a',
      severity: 'high',
      title: 't',
      description: 'd',
      filePath: 'C:\\path\\to\\file.ts',
      lineStart: 10,
      tags: [],
    } as AgentFinding
    const validated = validateAndFingerprintFindings([f], [makeWindowsPathChunk()])
    expect(validated).toHaveLength(1)
    expect(validated[0].filePath).toBe('C:/path/to/file.ts')
  })

  it('relative-path finding matches relative-path chunk', () => {
    const f: AgentFinding = {
      id: 'i',
      agentName: 'a',
      severity: 'high',
      title: 't',
      description: 'd',
      filePath: './src/foo.ts',
      lineStart: 10,
      tags: [],
    } as AgentFinding
    const validated = validateAndFingerprintFindings([f], [makeRelativePathChunk()])
    expect(validated).toHaveLength(1)
    expect(validated[0].filePath).toBe('src/foo.ts')
  })

  it('out-of-range finding is dropped, not lost silently (F3 trap is false)', () => {
    const f: AgentFinding = {
      id: 'i',
      agentName: 'a',
      severity: 'high',
      title: 't',
      description: 'd',
      filePath: 'src/foo.ts',
      lineStart: 350,
      tags: [],
    } as AgentFinding
    const validated = validateAndFingerprintFindings([f], [makeRelativePathChunk()])
    expect(validated).toHaveLength(0)
  })
})

describe('benchmark/ground-truth: verified real bugs', () => {
  it('S2: contextPrefix makes a chunk unsplittable -> oversized chunk returned', () => {
    const content = 'const x = 1'
    const chunk = {
      id: 'p',
      filePath: 'p.ts',
      startLine: 1,
      endLine: 1,
      content,
      contextPrefix: 'a'.repeat(25000),
      tokenCount: estimateTokens(('a'.repeat(25000) + content) as string),
      language: 'typescript' as const,
    }
    const over = allChunks(scheduleBatches([chunk as never])).filter(
      (c) => c.tokenCount > MAX_TOKENS
    )
    expect(over.length).toBeGreaterThan(0)
  })

  it('S3: overlap double-counts tokens -> children sum exceeds parent', () => {
    const chunk = makeNormalChunk()
    const parentTokens = chunk.tokenCount
    const childrenTokens = estimateTotalTokens(allChunks(scheduleBatches([chunk])))
    expect(childrenTokens).toBeGreaterThan(parentTokens)
  })

  it('F1: Windows case difference drops a valid finding', () => {
    const chunk = { ...makeWindowsPathChunk(), filePath: 'c:/path/to/file.ts' }
    const f = {
      id: 'i',
      agentName: 'a',
      severity: 'high' as const,
      title: 't',
      description: 'd',
      filePath: 'C:/path/to/file.ts',
      lineStart: 10,
      tags: [],
    } as AgentFinding
    expect(validateAndFingerprintFindings([f], [chunk])).toHaveLength(0)
  })

  it('F2: unresolved relative ".." / "./" drops a valid finding', () => {
    const base = makeRelativePathChunk()
    const up = {
      id: 'i',
      agentName: 'a',
      severity: 'high' as const,
      title: 't',
      description: 'd',
      filePath: '../src/foo.ts',
      lineStart: 10,
      tags: [],
    } as AgentFinding
    const internal = { ...up, id: 'j', filePath: 'src/./foo.ts' }
    expect(validateAndFingerprintFindings([up], [base])).toHaveLength(0)
    expect(validateAndFingerprintFindings([internal], [base])).toHaveLength(0)
  })

  it('F3: finding with undefined lineStart is emitted without a fingerprint', () => {
    const chunk = makeRelativePathChunk()
    const f = {
      id: 'i',
      agentName: 'a',
      severity: 'high' as const,
      title: 't',
      description: 'd',
      filePath: 'src/foo.ts',
      tags: [],
    } as AgentFinding
    const [valid] = validateAndFingerprintFindings([f], [chunk])
    expect(valid).toBeDefined()
    expect(valid.findingFingerprint).toBeUndefined()
  })

  it('F4: non-integer lineStart is dropped as out of range', () => {
    const chunk = makeRelativePathChunk()
    const f = {
      id: 'i',
      agentName: 'a',
      severity: 'high' as const,
      title: 't',
      description: 'd',
      filePath: 'src/foo.ts',
      lineStart: 12.5,
      tags: [],
    } as AgentFinding
    expect(validateAndFingerprintFindings([f], [chunk])).toHaveLength(0)
  })

  it('M1: jaccardSimilarity returns 1 for punctuation-only titles', () => {
    expect(jaccardSimilarity('!!!', '@@@')).toBe(1)
  })
})

describe('benchmark/scoring: precision/recall over agent claims', () => {
  const goodAgent: AgentRun = {
    agentName: 'careful',
    claims: [
      {
        file: 'src/orchestrator/scheduler.ts',
        lineStart: 92,
        lineEnd: 93,
        severity: 'medium',
        claim: 'depth>10 returns oversized chunk unfixed',
      },
    ],
  }

  const badAgent: AgentRun = {
    agentName: 'eager',
    claims: [
      { file: 'src/orchestrator/scheduler.ts', lineStart: 45, claim: 'char-split corrupts line range' },
      { file: 'src/orchestrator/scheduler.ts', lineStart: 41, claim: 'char-split is dead code' },
      { file: 'src/orchestrator/scheduler.ts', lineStart: 35, claim: 'overlap duplicates findings' },
      { file: 'src/orchestrator/findingValidation.ts', lineStart: 8, claim: 'windows path mishandled' },
      { file: 'src/orchestrator/findingValidation.ts', lineStart: 40, claim: 'fingerprint collision' },
      { file: 'src/orchestrator/findingValidation.ts', lineStart: 92, claim: 'silent finding drops' },
    ],
  }

  it('counts real bugs and false-positive traps in the catalog', () => {
    expect(realBugCount(ALL_DEFECTS)).toBe(1)
    expect(SCHEDULER_DEFECTS.filter((d) => d.category === 'false-positive')).toHaveLength(3)
    expect(FINDING_VALIDATION_DEFECTS.filter((d) => d.category === 'false-positive')).toHaveLength(3)
  })

  it('careful agent scores high precision and finds the real bug', () => {
    const report = scoreAgents([goodAgent], ALL_DEFECTS)
    const r = report.perAgent[0]
    expect(r.precision).toBe(1)
    expect(r.recall).toBe(1)
    expect(r.f1).toBe(1)
    expect(r.falsePositiveRate).toBe(0)
    expect(report.aggregate.distinctRealBugsFound).toBe(1)
  })

  it('eager agent scores low precision and misses the real bug', () => {
    const report = scoreAgents([badAgent], ALL_DEFECTS)
    const r = report.perAgent[0]
    expect(r.precision).toBe(0)
    expect(r.recall).toBe(0)
    expect(r.falsePositiveRate).toBe(1)
    expect(report.aggregate.distinctRealBugsFound).toBe(0)
    expect(report.aggregate.totalFalsePositives).toBe(6)
  })

  it('blended swarm recall improves while precision drops', () => {
    const report = scoreAgents([goodAgent, badAgent], ALL_DEFECTS)
    expect(report.aggregate.distinctRealBugsFound).toBe(1)
    expect(report.aggregate.totalClaims).toBe(7)
    expect(report.aggregate.totalFalsePositives).toBe(6)
    expect(report.aggregate.precision).toBeCloseTo(1 / 7)
    expect(report.aggregate.recall).toBe(1)
  })
})
