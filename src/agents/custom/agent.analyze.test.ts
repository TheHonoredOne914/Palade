import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CustomAgent } from './agent.js'
import * as router from '../../providers/router.js'
import type { CodeChunk } from '../../ingestion/types.js'
import type { IProvider } from '../../providers/base.js'
import type { AgentContext } from '../base.js'

describe('CustomAgent.analyze', () => {
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

  it('passes the dynamically loaded system prompt correctly', async () => {
    mockProvider.complete.mockResolvedValue({
      content: '[{"severity":"medium","title":"Custom","description":""}]',
      provider: 'mock-provider',
      model: 'mock-model-v2',
      inputTokens: 10,
      outputTokens: 10,
      durationMs: 10,
    })

    const agent = new CustomAgent({
      name: 'myAgent',
      domain: 'myDomain',
      description: 'A custom agent for testing',
      systemPrompt: 'THIS_IS_A_DYNAMIC_PROMPT',
    })

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
    expect(findings[0].agentName).toBe('myAgent')
    expect(findings[0].title).toBe('Custom')
    expect(findings[0].provider).toBe('mock-provider')

    // Verify the system prompt was sent to the provider correctly
    expect(mockProvider.complete).toHaveBeenCalledTimes(1)
    const req = mockProvider.complete.mock.calls[0][0]
    expect(req.systemPrompt).toContain('THIS_IS_A_DYNAMIC_PROMPT')
  })
})
