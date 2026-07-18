import type { AgentFinding, Severity } from '../agents/base.js'
import type { CrossAgentFinding } from '../orchestrator/types.js'
import type { ScoreCategory, CategoryScore, ScoreBreakdown, ScoreResult } from './types.js'
import {
  SEVERITY_PENALTY,
  DEFAULT_PENALTY_CAPS,
  DEFAULT_COMPLEXITY_PENALTIES,
  DEFAULT_CROSS_AGENT_PENALTY_WEIGHTS,
} from '../config/defaults.js'

// Floors are intentionally asymmetric: a single category is allowed to sink
// further (floor 10) than the blended overall score (floor 5), so one bad
// category can hurt the total without a single agent being able to zero it
// out entirely.
//
// The score FLOORS above (and the 60/40 average-vs-penalty blend ratio
// below) are intentional fixed safety rails, not tunable knobs like
// severityWeights or crossAgentPenalty — they bound how the score can move
// regardless of config, so they're deliberately not exposed via
// config.score. The DEFAULT_*_PENALTY_CAP values right below them are NOT in
// that category: PenaltyCaps IS config-backed (see
// config.score.penaltyCaps/ScoreWeightsConfig.penaltyCaps below) — only
// their default values live here as module constants.
const CATEGORY_SCORE_FLOOR = 10
const DEFAULT_CATEGORY_PENALTY_CAP = 90
const TOTAL_SCORE_FLOOR = 5

/** Category/total penalty caps, overridable via `config.score.penaltyCaps`. */
export interface PenaltyCaps {
  categoryPenaltyCap: number
  totalPenaltyCap: number
}

/** Complexity-multiplier thresholds/factors, overridable via `config.score.complexityPenalties`. */
export interface ComplexityPenalties {
  lowThreshold: number
  lowFactor: number
  highThreshold: number
  highFactor: number
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
      penalty += computeFindingPenalty(f, severityWeights, complexityPenalties)
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

export function computeFindingPenalty(
  f: AgentFinding,
  severityWeights: SeverityWeights,
  complexityPenalties: ComplexityPenalties
): number {
  let fPenalty = penaltyFor(f, severityWeights)
  if (f.agentName === MAINTAINABILITY_AGENT && typeof f.complexity === 'number') {
    fPenalty = applyComplexityMultiplier(f.complexity, fPenalty, complexityPenalties)
  }
  return fPenalty
}

export function calculateTotalPenalty(
  findings: AgentFinding[],
  severityWeights: SeverityWeights = SEVERITY_PENALTY,
  complexityPenalties: ComplexityPenalties = DEFAULT_COMPLEXITY_PENALTIES
): number {
  let penalty = 0
  for (const f of findings) {
    penalty += computeFindingPenalty(f, severityWeights, complexityPenalties)
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
    const radius = Number.isFinite(cf.blastRadius) ? Math.max(1, cf.blastRadius) : 1
    const blastMultiplier = Math.min(1 + Math.log2(radius) * 0.2, 3)
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
  for (const k of Object.keys(severityWeights) as Array<keyof SeverityWeights>) {
    severityWeights[k] = Math.max(
      0,
      Number.isFinite(severityWeights[k]) ? severityWeights[k] : SEVERITY_PENALTY[k]
    )
  }

  const crossAgentWeights: CrossAgentPenaltyWeights = {
    ...DEFAULT_CROSS_AGENT_PENALTY_WEIGHTS,
    ...scoreConfig?.crossAgentPenalty,
  }

  const complexityPenalties: ComplexityPenalties = {
    ...DEFAULT_COMPLEXITY_PENALTIES,
    ...scoreConfig?.complexityPenalties,
  }
  complexityPenalties.lowFactor = Math.max(
    0,
    Number.isFinite(complexityPenalties.lowFactor)
      ? complexityPenalties.lowFactor
      : DEFAULT_COMPLEXITY_PENALTIES.lowFactor
  )
  complexityPenalties.highFactor = Math.max(
    0,
    Number.isFinite(complexityPenalties.highFactor)
      ? complexityPenalties.highFactor
      : DEFAULT_COMPLEXITY_PENALTIES.highFactor
  )
  if (complexityPenalties.lowThreshold >= complexityPenalties.highThreshold) {
    complexityPenalties.highThreshold = complexityPenalties.lowThreshold + 1
  }

  const penaltyCaps: PenaltyCaps = {
    ...DEFAULT_PENALTY_CAPS,
    ...scoreConfig?.penaltyCaps,
  }
  penaltyCaps.categoryPenaltyCap = Math.max(
    0,
    Number.isFinite(penaltyCaps.categoryPenaltyCap)
      ? penaltyCaps.categoryPenaltyCap
      : DEFAULT_PENALTY_CAPS.categoryPenaltyCap
  )
  penaltyCaps.totalPenaltyCap = Math.max(
    0,
    Number.isFinite(penaltyCaps.totalPenaltyCap)
      ? penaltyCaps.totalPenaltyCap
      : DEFAULT_PENALTY_CAPS.totalPenaltyCap
  )

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
  // `undefined` means "no restriction" (run everything) and keeps the
  // historical behavior of averaging all base categories. An explicitly
  // empty array means zero agents actually ran this review, which must NOT
  // fall back to the same "average all 8 categories at 100" behavior — that
  // would produce a perfect score for a run that reviewed nothing. Filtering
  // allBaseCategories against an empty executedCategories array naturally
  // yields an empty categories list, which avgCategoryScore below handles.
  const baseCategories =
    executedCategories === undefined
      ? allBaseCategories
      : allBaseCategories.filter((c) => executedCategories.includes(c))

  // executedCategories can also include agent names OUTSIDE allBaseCategories
  // (custom agents) — those were previously dropped entirely by the filter
  // above (which only ever narrows allBaseCategories) and only re-entered
  // `categories` if they happened to have produced a finding. A clean
  // (zero-finding) custom-agent run therefore never got seeded into
  // `categories` and silently lost its free 100, while a clean BUILT-IN
  // category always gets one — two identically-clean runs scored
  // differently depending on whether the clean category was built-in or
  // custom (scorer-101). Seed these non-base executed names in directly so
  // they get the same treatment as a clean base category.
  const nonBaseExecutedCategories = (executedCategories ?? []).filter(
    (c) => !allBaseCategories.includes(c)
  )
  const uniqueAgents = Array.from(new Set(findings.map((f) => f.agentName)))
  const categories = Array.from(
    new Set([...baseCategories, ...nonBaseExecutedCategories, ...uniqueAgents])
  )

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
  // with zero findings, or scorer-001's explicitly-empty executedCategories
  // case where zero agents ran) instead of dividing by zero and producing
  // NaN. This 100 represents "no categories to average" — it is NOT a
  // validated clean bill of health, since a run that reviewed nothing looks
  // identical here to a run that reviewed everything and found nothing. The
  // total score is a blend with the penalty-based score below, and total
  // penalty from zero findings is correctly 0 either way, so this fallback
  // doesn't silently overstate a genuine coverage failure in the final
  // number by much — but callers inspecting categoryScores directly should
  // be aware an empty array can mean either "nothing ran" or "nothing to
  // score".
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
