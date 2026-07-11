import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { loadConfig, expandProviderShares } from './loader.js'
import * as fs from 'node:fs'

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs')
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  }
})

describe('loader cost-awareness', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    vi.resetAllMocks()
    vi.mocked(fs.existsSync).mockReturnValue(false)
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('defaultSynthesis resolves to opencode-zen when both opencode-zen and groq keys are present', async () => {
    process.env.OPENCODE_ZEN_API_KEY = 'test-key'
    process.env.GROQ_API_KEY = 'test-key-2'

    // Hide .ts config files
    vi.mocked(fs.existsSync).mockReturnValue(false)

    const config = await loadConfig()

    expect(config.swarm.primary).toBe('opencode-zen')
    expect(config.swarm.synthesis).toBe('opencode-zen')
  })
})

describe('expandProviderShares', () => {
  it('assigns shares over agents in registry priority order', () => {
    const out = expandProviderShares({ 'opencode-zen': 5, openrouter: 3 }, 8)
    expect(out).toEqual({
      security: 'opencode-zen',
      architecture: 'opencode-zen',
      performance: 'opencode-zen',
      maintainability: 'opencode-zen',
      deadCode: 'opencode-zen',
      testIntelligence: 'openrouter',
      pragmatism: 'openrouter',
      logic: 'openrouter',
    })
  })

  it('ignores shares beyond agentCount and leaves unshared agents unassigned', () => {
    const out = expandProviderShares({ groq: 2, nvidia: 99 }, 4)
    // only 4 active agents total; groq takes the first 2, nvidia fills the rest
    expect(out).toEqual({
      security: 'groq',
      architecture: 'groq',
      performance: 'nvidia',
      maintainability: 'nvidia',
    })
    const partial = expandProviderShares({ groq: 1 }, 4)
    // agents without a share get no entry → they use swarm.primary
    expect(partial).toEqual({ security: 'groq' })
  })
})
