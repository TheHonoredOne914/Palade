import { describe, it, expect } from 'vitest'
import {
  CombinedAnalyzer,
  attributeFindings,
  DEFAULT_DOMAINS,
  type DomainSpec,
} from './combined.js'
import type { AgentFinding } from './base.js'
import { SEVERITY_PENALTY } from './base.js'

function makeFinding(agentName: string, severity: AgentFinding['severity']): AgentFinding {
  return {
    id: `${agentName}-${severity}-${Math.random()}`,
    agentName: agentName as AgentFinding['agentName'],
    severity,
    title: 'x',
    description: '',
    tags: [],
    // parseFindingsResponse sets this; attributeFindings overwrites it.
    scorePenalty: SEVERITY_PENALTY[severity],
  }
}

describe('agents/combined — buildCombinedSystemPrompt (via class)', () => {
  it('exposes all six default domains and tags them with agentName', () => {
    const analyzer = new CombinedAnalyzer()
    // The default domain set must cover the six built-in agent names so economy
    // mode produces findings attributable to every category the scorer expects.
    expect(DEFAULT_DOMAINS.map((d) => d.name).sort()).toEqual([
      'architecture',
      'deadCode',
      'maintainability',
      'performance',
      'security',
      'testIntelligence',
    ])
    expect(analyzer.name).toBe('combined')
    expect(analyzer.domain).toBe('combined')
  })

  it('accepts a custom domain subset', () => {
    const subset: DomainSpec[] = [
      { name: 'security', label: 'Security', focus: 'secrets' },
    ]
    const analyzer = new CombinedAnalyzer(subset)
    // Internal domains field is reflected through attributeFindings behavior
    // (only the security name is valid) below.
    const out = attributeFindings(
      [makeFinding('security', 'high'), makeFinding('performance', 'high')],
      subset
    )
    expect(out.map((f) => f.agentName)).toEqual(['security'])
  })
})

describe('agents/combined — attributeFindings', () => {
  it('keeps findings whose agentName is in the domain set', () => {
    const findings = [
      makeFinding('security', 'critical'),
      makeFinding('architecture', 'high'),
    ]
    const out = attributeFindings(findings, DEFAULT_DOMAINS, 'groq', 'llama')
    expect(out).toHaveLength(2)
    expect(out.map((f) => f.provider)).toEqual(['groq', 'groq'])
    expect(out.map((f) => f.model)).toEqual(['llama', 'llama'])
  })

  it('drops findings with an agentName not in the domain set (misattribution guard)', () => {
    // If the model omits agentName or invents one, the finding must not be
    // filed under a wrong domain — that would distort the category breakdown.
    const findings = [
      makeFinding('security', 'high'),
      makeFinding('totally-fake', 'high'),
    ]
    const out = attributeFindings(findings, DEFAULT_DOMAINS)
    expect(out).toHaveLength(1)
    expect(out[0].agentName).toBe('security')
  })

  it('applies SEVERITY_PENALTY to each attributed finding', () => {
    const out = attributeFindings(
      [makeFinding('performance', 'critical'), makeFinding('deadCode', 'low')],
      DEFAULT_DOMAINS
    )
    expect(out[0].scorePenalty).toBe(SEVERITY_PENALTY.critical)
    expect(out[1].scorePenalty).toBe(SEVERITY_PENALTY.low)
  })

  it('returns [] when no findings match a domain', () => {
    const out = attributeFindings(
      [makeFinding('nope', 'high')],
      DEFAULT_DOMAINS
    )
    expect(out).toEqual([])
  })
})
