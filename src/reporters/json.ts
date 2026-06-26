import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'
import type { ReporterContext, ReporterOutput } from './types.js'
import type { ScoreCategory } from '../scorer/types.js'
import type { Severity } from '../agents/base.js'

const CATEGORY_LABELS: Record<ScoreCategory, string> = {
  security: 'Security',
  architecture: 'Architecture',
  performance: 'Performance',
  maintainability: 'Maintainability',
  deadCode: 'Dead Code',
  testIntelligence: 'Test Intelligence'
}

interface JsonFinding {
  id: string
  agent: string
  severity: Severity
  title: string
  description: string
  filePath?: string
  lineStart?: number
  lineEnd?: number
  symbolName?: string
  tags: string[]
  scorePenalty: number
  provider?: string
  model?: string
}

interface JsonCrossAgentFinding {
  title: string
  description: string
  agents: string[]
  filePaths: string[]
  severity: Severity
  blastRadius: number
}

interface JsonCategoryScore {
  category: ScoreCategory
  categoryLabel: string
  score: number
  findingCount: number
  criticalCount: number
  highCount: number
}

interface JsonDebtEstimate {
  critical: number
  high: number
  medium: number
  low: number
  total: number
  highestROIFix: string
}

interface JsonPriorityFix {
  rank: number
  title: string
  rationale: string
  estimatedHours: number
  affectedFiles: string[]
}

interface JsonSynthesis {
  executiveSummary: string
  priorityFixes: JsonPriorityFix[]
  crossCuttingObservations: string[]
  debtEstimate: JsonDebtEstimate
}

interface JsonScore {
  total: number
  grade: string
  delta: number
  previousScore: number | null
  breakdown: {
    findingCount: number
    crossAgentCount: number
    categories: JsonCategoryScore[]
  }
}

interface JsonAgentTiming {
  agent: string
  durationMs: number
}

interface JsonReport {
  version: string
  runId: string
  timestamp: string
  projectName?: string
  score: JsonScore
  synthesis: JsonSynthesis
  findings: JsonFinding[]
  crossAgentFindings: JsonCrossAgentFinding[]
  agentTimings: JsonAgentTiming[]
  metadata: {
    totalChunks: number
    totalTokensEstimated: number
    durationMs: number
  }
}

function getScoreGrade(score: number): string {
  if (score >= 90) return 'A+'
  if (score >= 80) return 'A'
  if (score >= 75) return 'B+'
  if (score >= 70) return 'B'
  if (score >= 60) return 'C'
  if (score >= 40) return 'D'
  return 'F'
}

function mapFindings(findings: ReporterContext['findings']): JsonFinding[] {
  return findings.map(f => ({
    id: f.id,
    agent: f.agentName,
    severity: f.severity,
    title: f.title,
    description: f.description,
    filePath: f.filePath,
    lineStart: f.lineStart,
    lineEnd: f.lineEnd,
    symbolName: f.symbolName,
    tags: [...f.tags],
    scorePenalty: f.scorePenalty,
    provider: f.provider,
    model: f.model
  }))
}

function mapCrossAgentFindings(findings: ReporterContext['crossAgentFindings']): JsonCrossAgentFinding[] {
  return findings.map(f => ({
    title: f.title,
    description: f.description,
    agents: [...f.agents],
    filePaths: [...f.filePaths],
    severity: f.severity,
    blastRadius: f.blastRadius
  }))
}

function mapSynthesis(synthesis: ReporterContext['synthesis']): JsonSynthesis {
  return {
    executiveSummary: synthesis.executiveSummary,
    priorityFixes: synthesis.priorityFixes.map(f => ({
      rank: f.rank,
      title: f.title,
      rationale: f.rationale,
      estimatedHours: f.estimatedHours,
      affectedFiles: [...f.affectedFiles]
    })),
    crossCuttingObservations: [...synthesis.crossCuttingObservations],
    debtEstimate: {
      critical: synthesis.debtEstimate.critical,
      high: synthesis.debtEstimate.high,
      medium: synthesis.debtEstimate.medium,
      low: synthesis.debtEstimate.low,
      total: synthesis.debtEstimate.total,
      highestROIFix: synthesis.debtEstimate.highestROIFix
    }
  }
}

function mapAgentTimings(timings: ReporterContext['swarm']['agentTimings']): JsonAgentTiming[] {
  return Object.entries(timings).map(([agent, duration]) => ({
    agent,
    durationMs: duration
  }))
}

export function buildJsonReport(ctx: ReporterContext): JsonReport {
  return {
    version: '1.0.0',
    runId: ctx.swarm.runId,
    timestamp: ctx.config?.runTimestamp ?? new Date().toISOString(),
    projectName: ctx.config?.projectName,
    score: {
      total: ctx.score.score,
      grade: getScoreGrade(ctx.score.score),
      delta: ctx.score.delta,
      previousScore: ctx.score.previousScore,
      breakdown: {
        findingCount: ctx.score.breakdown.findingCount,
        crossAgentCount: ctx.score.breakdown.crossAgentCount,
        categories: ctx.score.breakdown.categories.map(c => ({
          category: c.category,
          categoryLabel: CATEGORY_LABELS[c.category],
          score: c.score,
          findingCount: c.findingCount,
          criticalCount: c.criticalCount,
          highCount: c.highCount
        }))
      }
    },
    synthesis: mapSynthesis(ctx.synthesis),
    findings: mapFindings(ctx.findings),
    crossAgentFindings: mapCrossAgentFindings(ctx.crossAgentFindings),
    agentTimings: mapAgentTimings(ctx.swarm.agentTimings),
    metadata: {
      totalChunks: ctx.swarm.totalChunks,
      totalTokensEstimated: ctx.swarm.totalTokensEstimated,
      durationMs: ctx.swarm.durationMs
    }
  }
}

export function reportJson(ctx: ReporterContext, outputPath: string): ReporterOutput {
  const report = buildJsonReport(ctx)
  const content = JSON.stringify(report, null, 2)
  
  const dir = dirname(outputPath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  
  writeFileSync(outputPath, content, 'utf-8')
  
  return {
    format: 'json',
    path: outputPath,
    content
  }
}
