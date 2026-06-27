import { describe, it, expect } from 'vitest'
import {
  calculateScore,
  calculateCategoryScore,
  calculateTotalPenalty,
  calculateCrossAgentPenalty,
} from './calculator.js'
import type { AgentFinding, Severity } from '../agents/base.js'
import { SEVERITY_PENALTY } from '../agents/base.js'
import type { CrossAgentFinding } from '../orchestrator/types.js'

/**
 * Build a finding as a built-in specialist would produce it: scorePenalty is
 * whatever parseFindingsResponse sets (the default severity weight). Passing
 * undefined here mirrors a finding that never had an override applied.
 */
function finding(
  agentName: AgentFinding['agentName'],
  severity: AgentFinding['severity'],
  filePath = 'src/a.ts'
): AgentFinding {
  return {
    id: `${agentName}-${severity}-${Math.random()}`,
    agentName,
    severity,
    title: 'x',
    description: '',
    filePath,
    tags: [],
    scorePenalty: SEVERITY_PENALTY[severity as Severity],
  }
}

describe('scorer/calculator', () => {
  describe('calculateTotalPenalty', () => {
    it('sums severity weights across all findings', () => {
      const findings = [
        finding('security', 'critical'),
        finding('security', 'high'),
        finding('architecture', 'medium'),
      ]
      // critical 10 + high 5 + medium 2 = 17
      expect(calculateTotalPenalty(findings)).toBe(17)
    })

    it('is zero for info-only findings', () => {
      expect(calculateTotalPenalty([finding('security', 'info')])).toBe(0)
    })

    it('honors an explicit custom scorePenalty override (M1 regression)', () => {
      // A custom agent configured with severityPenalty { critical: 50 } sets
      // scorePenalty: 50 on its critical findings. The scorer must use 50, not
      // the default critical weight of 10.
      const custom = {
        ...finding('api-design' as AgentFinding['agentName'], 'critical'),
        scorePenalty: 50,
      }
      expect(calculateTotalPenalty([custom])).toBe(50)
    })

    it('falls back to severity weight when scorePenalty is unset', () => {
      // A finding with scorePenalty left undefined (e.g. constructed by hand)
      // must fall back to the severity-based weight, not contribute 0.
      const noPenalty: AgentFinding = {
        ...finding('security', 'high'),
        scorePenalty: undefined,
      }
      expect(calculateTotalPenalty([noPenalty])).toBe(SEVERITY_PENALTY.high)
    })
  })

  describe('calculateCategoryScore', () => {
    it('only penalizes the requested category', () => {
      const findings = [finding('security', 'critical'), finding('architecture', 'critical')]
      const sec = calculateCategoryScore(findings, 'security')
      const arch = calculateCategoryScore(findings, 'architecture')
      expect(sec.score).toBe(90) // 100 - 10
      expect(arch.score).toBe(90)
      expect(sec.findingCount).toBe(1)
      expect(sec.criticalCount).toBe(1)
    })

    it('floors at 10 for extreme penalties', () => {
      const findings = Array.from({ length: 15 }, () => finding('security', 'critical'))
      expect(calculateCategoryScore(findings, 'security').score).toBe(10)
    })

    it('scores 100 with no findings', () => {
      expect(calculateCategoryScore([], 'security').score).toBe(100)
    })
  })

  describe('calculateCrossAgentPenalty', () => {
    it('weights critical > high > medium', () => {
      const cross: CrossAgentFinding[] = [
        {
          title: '',
          description: '',
          agents: [],
          filePaths: [],
          severity: 'critical',
          blastRadius: 1,
        },
        { title: '', description: '', agents: [], filePaths: [], severity: 'high', blastRadius: 1 },
        {
          title: '',
          description: '',
          agents: [],
          filePaths: [],
          severity: 'medium',
          blastRadius: 1,
        },
      ]
      // 15 + 8 + 4 = 27
      expect(calculateCrossAgentPenalty(cross)).toBe(27)
    })
  })

  describe('calculateScore', () => {
    it('computes total, breakdown, and delta vs previous', () => {
      const result = calculateScore(
        [finding('security', 'high'), finding('performance', 'medium')],
        [],
        90
      )
      // Blended: 60% avg-category (98.83) + 40% penalty-score (93) = 96.5 -> 97
      expect(result.score).toBe(97)
      expect(result.delta).toBe(7) // 97 - 90
      expect(result.previousScore).toBe(90)
      expect(result.breakdown.findingCount).toBe(2)
      expect(result.breakdown.categories).toHaveLength(6)
    })

    it('delta is 0 when no previous score', () => {
      const result = calculateScore([], [], null)
      expect(result.score).toBe(100)
      expect(result.delta).toBe(0)
    })
  })
})
