import { describe, it, expect } from 'vitest'
import { CustomAgentDefinitionSchema } from './schema.js'
import type { CustomAgentDefinition } from './schema.js'

describe('agents/custom/schema', () => {
  it('accepts a valid custom agent definition', () => {
    const result = CustomAgentDefinitionSchema.safeParse({
      name: 'api-design',
      domain: 'API Design',
      systemPrompt: 'You are an API design reviewer. Check for consistency.',
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty name', () => {
    const result = CustomAgentDefinitionSchema.safeParse({
      name: '',
      domain: 'API Design',
      systemPrompt: 'Review APIs.',
    })
    expect(result.success).toBe(false)
  })

  it('rejects built-in agent names', () => {
    for (const name of [
      'security',
      'architecture',
      'performance',
      'maintainability',
      'deadCode',
      'testIntelligence',
    ]) {
      const result = CustomAgentDefinitionSchema.safeParse({
        name,
        domain: 'Test',
        systemPrompt: 'Test prompt.',
      })
      expect(result.success).toBe(false)
    }
  })

  it('rejects empty systemPrompt', () => {
    const result = CustomAgentDefinitionSchema.safeParse({
      name: 'api-design',
      domain: 'API Design',
      systemPrompt: '',
    })
    expect(result.success).toBe(false)
  })

  it('rejects empty domain', () => {
    const result = CustomAgentDefinitionSchema.safeParse({
      name: 'api-design',
      domain: '',
      systemPrompt: 'Review APIs.',
    })
    expect(result.success).toBe(false)
  })

  it('accepts optional severityPenalty overrides', () => {
    const result = CustomAgentDefinitionSchema.safeParse({
      name: 'api-design',
      domain: 'API Design',
      systemPrompt: 'Review APIs.',
      severityPenalty: { critical: 20, high: 10 },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.severityPenalty?.critical).toBe(20)
      expect(result.data.severityPenalty?.high).toBe(10)
      expect(result.data.severityPenalty?.medium).toBeUndefined()
    }
  })

  it('rejects negative severityPenalty values', () => {
    const result = CustomAgentDefinitionSchema.safeParse({
      name: 'api-design',
      domain: 'API Design',
      systemPrompt: 'Review APIs.',
      severityPenalty: { critical: -1 },
    })
    expect(result.success).toBe(false)
  })
})

describe('CustomAgent', () => {
  it('applies default SEVERITY_PENALTY when no overrides given', async () => {
    const { CustomAgent } = await import('./agent.js')
    const agent = new CustomAgent({
      name: 'test-agent',
      domain: 'testing',
      systemPrompt: 'Test prompt.',
    })
    expect(agent.getScorePenalty('critical')).toBe(10)
    expect(agent.getScorePenalty('high')).toBe(5)
    expect(agent.getScorePenalty('medium')).toBe(2)
    expect(agent.getScorePenalty('low')).toBe(0.5)
    expect(agent.getScorePenalty('info')).toBe(0)
  })

  it('applies custom severityPenalty overrides', async () => {
    const { CustomAgent } = await import('./agent.js')
    const agent = new CustomAgent({
      name: 'test-agent',
      domain: 'testing',
      systemPrompt: 'Test prompt.',
      severityPenalty: { critical: 50, medium: 1 },
    })
    expect(agent.getScorePenalty('critical')).toBe(50)
    expect(agent.getScorePenalty('high')).toBe(5) // default
    expect(agent.getScorePenalty('medium')).toBe(1)
    expect(agent.getScorePenalty('low')).toBe(0.5) // default
  })
})
