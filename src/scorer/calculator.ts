import type { AgentFinding, Severity } from '../agents/base.js'
import type { CrossAgentFinding } from '../orchestrator/types.js'
import type {
  ScoreCategory,
  CategoryScore,
  ScoreBreakdown,
  ScoreResult
} from './types.js'

const CATEGORY_AGENT_MAP: Record<ScoreCategory, string> = {
  security: 'security',
  architecture: 'architecture',
  performance: 'performance',
  maintainability: 'maintainability',
  deadCode: 'deadCode',
  testIntelligence: 'testIntelligence'
}

const SEVERITY_WEIGHTS: Record<Severity, number> = {
  critical: 10,
  high: 5,
  medium: 2,
  low: 0.5,
  info: 0
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
  const agentName = CATEGORY_AGENT_MAP[category]
  const { total, critical, high } = countBySeverity(findings, agentName)

  let penalty = 0
  for (const f of findings) {
    if (f.agentName === agentName) {
      penalty += SEVERITY_WEIGHTS[f.severity]
    }
  }

  const score = Math.max(0, Math.round(100 - penalty))

  return {
    category,
    score,
    findingCount: total,
    criticalCount: critical,
    highCount: high
  }
}

export function calculateTotalPenalty(findings: AgentFinding[]): number {
  let penalty = 0
  for (const f of findings) {
    penalty += SEVERITY_WEIGHTS[f.severity]
  }
  return penalty
}

export function calculateCrossAgentPenalty(
  crossFindings: CrossAgentFinding[]
): number {
  let penalty = 0
  for (const cf of crossFindings) {
    if (cf.severity === 'critical') penalty += 15
    else if (cf.severity === 'high') penalty += 8
    else if (cf.severity === 'medium') penalty += 4
  }
  return penalty
}

export function calculateScore(
  findings: AgentFinding[],
  crossAgentFindings: CrossAgentFinding[],
  previousScore: number | null = null
): ScoreResult {
  const categories: ScoreCategory[] = [
    'security',
    'architecture',
    'performance',
    'maintainability',
    'deadCode',
    'testIntelligence'
  ]

  const categoryScores = categories.map((cat) =>
    calculateCategoryScore(findings, cat)
  )

  const findingPenalty = calculateTotalPenalty(findings)
  const crossAgentPenalty = calculateCrossAgentPenalty(crossAgentFindings)
  const totalPenalty = findingPenalty + crossAgentPenalty
  const total = Math.max(0, Math.round(100 - totalPenalty))

  const breakdown: ScoreBreakdown = {
    total,
    categories: categoryScores,
    findingCount: findings.length,
    crossAgentCount: crossAgentFindings.length
  }

  const delta = previousScore !== null ? total - previousScore : 0

  return {
    score: total,
    breakdown,
    previousScore,
    delta
  }
}
