import { describe, it, expect } from 'vitest'
import { estimateRunCost } from './estimator.js'
import type { CodeChunk } from './types.js'
import type { PaladeConfig } from '../config/schema.js'

describe('estimateRunCost', () => {
  const dummyConfig = {
    providers: {},
    swarm: { agentCount: 6, economyMode: false },
  } as PaladeConfig

  const economyConfig = {
    providers: {},
    swarm: { agentCount: 6, economyMode: true },
  } as PaladeConfig

  it('calculates tokens and cost for a single chunk', () => {
    const chunks: CodeChunk[] = [
      {
        id: '1',
        filePath: 'a.ts',
        startLine: 1,
        endLine: 10,
        content: 'a'.repeat(400),
        language: 'typescript',
      },
    ]

    const result = estimateRunCost(chunks, dummyConfig)

    expect(result.totalChunks).toBe(1)
    expect(result.totalInputTokens).toBe(100) // 400 chars / 4
    expect(result.agentCount).toBe(6)
    expect(result.totalAgentInvocations).toBe(6)
    expect(result.estimatedOutputTokens).toBe(6 * 400)
    expect(result.warningLevel).toBe('low')
  })

  it('adjusts invocations for economy mode', () => {
    const chunks: CodeChunk[] = [
      {
        id: '1',
        filePath: 'a.ts',
        startLine: 1,
        endLine: 10,
        content: 'a'.repeat(400),
        language: 'typescript',
      },
    ]

    const result = estimateRunCost(chunks, economyConfig)

    expect(result.agentCount).toBe(1)
    expect(result.totalAgentInvocations).toBe(1)
    expect(result.estimatedOutputTokens).toBe(400)
  })

  it('sets warningLevel to medium and high based on total tokens', () => {
    const chunk1: CodeChunk = {
      id: '1',
      filePath: 'a.ts',
      startLine: 1,
      endLine: 10,
      content: 'a'.repeat(400_000),
      language: 'typescript',
    }

    // 100k input tokens * 6 agents = 600k total input tokens => HIGH warning
    let result = estimateRunCost([chunk1], dummyConfig)
    expect(result.warningLevel).toBe('high')

    // 100k input tokens * 1 agent = 100k total input tokens => MEDIUM warning
    result = estimateRunCost([chunk1], economyConfig)
    expect(result.warningLevel).toBe('medium')
  })

  it('calculates $0 cost for free tier providers', () => {
    const config = {
      swarm: {
        primary: 'opencode-zen',
        synthesis: 'opencode-zen',
        agentCount: 1,
        economyMode: true,
      },
      providers: {
        'opencode-zen': { apiKey: 'test', model: 'deepseek-v4-flash-free' },
      },
    } as unknown as PaladeConfig

    const chunk1: CodeChunk = {
      id: '1',
      filePath: 'a.ts',
      startLine: 1,
      endLine: 10,
      content: 'a'.repeat(400),
      language: 'typescript',
    }

    const result = estimateRunCost([chunk1], config)
    expect(result.estimatedCostUsd['opencode-zen']).toBe(0)
    expect(result.estimatedCostUsd['groq']).toBeUndefined()
  })
})
