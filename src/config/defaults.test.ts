import { describe, it, expect } from 'vitest'
import { DEFAULT_CONFIG } from './defaults.js'

describe('DEFAULT_CONFIG', () => {
  it('should have economyMode set to true by default', () => {
    expect(DEFAULT_CONFIG.swarm?.economyMode).toBe(true)
  })
})
