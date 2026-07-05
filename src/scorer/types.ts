import type { AgentFinding, AgentName } from '../agents/base.js'
import type { CrossAgentFinding } from '../orchestrator/types.js'

export type ScoreCategory = string

export interface CategoryScore {
  category: ScoreCategory
  score: number
  findingCount: number
  criticalCount: number
  highCount: number
}

export interface ScoreBreakdown {
  total: number
  categories: CategoryScore[]
  findingCount: number
  crossAgentCount: number
}

export interface ScoreResult {
  score: number
  breakdown: ScoreBreakdown
  previousScore: number | null
  delta: number
}

export interface ScoreHistoryEntry {
  timestamp: string
  runId: string
  score: number
  breakdown: ScoreBreakdown
  delta: number
  // 'full' = whole-repo `palade review` run, 'diff' = changed-files-only
  // `palade diff` run. Absent (older entries) is treated as 'full' for
  // backward compatibility.
  kind?: 'full' | 'diff'
}

export type BadgeColor = 'brightgreen' | 'green' | 'yellow' | 'orange' | 'red'

export interface BadgeData {
  score: number | string
  color: BadgeColor
  label: string
}

export const CATEGORY_LABELS: Record<string, string> = {
  security: 'Security',
  architecture: 'Architecture',
  performance: 'Performance',
  maintainability: 'Maintainability',
  deadCode: 'Dead Code',
  testIntelligence: 'Test Intelligence',
}
