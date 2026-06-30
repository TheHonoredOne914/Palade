import { describe, it, expect } from 'vitest'
import { detectConflicts } from './verdict.js'
import type { AgentFinding } from '../agents/base.js'

describe('Conflict Detector', () => {
  it('detects a conflict when agents disagree on the same lines with opposite valences', () => {
    const findings: AgentFinding[] = [
      {
        agentName: 'Security',
        title: 'Missing Rate Limit',
        description: 'You should add a rate limit here to prevent abuse.',
        filePath: 'src/auth.ts',
        lineStart: 10,
        lineEnd: 15,
        severity: 'high',
        tags: []
      },
      {
        agentName: 'Performance',
        title: 'Unnecessary check',
        description: 'Remove this extra logic to speed up the fast-path.',
        filePath: 'src/auth.ts',
        lineStart: 12,
        lineEnd: 12,
        severity: 'medium',
        tags: []
      }
    ]

    const conflicts = detectConflicts(findings)
    expect(conflicts.length).toBe(1)
    expect(conflicts[0].filePath).toBe('src/auth.ts')
    expect(conflicts[0].sideA.agentName).toBe('Security') // has 'add', 'limit'
    expect(conflicts[0].sideB.agentName).toBe('Performance') // has 'remove', 'fast-path'
  })

  it('ignores overlapping findings if they have the same valence', () => {
    const findings: AgentFinding[] = [
      {
        agentName: 'Security',
        title: 'Missing check',
        description: 'Add a check to prevent overflow.',
        filePath: 'src/auth.ts',
        lineStart: 10,
        lineEnd: 15,
        severity: 'high',
        tags: []
      },
      {
        agentName: 'Reliability',
        title: 'Add validation',
        description: 'Ensure boundary limits are checked.',
        filePath: 'src/auth.ts',
        lineStart: 12,
        lineEnd: 12,
        severity: 'medium',
        tags: []
      }
    ]

    const conflicts = detectConflicts(findings)
    expect(conflicts.length).toBe(0) // Both are 'harden'
  })

  it('ignores findings from the same agent', () => {
    const findings: AgentFinding[] = [
      {
        agentName: 'Security',
        title: 'Missing Rate Limit',
        description: 'add rate limit.',
        filePath: 'src/auth.ts',
        lineStart: 10,
        lineEnd: 15,
        severity: 'high',
        tags: []
      },
      {
        agentName: 'Security',
        title: 'Unnecessary check',
        description: 'remove extra check.',
        filePath: 'src/auth.ts',
        lineStart: 12,
        lineEnd: 12,
        severity: 'medium',
        tags: []
      }
    ]

    const conflicts = detectConflicts(findings)
    expect(conflicts.length).toBe(0)
  })

  it('ignores opposite findings if they are on completely different files', () => {
    const findings: AgentFinding[] = [
      {
        agentName: 'Security',
        title: 'Missing Rate Limit',
        description: 'add rate limit.',
        filePath: 'src/auth.ts',
        lineStart: 10,
        lineEnd: 15,
        severity: 'high',
        tags: []
      },
      {
        agentName: 'Performance',
        title: 'Unnecessary check',
        description: 'remove extra check.',
        filePath: 'src/other.ts', // Different file
        lineStart: 12,
        lineEnd: 12,
        severity: 'medium',
        tags: []
      }
    ]

    const conflicts = detectConflicts(findings)
    expect(conflicts.length).toBe(0)
  })

  it('detects adjacent findings within 5 lines', () => {
    const findings: AgentFinding[] = [
      {
        agentName: 'Security',
        title: 'Missing Rate Limit',
        description: 'add rate limit.',
        filePath: 'src/auth.ts',
        lineStart: 10,
        lineEnd: 15,
        severity: 'high',
        tags: []
      },
      {
        agentName: 'Performance',
        title: 'Unnecessary logic',
        description: 'remove extra logic.',
        filePath: 'src/auth.ts',
        lineStart: 18,
        lineEnd: 20,
        severity: 'medium',
        tags: []
      }
    ]

    const conflicts = detectConflicts(findings)
    expect(conflicts.length).toBe(1)
  })
})
