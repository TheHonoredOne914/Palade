import type { AgentFinding, Severity } from '../agents/base.js'
import { SEVERITY_PENALTY } from '../agents/base.js'
import type { CrossAgentFinding } from '../orchestrator/types.js'
import type { ScoreCategory, CategoryScore, ScoreBreakdown, ScoreResult } from './types.js'

// Floors/caps are intentionally asymmetric: a single category is allowed to
// sink further (floor 10, cap 90) than the blended overall score (floor 5,
// cap 95), so one bad category can hurt the total without a single agent
// being able to zero it out entirely.
const CATEGORY_SCORE_FLOOR = 10
const CATEGORY_PENALTY_CAP = 90
const TOTAL_SCORE_FLOOR = 5
const TOTAL_PENALTY_CAP = 95

/** Per-severity penalty weights, overridable via `config.score.severityWeights`. */
export type SeverityWeights = Record<Severity, number>

/** Base per-conflict penalty weights, overridable via `config.score.crossAgentPenalty`. */
export interface CrossAgentPenaltyWeights {
  critical: number
  high: number
  medium: number
}

export const DEFAULT_CROSS_AGENT_PENALTY_WEIGHTS: CrossAgentPenaltyWeights = {
  critical: 15,
  high: 8,
  medium: 4,
}

/**
 * Per-finding penalty. Honors an explicit `scorePenalty` when the producing
 * agent set one (custom agents with severityPenalty overrides), and falls back
 * to the severity-based weight for built-in findings, which never set it.
 *
 * Previously this read SEVERITY_WEIGHTS[f.severity] unconditionally, which made
 * CustomAgent's per-severity override feature dead code — an agent configured
 * with { critical: 50 } still got penalized at 10.
 */
function penaltyFor(f: AgentFinding, severityWeights: SeverityWeights = SEVERITY_PENALTY): number {
  return typeof f.scorePenalty === 'number' ? f.scorePenalty : severityWeights[f.severity]
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
  category: ScoreCategory,
  severityWeights: SeverityWeights = SEVERITY_PENALTY
): CategoryScore {
  const agentName = category
  const { total, critical, high } = countBySeverity(findings, agentName)

  let penalty = 0
  for (const f of findings) {
    if (f.agentName === agentName) {
      let fPenalty = penaltyFor(f, severityWeights)
      if (agentName === 'maintainability' && typeof f.complexity === 'number') {
        if (f.complexity < 5)
          fPenalty *= 0.5 // simple function, minor maintainability issue
        else if (f.complexity > 20) fPenalty *= 1.5 // complex function, major maintainability issue
      }
      penalty += fPenalty
    }
  }

  // Cap category penalty so a single category can't zero out the score
  const cappedPenalty = Math.min(penalty, CATEGORY_PENALTY_CAP)
  const score = Math.max(CATEGORY_SCORE_FLOOR, Math.round(100 - cappedPenalty))

  return {
    category,
    score,
    findingCount: total,
    criticalCount: critical,
    highCount: high,
  }
}

export function calculateTotalPenalty(
  findings: AgentFinding[],
  severityWeights: SeverityWeights = SEVERITY_PENALTY
): number {
  let penalty = 0
  for (const f of findings) {
    penalty += penaltyFor(f, severityWeights)
  }
  return penalty
}

export function calculateCrossAgentPenalty(
  crossFindings: CrossAgentFinding[],
  weights: CrossAgentPenaltyWeights = DEFAULT_CROSS_AGENT_PENALTY_WEIGHTS
): number {
  let penalty = 0
  for (const cf of crossFindings) {
    let base = 0
    if (cf.severity === 'critical') base = weights.critical
    else if (cf.severity === 'high') base = weights.high
    else if (cf.severity === 'medium') base = weights.medium
    // Scale by blast radius (files/scope affected) so a conflict touching many
    // files scores worse than one touching a single file, with diminishing
    // returns via log2 so a huge blast radius doesn't blow up the score.
    const blastMultiplier = Math.min(1 + Math.log2(cf.blastRadius || 1) * 0.2, 3)
    penalty += base * blastMultiplier
  }
  return penalty
}

export interface ScoreWeightsConfig {
  severityWeights?: Partial<SeverityWeights>
  crossAgentPenalty?: Partial<CrossAgentPenaltyWeights>
}

export function calculateScore(
  findings: AgentFinding[],
  crossAgentFindings: CrossAgentFinding[],
  previousScore: number | null = null,
  scoreConfig?: ScoreWeightsConfig
): ScoreResult {
  const severityWeights: SeverityWeights = {
    ...SEVERITY_PENALTY,
    ...scoreConfig?.severityWeights,
  }
  const crossAgentWeights: CrossAgentPenaltyWeights = {
    ...DEFAULT_CROSS_AGENT_PENALTY_WEIGHTS,
    ...scoreConfig?.crossAgentPenalty,
  }

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

  const categoryScores = categories.map((cat) =>
    calculateCategoryScore(findings, cat, severityWeights)
  )

  const findingPenalty = calculateTotalPenalty(findings, severityWeights)
  const crossAgentPenalty = calculateCrossAgentPenalty(crossAgentFindings, crossAgentWeights)
  const totalPenalty = findingPenalty + crossAgentPenalty
  // Average category scores for a balanced overall score
  const avgCategoryScore =
    categoryScores.reduce((sum, c) => sum + c.score, 0) / categoryScores.length
  // Blend: 60% average category score, 40% penalty-based score
  const penaltyScore = Math.max(
    TOTAL_SCORE_FLOOR,
    Math.round(100 - Math.min(totalPenalty, TOTAL_PENALTY_CAP))
  )
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
