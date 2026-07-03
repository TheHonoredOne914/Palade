import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { loadConfig } from './loader.js'
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
