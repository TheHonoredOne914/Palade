import type { ScoreResult, ScoreHistoryEntry } from '../scorer/types.js'
import type { SwarmResult, CrossAgentFinding } from '../orchestrator/types.js'
import type { AgentFinding } from '../agents/base.js'
import type { SynthesisResult } from '../agents/synthesis.js'

export interface ReporterContext {
  score: ScoreResult
  swarm: SwarmResult
  synthesis: SynthesisResult
  findings: AgentFinding[]
  crossAgentFindings: CrossAgentFinding[]
  history: ScoreHistoryEntry[]
  config?: {
    projectName?: string
    runTimestamp?: string
  }
}

export interface ReporterOutput {
  format: string
  path?: string
  content?: string
}

export interface TerminalColors {
  score: (text: string) => string
  critical: (text: string) => string
  high: (text: string) => string
  medium: (text: string) => string
  low: (text: string) => string
  info: (text: string) => string
  dim: (text: string) => string
  bold: (text: string) => string
  success: (text: string) => string
  warning: (text: string) => string
}

export type ReporterFormat = 'terminal' | 'json' | 'html' | 'markdown'

export interface HtmlTemplateData {
  title: string
  timestamp: string
  projectName: string
  score: number
  scoreColor: string
  scoreGrade: string
  delta: number
  deltaText: string
  executiveSummary: string
  categoryScoresHtml: string
  priorityFixesHtml: string
  crossAgentFindingsHtml: string
  findingsSummaryHtml: string
  debtEstimateHtml: string
  sparklineData: string
  sparklineLabels: string
  agentTimingsHtml: string
  durationMs: number
  totalChunks: number
  totalTokens: number
}

export interface MarkdownTableOptions {
  maxWidth: number
  truncateChar: string
}
