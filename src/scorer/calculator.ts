import type { AgentFinding, Severity } from '../agents/base.js'
import { SEVERITY_PENALTY } from '../agents/base.js'
import type { CrossAgentFinding } from '../orchestrator/types.js'
import type { ScoreCategory, CategoryScore, ScoreBreakdown, ScoreResult } from './types.js'

// Floors/caps are intentionally asymmetric: a single category is allowed to
// sink further (floor 10, cap 90) than the blended overall score (floor 5,
// cap 95), so one bad category can hurt the total without a single agent
// being able to zero it out entirely.
//
// These constants (and the 60/40 average-vs-penalty blend ratio below) are
// intentional fixed safety rails, not tunable knobs like severityWeights or
// crossAgentPenalty — they bound how the score can move regardless of config,
// so they're deliberately not exposed via config.score.
const CATEGORY_SCORE_FLOOR = 10
const DEFAULT_CATEGORY_PENALTY_CAP = 90
const TOTAL_SCORE_FLOOR = 5
const DEFAULT_TOTAL_PENALTY_CAP = 95

/** Category/total penalty caps, overridable via `config.score.penaltyCaps`. */
export interface PenaltyCaps {
  categoryPenaltyCap: number
  totalPenaltyCap: number
}

export const DEFAULT_PENALTY_CAPS: PenaltyCaps = {
  categoryPenaltyCap: DEFAULT_CATEGORY_PENALTY_CAP,
  totalPenaltyCap: DEFAULT_TOTAL_PENALTY_CAP,
}

/** Complexity-multiplier thresholds/factors, overridable via `config.score.complexityPenalties`. */
export interface ComplexityPenalties {
  lowThreshold: number
  lowFactor: number
  highThreshold: number
  highFactor: number
}

export const DEFAULT_COMPLEXITY_PENALTIES: ComplexityPenalties = {
  lowThreshold: 5,
  lowFactor: 0.5,
  highThreshold: 20,
  highFactor: 1.5,
}

/**
 * Scales a finding's penalty by the complexity of the code it was found in:
 * simpler code gets a lighter penalty, very complex code a heavier one.
 * Shared by calculateCategoryScore and calculateTotalPenalty so the two
 * don't drift out of sync (scorer-002).
 */
export function applyComplexityMultiplier(
  complexity: number,
  penalty: number,
  thresholds: ComplexityPenalties = DEFAULT_COMPLEXITY_PENALTIES
): number {
  if (complexity < thresholds.lowThreshold) return penalty * thresholds.lowFactor
  if (complexity > thresholds.highThreshold) return penalty * thresholds.highFactor
  return penalty
}

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
export function penaltyFor(
  f: AgentFinding,
  severityWeights: SeverityWeights = SEVERITY_PENALTY
): number {
  // Number.isFinite (not typeof === 'number') so a NaN/Infinity scorePenalty
  // — e.g. from a misconfigured custom-agent severityPenalty override —
  // can't propagate into category/total penalty sums and corrupt the whole
  // score. history.ts already guards its own score field the same way.
  return Number.isFinite(f.scorePenalty) ? (f.scorePenalty as number) : severityWeights[f.severity]
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
  severityWeights: SeverityWeights = SEVERITY_PENALTY,
  complexityPenalties: ComplexityPenalties = DEFAULT_COMPLEXITY_PENALTIES,
  categoryPenaltyCap: number = DEFAULT_CATEGORY_PENALTY_CAP
): CategoryScore {
  const agentName = category
  const { total, critical, high } = countBySeverity(findings, agentName)

  let penalty = 0
  for (const f of findings) {
    if (f.agentName === agentName) {
      let fPenalty = penaltyFor(f, severityWeights)
      if (agentName === MAINTAINABILITY_AGENT && typeof f.complexity === 'number') {
        fPenalty = applyComplexityMultiplier(f.complexity, fPenalty, complexityPenalties)
      }
      penalty += fPenalty
    }
  }

  // Cap category penalty so a single category can't zero out the score
  const cappedPenalty = Math.min(penalty, categoryPenaltyCap)
  const score = Math.max(CATEGORY_SCORE_FLOOR, Math.round(100 - cappedPenalty))

  return {
    category,
    score,
    findingCount: total,
    criticalCount: critical,
    highCount: high,
  }
}

export const MAINTAINABILITY_AGENT = 'maintainability'

export function calculateTotalPenalty(
  findings: AgentFinding[],
  severityWeights: SeverityWeights = SEVERITY_PENALTY,
  complexityPenalties: ComplexityPenalties = DEFAULT_COMPLEXITY_PENALTIES
): number {
  let penalty = 0
  for (const f of findings) {
    let fPenalty = penaltyFor(f, severityWeights)
    if (f.agentName === MAINTAINABILITY_AGENT && typeof f.complexity === 'number') {
      fPenalty = applyComplexityMultiplier(f.complexity, fPenalty, complexityPenalties)
    }
    penalty += fPenalty
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
    const blastMultiplier = Math.min(1 + Math.log2(Math.max(1, cf.blastRadius)) * 0.2, 3)
    penalty += base * blastMultiplier
  }
  return penalty
}

export interface ScoreWeightsConfig {
  severityWeights?: Partial<SeverityWeights>
  crossAgentPenalty?: Partial<CrossAgentPenaltyWeights>
  complexityPenalties?: Partial<ComplexityPenalties>
  penaltyCaps?: Partial<PenaltyCaps>
}

export function calculateScore(
  findings: AgentFinding[],
  crossAgentFindings: CrossAgentFinding[],
  previousScore: number | null = null,
  scoreConfig?: ScoreWeightsConfig,
  /**
   * Categories that actually ran this review (e.g. via context.modeConfig's
   * agentOverrides, or a swarm's agentsRun list). When omitted, defaults to
   * "all categories" — matching the historical behavior for callers that run
   * every built-in agent. When provided, only these categories are averaged
   * into the score: an agent that never ran must not silently contribute a
   * free 100 and dilute the real score (scorer-001).
   */
  executedCategories?: ScoreCategory[]
): ScoreResult {
  const severityWeights: SeverityWeights = {
    ...SEVERITY_PENALTY,
    ...scoreConfig?.severityWeights,
  }
  const crossAgentWeights: CrossAgentPenaltyWeights = {
    ...DEFAULT_CROSS_AGENT_PENALTY_WEIGHTS,
    ...scoreConfig?.crossAgentPenalty,
  }
  const complexityPenalties: ComplexityPenalties = {
    ...DEFAULT_COMPLEXITY_PENALTIES,
    ...scoreConfig?.complexityPenalties,
  }
  const penaltyCaps: PenaltyCaps = {
    ...DEFAULT_PENALTY_CAPS,
    ...scoreConfig?.penaltyCaps,
  }

  const allBaseCategories: ScoreCategory[] = [
    'security',
    'architecture',
    'performance',
    'maintainability',
    'deadCode',
    'testIntelligence',
    'logic',
    'pragmatism',
  ]
  const baseCategories =
    executedCategories && executedCategories.length > 0
      ? allBaseCategories.filter((c) => executedCategories.includes(c))
      : allBaseCategories

  const uniqueAgents = Array.from(new Set(findings.map((f) => f.agentName)))
  const categories = Array.from(new Set([...baseCategories, ...uniqueAgents]))

  const categoryScores = categories.map((cat) =>
    calculateCategoryScore(
      findings,
      cat,
      severityWeights,
      complexityPenalties,
      penaltyCaps.categoryPenaltyCap
    )
  )

  const findingPenalty = calculateTotalPenalty(findings, severityWeights, complexityPenalties)
  const crossAgentPenalty = calculateCrossAgentPenalty(crossAgentFindings, crossAgentWeights)
  const totalPenalty = findingPenalty + crossAgentPenalty
  // Average category scores for a balanced overall score. Falls back to a
  // clean 100 when there are no categories (e.g. a custom-agent-only run
  // with zero findings) instead of dividing by zero and producing NaN.
  const avgCategoryScore =
    categoryScores.length === 0
      ? 100
      : categoryScores.reduce((sum, c) => sum + c.score, 0) / categoryScores.length
  // Blend: 60% average category score, 40% penalty-based score
  const penaltyScore = Math.max(
    TOTAL_SCORE_FLOOR,
    Math.round(100 - Math.min(totalPenalty, penaltyCaps.totalPenaltyCap))
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
