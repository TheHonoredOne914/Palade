import { describe, it, expect } from 'vitest'
import { DEFAULT_CONFIG } from './defaults.js'

describe('DEFAULT_CONFIG', () => {
  it('should have economyMode set to false by default', () => {
    expect(DEFAULT_CONFIG.swarm?.economyMode).toBe(false)
  })
})
