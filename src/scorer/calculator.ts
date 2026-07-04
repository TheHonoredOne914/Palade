import type { AgentFinding } from '../agents/base.js'
import { SEVERITY_PENALTY } from '../agents/base.js'
import type { CrossAgentFinding } from '../orchestrator/types.js'
import type { ScoreCategory, CategoryScore, ScoreBreakdown, ScoreResult } from './types.js'

/**
 * Per-finding penalty. Honors an explicit `scorePenalty` when the producing
 * agent set one (custom agents with severityPenalty overrides), and falls back
 * to the severity-based weight for built-in findings, which never set it.
 *
 * Previously this read SEVERITY_WEIGHTS[f.severity] unconditionally, which made
 * CustomAgent's per-severity override feature dead code — an agent configured
 * with { critical: 50 } still got penalized at 10.
 */
function penaltyFor(f: AgentFinding): number {
  return typeof f.scorePenalty === 'number' ? f.scorePenalty : SEVERITY_PENALTY[f.severity]
}

export function countBySeverity(
  findings: AgentFinding[],
  agentName: string
): { total: number; critical: number; high: number } {
  let total = 0
  let critical = 0
  let high = 0

  for (const f of findings) {
    if (f.agentName === agentName) {
      total++
      if (f.severity === 'critical') critical++
      if (f.severity === 'high') high++
    }
  }

  return { total, critical, high }
}

export function calculateCategoryScore(
  findings: AgentFinding[],
  category: ScoreCategory
): CategoryScore {
  const agentName = category
  const { total, critical, high } = countBySeverity(findings, agentName)

  let penalty = 0
  for (const f of findings) {
    if (f.agentName === agentName) {
      let fPenalty = penaltyFor(f)
      if (agentName === 'maintainability' && typeof f.complexity === 'number') {
        if (f.complexity < 5)
          fPenalty *= 0.5 // simple function, minor maintainability issue
        else if (f.complexity > 20) fPenalty *= 1.5 // complex function, major maintainability issue
      }
      penalty += fPenalty
    }
  }

  // Cap category penalty at 90 so a single category can't zero out the score
  const cappedPenalty = Math.min(penalty, 90)
  const score = Math.max(10, Math.round(100 - cappedPenalty))

  return {
    category,
    score,
    findingCount: total,
    criticalCount: critical,
    highCount: high,
  }
}

export function calculateTotalPenalty(findings: AgentFinding[]): number {
  let penalty = 0
  for (const f of findings) {
    penalty += penaltyFor(f)
  }
  return penalty
}

export function calculateCrossAgentPenalty(crossFindings: CrossAgentFinding[]): number {
  let penalty = 0
  for (const cf of crossFindings) {
    let base = 0
    if (cf.severity === 'critical') base = 15
    else if (cf.severity === 'high') base = 8
    else if (cf.severity === 'medium') base = 4
    // Scale by blast radius (files/scope affected) so a conflict touching many
    // files scores worse than one touching a single file, with diminishing
    // returns via log2 so a huge blast radius doesn't blow up the score.
    const blastMultiplier = Math.min(1 + Math.log2(cf.blastRadius || 1) * 0.2, 3)
    penalty += base * blastMultiplier
  }
  return penalty
}

export function calculateScore(
  findings: AgentFinding[],
  crossAgentFindings: CrossAgentFinding[],
  previousScore: number | null = null
): ScoreResult {
  const baseCategories: ScoreCategory[] = [
    'security',
    'architecture',
    'performance',
    'maintainability',
    'deadCode',
    'testIntelligence',
  ]

  const uniqueAgents = Array.from(new Set(findings.map((f) => f.agentName)))
  const categories = Array.from(new Set([...baseCategories, ...uniqueAgents]))

  const categoryScores = categories.map((cat) => calculateCategoryScore(findings, cat))

  const findingPenalty = calculateTotalPenalty(findings)
  const crossAgentPenalty = calculateCrossAgentPenalty(crossAgentFindings)
  const totalPenalty = findingPenalty + crossAgentPenalty
  // Average category scores for a balanced overall score
  const avgCategoryScore =
    categoryScores.reduce((sum, c) => sum + c.score, 0) / categoryScores.length
  // Blend: 60% average category score, 40% penalty-based score
  const penaltyScore = Math.max(5, Math.round(100 - Math.min(totalPenalty, 95)))
  const total = Math.round(avgCategoryScore * 0.6 + penaltyScore * 0.4)

  const breakdown: ScoreBreakdown = {
    total,
    categories: categoryScores,
    findingCount: findings.length,
    crossAgentCount: crossAgentFindings.length,
  }

  const delta = previousScore !== null ? total - previousScore : 0

  return {
    score: total,
    breakdown,
    previousScore,
    delta,
  }
}
