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
    expect(err.message).toBe('Swarm timed out after 30000ms. 3/6 agents completed.')
    expect(err.completedAgents).toBe(3)
    expect(err.totalAgents).toBe(6)
    expect(err.timeoutMs).toBe(30000)
  })

})
