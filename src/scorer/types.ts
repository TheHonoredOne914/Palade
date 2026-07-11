import type { AgentName } from '../agents/base.js'

// Narrowed to AgentName (built-in agent literals, widened to allow arbitrary
// custom agent name strings via AgentName's own `(string & {})` member)
// instead of a bare `string` — a bare string gave calculator.ts's hardcoded
// `allBaseCategories` literal array no compile-time link to the actual
// AgentName values, so a future rename/typo of a built-in agent name would
// compile cleanly and silently leave that category permanently scored at
// 100 (scorer-003).
export type ScoreCategory = AgentName

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
  logic: 'Logic',
  pragmatism: 'Pragmatism',
}
