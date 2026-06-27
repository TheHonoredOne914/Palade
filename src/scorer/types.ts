import type { AgentFinding, AgentName } from '../agents/base.js'
import type { CrossAgentFinding } from '../orchestrator/types.js'

export type ScoreCategory =
  'security' | 'architecture' | 'performance' | 'maintainability' | 'deadCode' | 'testIntelligence'

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
}

export type BadgeColor = 'brightgreen' | 'green' | 'yellow' | 'orange' | 'red'

export interface BadgeData {
  score: number | string
  color: BadgeColor
  label: string
}

export const CATEGORY_LABELS: Record<ScoreCategory, string> = {
  security: 'Security',
  architecture: 'Architecture',
  performance: 'Performance',
  maintainability: 'Maintainability',
  deadCode: 'Dead Code',
  testIntelligence: 'Test Intelligence',
}
