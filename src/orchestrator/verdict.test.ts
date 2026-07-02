import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Capture prompts sent to the router so tests can assert the drift check ran.
const completeMock = vi.fn(async () => 'NO')

vi.mock('../providers/router.js', () => ({
  getRouter: () => ({ complete: completeMock }),
}))

import {
  detectConflicts,
  saveDecision,
  checkDecisionDrift,
  type Conflict,
  type Verdict,
} from './verdict.js'
import type { AgentFinding } from '../agents/base.js'
import type { ChangedFile } from '../diff/types.js'

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

// Regression tests for the decision-drift parsing bugs: previously the diff was
// split on the literal string '\\n' and the hunk / **File:** regexes were
// double-escaped, so drift was never detected. These feed real multi-line
// strings and assert the added-line map and **File:** line are parsed.
describe('Decision Drift', () => {
  const conflict: Conflict = {
    filePath: 'src/auth.ts',
    lineStart: 10,
    lineEnd: 12,
    sideA: {
      id: 'a',
      agentName: 'Security',
      severity: 'high',
      title: 'harden it',
      description: 'add validation',
      tags: [],
      scorePenalty: 0,
    },
    sideB: {
      id: 'b',
      agentName: 'Performance',
      severity: 'medium',
      title: 'relax it',
      description: 'remove validation',
      tags: [],
      scorePenalty: 0,
    },
  }

  const verdict: Verdict = {
    decision: 'Keep the validation.',
    tradeoff_accepted: 'Slightly slower.',
    confidence: 90,
    losing_side: 'Performance',
  }

  let projectRoot: string

  beforeEach(async () => {
    completeMock.mockClear()
    completeMock.mockResolvedValue('NO')
    projectRoot = await mkdtemp(join(tmpdir(), 'palade-verdict-'))
  })

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true })
  })

  it('saveDecision writes a **File:** line that checkDecisionDrift parses, and detects overlap', async () => {
    await saveDecision(projectRoot, conflict, verdict)

    const dir = join(projectRoot, '.palade', 'decisions')
    const files = await readdir(dir)
    expect(files).toHaveLength(1)

    // Added line lands at HEAD line 11 (context line 10, then +) which overlaps
    // the decision range 10-12. With the pre-fix double-escaped regexes the
    // **File:** line would not parse and the diff would not split, so no overlap
    // would be found and the router would never be consulted.
    const changed: ChangedFile[] = [
      {
        path: 'src/auth.ts',
        status: 'modified',
        additions: 1,
        deletions: 0,
        diff: [
          '--- a/src/auth.ts',
          '+++ b/src/auth.ts',
          '@@ -10,2 +10,3 @@',
          ' const a = 1',
          '+const b = 2',
          ' const c = 3',
        ].join('\n'),
      },
    ]

    await checkDecisionDrift(projectRoot, changed)
    expect(completeMock).toHaveBeenCalledTimes(1)
  })

  it('emits a warning when the drift check returns YES', async () => {
    completeMock.mockResolvedValue('YES')
    await saveDecision(projectRoot, conflict, verdict)

    const changed: ChangedFile[] = [
      {
        path: 'src/auth.ts',
        status: 'modified',
        additions: 1,
        deletions: 0,
        diff: '@@ -10,1 +10,2 @@\n const a = 1\n+const b = 2',
      },
    ]

    const warnings = await checkDecisionDrift(projectRoot, changed)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('documented decision')
  })

  it('does not invoke the drift check when added lines fall outside the decision range', async () => {
    await saveDecision(projectRoot, conflict, verdict)

    const changed: ChangedFile[] = [
      {
        path: 'src/auth.ts',
        status: 'modified',
        additions: 1,
        deletions: 0,
        diff: '@@ -100,1 +100,2 @@\n const a = 1\n+const b = 2',
      },
    ]

    const warnings = await checkDecisionDrift(projectRoot, changed)
    expect(completeMock).not.toHaveBeenCalled()
    expect(warnings).toHaveLength(0)
  })
})
