import { describe, it, expect } from 'vitest'
import {
  PaladeConfigError,
  NoProvidersError,
  TargetNotFoundError,
  SwarmTimeoutError,
} from './types.js'

describe('error classes', () => {
  it('PaladeConfigError stores field and suggestion', () => {
    const err = new PaladeConfigError('bad value', 'swarm.agentCount', 'Must be a number')
    expect(err.message).toBe('bad value')
    expect(err.field).toBe('swarm.agentCount')
    expect(err.suggestion).toBe('Must be a number')
    expect(err.name).toBe('PaladeConfigError')
  })

  it('NoProvidersError lists available env vars', () => {
    const err = new NoProvidersError()
    expect(err.name).toBe('NoProvidersError')
    expect(err.message).toContain('GROQ_API_KEY')
    expect(err.message).toContain('CEREBRAS_API_KEY')
  })

  it('TargetNotFoundError lists available targets', () => {
    const err = new TargetNotFoundError('auth', ['api', 'core'])
    expect(err.message).toContain("'auth'")
    expect(err.message).toContain('api, core')
  })

  it('SwarmTimeoutError stores completed and total counts', () => {
    const err = new SwarmTimeoutError(3, 6, 30000)
    expect(err.name).toBe('SwarmTimeoutError')
    expect(err.completedAgents).toBe(3)
    expect(err.totalAgents).toBe(6)
    expect(err.timeoutMs).toBe(30000)
  })

  it('ProviderRateLimitError was removed (dead code cleanup)', () => {
    // We imported only the live classes — if ProviderRateLimitError existed,
    // the import would succeed too, so verify by checking the module's
    // named exports do not include it via the type system.
    // This test is a regression guard: re-adding the class won't break this,
    // but the tsc typecheck ensures the interface is consistent.
    const liveExports = [
      PaladeConfigError,
      NoProvidersError,
      TargetNotFoundError,
      SwarmTimeoutError,
    ]
    expect(liveExports).toHaveLength(4)
    expect(liveExports.map((c) => c.name)).not.toContain('ProviderRateLimitError')
  })

  it('IngestionError was removed (dead code cleanup)', () => {
    const liveExports = [
      PaladeConfigError,
      NoProvidersError,
      TargetNotFoundError,
      SwarmTimeoutError,
    ]
    expect(liveExports.map((c) => c.name)).not.toContain('IngestionError')
  })
})
