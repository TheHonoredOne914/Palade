import { describe, it, expect } from 'vitest'
import { getAgentsForMode } from './registry.js'

describe('agents/registry', () => {
  describe('getAgentsForMode', () => {
    it('returns all 8 agents for standard mode', () => {
      const agents = getAgentsForMode('standard')
      expect(agents).toHaveLength(8)
      const names = agents.map((a) => a.name).sort()
      expect(names).toEqual([
        'architecture',
        'deadCode',
        'logic',
        'maintainability',
        'performance',
        'pragmatism',
        'security',
        'testIntelligence',
      ])
    })

    it('returns only deadCode for ghost mode when no overrides given', () => {
      const agents = getAgentsForMode('ghost')
      expect(agents).toHaveLength(1)
      expect(agents[0].name).toBe('deadCode')
    })

    it('respects agentOverrides over the mode default', () => {
      // onboard mode config sets [architecture, maintainability]
      const agents = getAgentsForMode('onboard', ['architecture', 'maintainability'])
      expect(agents).toHaveLength(2)
      const names = agents.map((a) => a.name).sort()
      expect(names).toEqual(['architecture', 'maintainability'])
    })

    it('ghost mode honors explicit overrides too', () => {
      const agents = getAgentsForMode('ghost', ['deadCode'])
      expect(agents).toHaveLength(1)
      expect(agents[0].name).toBe('deadCode')
    })

    it('falls back to full registry when overrides reference unknown agents', () => {
      const agents = getAgentsForMode('standard', ['nonexistent' as any])
      expect(agents).toHaveLength(8)
    })

    it('ignores an empty overrides array', () => {
      const agents = getAgentsForMode('standard', [])
      expect(agents).toHaveLength(8)
    })

    it('instantiates custom agents dynamically', () => {
      const customDefs = [
        {
          name: 'myCustomAgent',
          domain: 'customDomain',
          description: 'A custom agent',
          systemPrompt: 'You are a custom agent.',
        },
      ]
      const agents = getAgentsForMode('standard', undefined, customDefs)
      expect(agents).toHaveLength(9)
      expect(agents.some((a) => a.name === 'myCustomAgent')).toBe(true)
    })
  })
})
