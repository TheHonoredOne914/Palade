import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DeadCodeAgent, DEAD_CODE_WARNING, DEAD_CODE_FOCUS } from './deadCode.js'
import * as router from '../../providers/router.js'
import type { AgentContext } from '../base.js'
import type { CodeChunk } from '../../ingestion/types.js'
import type { IProvider } from '../../providers/base.js'

describe('agents/specialist/deadCode — exported prompt fragments', () => {
  it('DEAD_CODE_WARNING warns against flagging exports as unused from partial chunks', () => {
    expect(DEAD_CODE_WARNING).toContain('PARTIAL chunks')
    expect(DEAD_CODE_WARNING).toContain('unused')
    expect(DEAD_CODE_WARNING).toContain('LOCALLY dead code')
  })

  it('DEAD_CODE_FOCUS lists domain-specific concerns and library-consumer guidance', () => {
    expect(DEAD_CODE_FOCUS).toContain('Exported functions/classes never imported elsewhere')
    expect(DEAD_CODE_FOCUS).toContain('PUBLIC API FILES')
    expect(DEAD_CODE_FOCUS).toContain('library')
  })
})

describe('DeadCodeAgent', () => {
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
    filePath: 'src/utils/invoiceUtils.ts',
    startLine: 54,
    endLine: 61,
    content: 'export function formatLegacyInvoice() {}',
    tokenCount: 5,
    language: 'typescript',
  }

  it('has the correct agent name', () => {
    const agent = new DeadCodeAgent()
    expect(agent.name).toBe('deadCode')
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

    const agent = new DeadCodeAgent()
    await agent.analyze([chunk], ctx)

    expect(mockProvider.complete).toHaveBeenCalledTimes(1)
    const request = mockProvider.complete.mock.calls[0][0]
    expect(request.systemPrompt).toContain(DEAD_CODE_WARNING)
    expect(request.systemPrompt).toContain(DEAD_CODE_FOCUS)
    expect(request.systemPrompt).toContain('specialist dead code reviewer')
  })

  it('parses findings from the provider and tags them with the deadCode agentName', async () => {
    mockProvider.complete
      .mockResolvedValueOnce({
        content:
          '[{"severity":"low","title":"Unused export","description":"formatLegacyInvoice is never imported anywhere.","filePath":"src/utils/invoiceUtils.ts","lineStart":54,"lineEnd":61}]',
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

    const agent = new DeadCodeAgent()
    const findings = await agent.analyze([chunk], ctx)

    expect(findings).toHaveLength(1)
    expect(findings[0].agentName).toBe('deadCode')
    expect(findings[0].title).toBe('Unused export')
    expect(findings[0].severity).toBe('low')
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

    const agent = new DeadCodeAgent()
    const findings = await agent.analyze([chunk], ctx)
    expect(findings).toEqual([])
  })

  it('swallows AbortError and returns an empty array', async () => {
    const abortErr = new Error('aborted')
    abortErr.name = 'AbortError'
    mockProvider.complete.mockRejectedValue(abortErr)

    const agent = new DeadCodeAgent()
    const findings = await agent.analyze([chunk], ctx)
    expect(findings).toEqual([])
  })
})