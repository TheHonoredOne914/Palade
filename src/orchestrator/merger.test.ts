import { describe, it, expect } from 'vitest'
import { mergeFindings, groupBySeverity } from './merger.js'
import type { AgentFinding } from '../agents/base.js'

let counter = 0
function finding(overrides: Partial<AgentFinding> & Pick<AgentFinding, 'severity'>): AgentFinding {
  counter++
  return {
    id: `id-${counter}`,
    agentName: 'security',
    title: 'SQL injection',
    description: 'short',
    tags: [],
    scorePenalty: 0,
    ...overrides,
  }
}

describe('orchestrator/merger', () => {
  describe('mergeFindings', () => {
    it('merges same-file, same-line, similar-title findings', () => {
      const a = finding({
        severity: 'high',
        filePath: 'src/auth.ts',
        lineStart: 10,
        title: 'SQL injection in getUserById',
      })
      const b = finding({
        severity: 'critical',
        filePath: 'src/auth.ts',
        lineStart: 10,
        title: 'SQL injection risk in getUserById',
      })
      const merged = mergeFindings([a, b])
      // Jaccard similarity > 0.4 -> merged into one
      expect(merged).toHaveLength(1)
      // keeps the more severe (critical)
      expect(merged[0].severity).toBe('critical')
    })

    it('does not merge unrelated titles with similar character sets', () => {
      const a = finding({
        severity: 'high',
        filePath: 'src/auth.ts',
        lineStart: 10,
        title: 'Hardcoded API key in config file',
        agentName: 'security',
      })
      const b = finding({
        severity: 'high',
        filePath: 'src/auth.ts',
        lineStart: 10,
        title: 'Inefficient nested loop over large array',
        agentName: 'performance',
      })
      const merged = mergeFindings([a, b])
      // Although character sets overlap, words do not
      expect(merged).toHaveLength(2)
    })

    it('does not merge cross-agent same-line findings below the cross-agent threshold', () => {
      // Jaccard(a.title, b.title) = 4/6 ≈ 0.667 — above the old flat 0.4 bar
      // the same-line branch used to apply regardless of agent (a bug: it
      // bypassed the stricter 0.7 cross-agent threshold isNearMatch enforces
      // for every other pair), but below the correct 0.7 cross-agent bar.
      const a = finding({
        severity: 'high',
        filePath: 'src/auth.ts',
        lineStart: 10,
        title: 'alpha beta gamma delta epsilon',
        agentName: 'security',
      })
      const b = finding({
        severity: 'high',
        filePath: 'src/auth.ts',
        lineStart: 10,
        title: 'alpha beta gamma delta zeta',
        agentName: 'architecture',
      })
      const merged = mergeFindings([a, b])
      expect(merged).toHaveLength(2)
    })

    it('still merges same-agent same-line findings above the same-agent threshold', () => {
      const a = finding({
        severity: 'high',
        filePath: 'src/auth.ts',
        lineStart: 10,
        title: 'alpha beta gamma delta epsilon',
        agentName: 'security',
      })
      const b = finding({
        severity: 'high',
        filePath: 'src/auth.ts',
        lineStart: 10,
        title: 'alpha beta gamma delta zeta',
        agentName: 'security',
      })
      const merged = mergeFindings([a, b])
      expect(merged).toHaveLength(1)
    })

    it('keeps findings on different files separate', () => {
      const out = mergeFindings([
        finding({ severity: 'high', filePath: 'src/a.ts', lineStart: 1 }),
        finding({ severity: 'high', filePath: 'src/b.ts', lineStart: 1 }),
      ])
      expect(out).toHaveLength(2)
    })

    it('sorts output by severity (critical first)', () => {
      // Distinct, unrelated titles — the default 'SQL injection' title would
      // make these three fileless findings jaccard-match each other and
      // merge into one now that genuinely fileless findings are correctly
      // compared against each other (orchestrator-004), which isn't what
      // this test is checking.
      const out = mergeFindings([
        finding({
          severity: 'low',
          title: 'Unused variable in config loader',
          description: 'a dead local variable is declared but never read',
        }),
        finding({
          severity: 'critical',
          title: 'SQL injection in getUserById',
          description: 'user input is concatenated directly into a SQL query string',
        }),
        finding({
          severity: 'medium',
          title: 'Inefficient nested loop over large array',
          description: 'a quadratic loop iterates the same collection twice per element',
        }),
      ])
      expect(out.map((f) => f.severity)).toEqual(['critical', 'medium', 'low'])
    })

    it('passes through an empty list', () => {
      expect(mergeFindings([])).toEqual([])
    })
  })

  describe('groupBySeverity', () => {
    it('buckets every severity including info', () => {
      const groups = groupBySeverity([
        finding({ severity: 'critical' }),
        finding({ severity: 'high' }),
        finding({ severity: 'medium' }),
        finding({ severity: 'low' }),
        finding({ severity: 'info' }),
      ])
      expect(groups.critical).toHaveLength(1)
      expect(groups.high).toHaveLength(1)
      expect(groups.medium).toHaveLength(1)
      expect(groups.low).toHaveLength(1)
      expect(groups.info).toHaveLength(1)
    })
  })
})
