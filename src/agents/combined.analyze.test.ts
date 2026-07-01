import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CombinedAnalyzer } from './combined.js'
import * as router from '../providers/router.js'
import type { CodeChunk } from '../ingestion/types.js'
import type { IProvider } from '../providers/base.js'
import type { AgentContext } from './base.js'

describe('CombinedAnalyzer.analyze', () => {
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

  it('calls provider and extracts multi-domain findings correctly', async () => {
    mockProvider.complete.mockResolvedValue({
      content: JSON.stringify([
          { severity: 'high', title: 'SecTest', agentName: 'security', description: 'desc' },
          { severity: 'medium', title: 'ArchTest', agentName: 'architecture', description: 'desc' },
        ]),
      provider: 'mock-provider',
      model: 'mock-model-v2',
      inputTokens: 10,
      outputTokens: 10,
      durationMs: 10,
    })

    const agent = new CombinedAnalyzer()
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

    expect(findings).toHaveLength(2)

    expect(findings[0].title).toBe('SecTest')
    expect(findings[0].agentName).toBe('security')
    expect(findings[0].provider).toBe('mock-provider')

    expect(findings[1].title).toBe('ArchTest')
    expect(findings[1].agentName).toBe('architecture')
    expect(findings[1].provider).toBe('mock-provider')
  })

  it('filters out findings with invalid agentNames', async () => {
    mockProvider.complete.mockResolvedValue({
      content:
        '[{"agentName":"invalidDomain","severity":"high","title":"Test","description":"desc"}, {"agentName":"security","severity":"low","title":"SecTest","description":"desc"}]',
      provider: 'mock-provider',
      model: 'mock-model-v2',
    })

    const agent = new CombinedAnalyzer()
    const ctx: AgentContext = {
      mode: 'standard',
      totalFiles: 1,
      totalChunks: 1,
      projectLanguages: ['typescript'],
    }

    const findings = await agent.analyze([], ctx)

    expect(findings).toHaveLength(1)
    expect(findings[0].agentName).toBe('security')
    expect(findings[0].title).toBe('SecTest')
  })
})
