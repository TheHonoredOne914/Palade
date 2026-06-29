import { describe, it, expect } from 'vitest'
import { parseFindingsResponse, SEVERITY_PENALTY } from './base.js'
import type { AgentName } from './base.js'

const AGENT: AgentName = 'security'

describe('parseFindingsResponse', () => {
  it('parses a clean JSON array with correct fields', () => {
    const raw =
      '[{"severity":"high","title":"SQL injection","description":"Bad query","filePath":"a.ts"}]'
    const findings = parseFindingsResponse(raw, AGENT)

    expect(findings).toHaveLength(1)
    const f = findings[0]
    expect(f.severity).toBe('high')
    expect(f.title).toBe('SQL injection')
    expect(f.description).toBe('Bad query')
    expect(f.filePath).toBe('a.ts')
    expect(f.agentName).toBe(AGENT)
    expect(typeof f.id).toBe('string')
    expect(f.tags).toEqual([])
    expect(f.scorePenalty).toBe(SEVERITY_PENALTY.high)
  })

  it('strips markdown code blocks and parses the JSON inside', () => {
    const raw = '```json\n[{"severity":"medium","title":"test","description":"d"}]\n```'
    const findings = parseFindingsResponse(raw, AGENT)

    expect(findings).toHaveLength(1)
    expect(findings[0].severity).toBe('medium')
    expect(findings[0].title).toBe('test')
  })

  it('extracts JSON array when preceded by leading text', () => {
    const raw = 'Here are findings:\n[{"severity":"low","title":"t","description":"d"}]'
    const findings = parseFindingsResponse(raw, AGENT)

    expect(findings).toHaveLength(1)
    expect(findings[0].severity).toBe('low')
    expect(findings[0].title).toBe('t')
  })

  it('returns empty array for an empty string', () => {
    expect(parseFindingsResponse('', AGENT)).toEqual([])
  })

  it('returns empty array for garbage text with no JSON', () => {
    expect(parseFindingsResponse('This is not JSON at all.', AGENT)).toEqual([])
  })

  it('returns empty array when JSON is an object, not an array', () => {
    const raw = '{"severity":"high","title":"test"}'
    expect(parseFindingsResponse(raw, AGENT)).toEqual([])
  })

  it('returns empty array when severity is not in SEVERITY_PENALTY', () => {
    const raw = '[{"severity":"ultra","title":"t","description":"d"}]'
    const findings = parseFindingsResponse(raw, AGENT)

    expect(findings).toEqual([])
  })

  it('skips items that are missing the required title field', () => {
    const raw = '[{"severity":"high","description":"d"}]'
    const findings = parseFindingsResponse(raw, AGENT)

    expect(findings).toEqual([])
  })

  it('keeps valid findings and skips invalid ones in a mixed array', () => {
    const raw = JSON.stringify([
      { severity: 'high', title: 'Valid', description: 'ok' },
      { severity: 'high', description: 'missing title' },
    ])
    const findings = parseFindingsResponse(raw, AGENT)

    expect(findings).toHaveLength(1)
    expect(findings[0].title).toBe('Valid')
  })

  it('assigns correct scorePenalty for each severity level', () => {
    const raw = JSON.stringify([
      { severity: 'critical', title: 'c', description: '' },
      { severity: 'high', title: 'h', description: '' },
      { severity: 'medium', title: 'm', description: '' },
    ])
    const findings = parseFindingsResponse(raw, AGENT)

    expect(findings).toHaveLength(3)
    expect(findings[0].scorePenalty).toBe(10)
    expect(findings[1].scorePenalty).toBe(5)
  })
})

import { buildSystemPrompt } from './base.js'
import type { AgentContext } from './base.js'

describe('buildSystemPrompt', () => {
  const baseContext: AgentContext = {
    projectLanguages: [],
    totalFiles: 10,
    totalChunks: 10,
    mode: 'standard',
  }

  it('returns base prompt if no modifiers are present', () => {
    const res = buildSystemPrompt('Base', baseContext)
    expect(res).toBe('Base')
  })

  it('appends diff context', () => {
    const ctx: AgentContext = {
      ...baseContext,
      diffContext: { headBranch: 'feat', baseBranch: 'main', changedFiles: [{ path: 'a.ts', status: 'modified', additions: 1, deletions: 1 }] }
    }
    const res = buildSystemPrompt('Base', ctx)
    expect(res).toContain('DIFF CONTEXT: This is a diff review of branch \'feat\' vs \'main\'')
  })

  it('appends target description', () => {
    const ctx: AgentContext = { ...baseContext, targetDescription: 'some feature' }
    const res = buildSystemPrompt('Base', ctx)
    expect(res).toContain('SUBSYSTEM CONTEXT: some feature')
  })

  it('appends target focus', () => {
    const ctx: AgentContext = { ...baseContext, targetFocus: ['auth', 'api'] }
    const res = buildSystemPrompt('Base', ctx)
    expect(res).toContain('FOCUS AREAS: auth, api')
  })

  it('appends mode suffix', () => {
    const res = buildSystemPrompt('Base', baseContext, { systemPromptSuffix: 'Strict mode' })
    expect(res).toContain('Strict mode')
  })

  it('appends review requests', () => {
    const ctx: AgentContext = {
      ...baseContext,
      annotations: {
        reviewRequests: [{ filePath: 'a.ts', line: 10, reason: 'check this' }],
        focusRequests: [],
        ignoredFiles: [],
        ignoredLines: []
      }
    }
    const res = buildSystemPrompt('Base', ctx)
    expect(res).toContain('DEVELOPER REVIEW REQUESTS')
    expect(res).toContain('a.ts:10 — "check this"')
  })
})

