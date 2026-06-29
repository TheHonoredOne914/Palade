import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BaseSpecialistAgent, type AgentContext, type AgentName } from './base.js'
import * as router from '../providers/router.js'
import type { CodeChunk } from '../ingestion/types.js'
import type { IProvider } from '../providers/base.js'

class DummyAgent extends BaseSpecialistAgent {
  name: AgentName = 'security'
  domain = 'security'
  protected getSystemPrompt(): string {
    return 'DUMMY_SYSTEM_PROMPT'
  }
}

describe('BaseSpecialistAgent.analyze', () => {
  let mockProvider: any

  beforeEach(() => {
    mockProvider = {
      name: 'mock',
      model: 'mock-model',
      complete: vi.fn(),
      isAvailable: vi.fn().mockResolvedValue(true),
    }
    vi.spyOn(router, 'getProvider').mockReturnValue(mockProvider as unknown as IProvider)
  })

  it('calls provider and parses findings correctly', async () => {
    mockProvider.complete.mockResolvedValue({
      content: '[{"severity":"high","title":"Test","description":"desc"}]',
      provider: 'mock-provider',
      model: 'mock-model-v2',
      inputTokens: 10,
      outputTokens: 10,
      durationMs: 10,
    })

    const agent = new DummyAgent()
    const ctx: AgentContext = {
      mode: 'standard',
      totalFiles: 1,
      totalChunks: 1,
      projectLanguages: ['typescript'],
    }
    const chunk: CodeChunk = {
      id: '1',
      filePath: 'a.ts',
      startLine: 1,
      endLine: 2,
      content: 'const a = 1;',
      tokenCount: 1,
      language: 'typescript',
    }

    const findings = await agent.analyze([chunk], ctx)

    expect(findings).toHaveLength(1)
    expect(findings[0].title).toBe('Test')
    expect(findings[0].provider).toBe('mock-provider')
    expect(findings[0].model).toBe('mock-model-v2')
    expect(findings[0].agentName).toBe('security')
  })

  it('swallows AbortError and returns empty array', async () => {
    const abortErr = new Error('aborted')
    abortErr.name = 'AbortError'
    mockProvider.complete.mockRejectedValue(abortErr)

    const agent = new DummyAgent()
    const ctx: AgentContext = {
      mode: 'standard',
      totalFiles: 1,
      totalChunks: 1,
      projectLanguages: ['typescript'],
    }
    const findings = await agent.analyze([], ctx)
    expect(findings).toEqual([])
  })

  it('throws non-AbortErrors', async () => {
    const err = new Error('network failure')
    mockProvider.complete.mockRejectedValue(err)

    const agent = new DummyAgent()
    const ctx: AgentContext = {
      mode: 'standard',
      totalFiles: 1,
      totalChunks: 1,
      projectLanguages: ['typescript'],
    }

    await expect(agent.analyze([], ctx)).rejects.toThrow('network failure')
  })
})
