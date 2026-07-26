import { describe, it, expect, vi, beforeEach } from 'vitest'
import { LogicAgent, LOGIC_WARNING, LOGIC_FOCUS } from './logic.js'
import * as router from '../../providers/router.js'
import type { AgentContext } from '../base.js'
import type { CodeChunk } from '../../ingestion/types.js'
import type { IProvider } from '../../providers/base.js'

describe('agents/specialist/logic — exported prompt fragments', () => {
  it('LOGIC_WARNING warns against assuming call-site correctness from partial chunks', () => {
    expect(LOGIC_WARNING).toContain('PARTIAL chunks')
    expect(LOGIC_WARNING).toContain('LOCALLY verifiable logic flaws')
  })

  it('LOGIC_FOCUS lists domain-specific concerns and excludes style-only issues', () => {
    expect(LOGIC_FOCUS).toContain('REPOSITORY CONTEXT')
    expect(LOGIC_FOCUS).toContain('off-by-one errors')
    expect(LOGIC_FOCUS).toContain('DO NOT report syntax errors')
  })
})

describe('LogicAgent', () => {
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

  const ctx: AgentContext = {
    mode: 'standard',
    totalFiles: 1,
    totalChunks: 1,
    projectLanguages: ['typescript'],
  }
  const chunk: CodeChunk = {
    id: '1',
    filePath: 'src/utils/pagination.ts',
    startLine: 10,
    endLine: 15,
    content: 'for (let i = 0; i <= items.length; i++) { use(items[i]) }',
    tokenCount: 5,
    language: 'typescript',
  }

  it('has the correct agent name', () => {
    const agent = new LogicAgent()
    expect(agent.name).toBe('logic')
  })

  it('sends a system prompt that includes the warning and focus blocks', async () => {
    mockProvider.complete.mockResolvedValueOnce({
      content: '[]',
      provider: 'mock-provider',
      model: 'mock-model-v2',
      inputTokens: 10,
      outputTokens: 10,
      durationMs: 10,
    })

    const agent = new LogicAgent()
    await agent.analyze([chunk], ctx)

    expect(mockProvider.complete).toHaveBeenCalledTimes(1)
    const request = mockProvider.complete.mock.calls[0][0]
    expect(request.systemPrompt).toContain(LOGIC_WARNING)
    expect(request.systemPrompt).toContain(LOGIC_FOCUS)
    expect(request.systemPrompt).toContain('Logic & Correctness expert')
  })

  it('parses findings from the provider and tags them with the logic agentName', async () => {
    mockProvider.complete
      .mockResolvedValueOnce({
        content:
          '[{"severity":"high","title":"Off-by-one loop bound","description":"Loop uses <= items.length, causing an out-of-bounds access on the final iteration.","filePath":"src/utils/pagination.ts","lineStart":10,"lineEnd":15}]',
        provider: 'mock-provider',
        model: 'mock-model-v2',
        inputTokens: 10,
        outputTokens: 10,
        durationMs: 10,
      })
      .mockResolvedValueOnce({
        content: 'YES',
        provider: 'mock-provider',
        model: 'mock-model-v2',
        inputTokens: 10,
        outputTokens: 10,
        durationMs: 10,
      })

    const agent = new LogicAgent()
    const findings = await agent.analyze([chunk], ctx)

    expect(findings).toHaveLength(1)
    expect(findings[0].agentName).toBe('logic')
    expect(findings[0].title).toBe('Off-by-one loop bound')
    expect(findings[0].severity).toBe('high')
  })

  it('returns an empty array when the model reports no findings', async () => {
    mockProvider.complete.mockResolvedValueOnce({
      content: '[]',
      provider: 'mock-provider',
      model: 'mock-model-v2',
      inputTokens: 10,
      outputTokens: 10,
      durationMs: 10,
    })

    const agent = new LogicAgent()
    const findings = await agent.analyze([chunk], ctx)
    expect(findings).toEqual([])
  })

  it('swallows AbortError and returns an empty array', async () => {
    const abortErr = new Error('aborted')
    abortErr.name = 'AbortError'
    mockProvider.complete.mockRejectedValue(abortErr)

    const agent = new LogicAgent()
    const findings = await agent.analyze([chunk], ctx)
    expect(findings).toEqual([])
  })
})