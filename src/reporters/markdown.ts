import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'
import type { ReporterContext, ReporterOutput, MarkdownTableOptions } from './types.js'
import { CATEGORY_LABELS } from '../scorer/types.js'
import type { Severity } from '../agents/base.js'

const SEVERITY_EMOJI: Record<Severity, string> = {
  critical: '🔴',
  high: '🟠',
  medium: '🟡',
  low: '🔵',
  info: '⚪',
}

const DEFAULT_OPTIONS: MarkdownTableOptions = {
  maxWidth: 120,
  truncateChar: '…',
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

function truncate(text: string, maxWidth: number, truncateChar: string): string {
  if (text.length <= maxWidth) return text
  return text.slice(0, maxWidth - 1) + truncateChar
}

function escapeMarkdown(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\n/g, ' ')
}

function createMarkdownTable(
  headers: string[],
  rows: string[][],
  options: MarkdownTableOptions = DEFAULT_OPTIONS
): string {
  const maxColWidth = Math.floor((options.maxWidth - headers.length * 3) / headers.length)

  const escapedHeaders = headers.map((h) =>
    truncate(escapeMarkdown(h), maxColWidth, options.truncateChar)
  )
  const headerRow = `| ${escapedHeaders.join(' | ')} |`
  const separatorRow = `| ${escapedHeaders.map(() => '---').join(' | ')} |`

  const escapedRows = rows.map((row) =>
    row.map((cell) => truncate(escapeMarkdown(cell), maxColWidth, options.truncateChar))
  )

  const dataRows = escapedRows.map((row) => `| ${row.join(' | ')} |`)

  return [headerRow, separatorRow, ...dataRows].join('\n')
}

function renderScoreBar(score: number, width: number = 10): string {
  const clamped = Math.max(0, Math.min(100, score))
  const filled = Math.round((clamped / 100) * width)
  const empty = width - filled
  return '█'.repeat(filled) + '░'.repeat(empty)
}

function renderCategoryScoresTable(
  categories: { category: string; score: number; findingCount: number }[]
): string {
  const headers = ['Category', 'Score', 'Bar', 'Findings']
  const rows = categories.map((c) => {
    const label =
      CATEGORY_LABELS[c.category] ?? c.category.charAt(0).toUpperCase() + c.category.slice(1)
    return [label, String(c.score), renderScoreBar(c.score, 8), String(c.findingCount)]
  })
  return createMarkdownTable(headers, rows)
}

function renderPriorityFixes(
  fixes: {
    rank: number
    title: string
    rationale: string
    estimatedHours: number
    affectedFiles: string[]
  }[]
): string {
  if (fixes.length === 0) return '*No priority fixes identified.*'

  return fixes
    .map((f) => {
      const files = f.affectedFiles.length > 0 ? f.affectedFiles.join(', ') : 'N/A'
      return `### ${f.rank}. ${f.title}

${f.rationale}

- **Estimated Hours:** ~${f.estimatedHours}h
- **Affected Files:** ${files}`
    })
    .join('\n\n')
}

function renderObservations(observations: string[]): string {
  if (observations.length === 0) return '*No cross-cutting observations.*'
  return observations.map((o) => `- ${o}`).join('\n')
}

function renderFindingsSummary(findings: ReporterContext['findings']): string {
  const byAgent = new Map<string, { total: number; critical: number; high: number }>()

  for (const f of findings) {
    const existing = byAgent.get(f.agentName) ?? { total: 0, critical: 0, high: 0 }
    existing.total++
    if (f.severity === 'critical') existing.critical++
    if (f.severity === 'high') existing.high++
    byAgent.set(f.agentName, existing)
  }

  const headers = ['Agent', 'Total', 'Critical', 'High']
  const rows = Array.from(byAgent.entries()).map(([agent, counts]) => [
    agent,
    String(counts.total),
    String(counts.critical),
    String(counts.high),
  ])

  return createMarkdownTable(headers, rows)
}

function renderCrossAgentFindings(findings: ReporterContext['crossAgentFindings']): string {
  if (findings.length === 0) return '*No cross-agent findings.*'

  const headers = ['Severity', 'Title', 'Agents', 'Files', 'Blast Radius']
  const rows = findings.map((f) => [
    `${SEVERITY_EMOJI[f.severity]} ${f.severity}`,
    f.title,
    f.agents.join(', '),
    f.filePaths.length > 0
      ? f.filePaths[0] + (f.filePaths.length > 1 ? ` (+${f.filePaths.length - 1})` : '')
      : 'N/A',
    String(f.blastRadius),
  ])

  return createMarkdownTable(headers, rows)
}

function renderAgentTimings(timings: Record<string, number>): string {
  const headers = ['Agent', 'Duration (ms)']
  const rows = Object.entries(timings)
    .sort(([, a], [, b]) => b - a)
    .map(([agent, duration]) => [agent, String(duration)])

  return createMarkdownTable(headers, rows)
}

export function buildMarkdownReport(ctx: ReporterContext): string {
  const score = ctx.score.score
  const grade = getScoreGrade(score)
  const delta = ctx.score.delta
  const deltaText = delta === 0 ? '→ No change' : delta > 0 ? `↑ +${delta}` : `↓ ${delta}`

  const lines: string[] = []

  lines.push(`# Palade Report`)
  lines.push('')
  lines.push(`**Run ID:** ${ctx.swarm.runId}`)
  lines.push(`**Timestamp:** ${ctx.config?.runTimestamp ?? new Date().toISOString()}`)
  lines.push(`**Duration:** ${(ctx.swarm.durationMs / 1000).toFixed(1)}s`)
  lines.push('')

  lines.push(`## Score: ${score}/100 (${grade}) ${deltaText}`)
  lines.push('')
  lines.push('```')
  lines.push(renderScoreBar(score, 20))
  lines.push('```')
  lines.push('')

  lines.push(`## Executive Summary`)
  lines.push('')
  lines.push(ctx.synthesis.executiveSummary)
  lines.push('')

  lines.push(`## Category Scores`)
  lines.push('')
  lines.push(renderCategoryScoresTable(ctx.score.breakdown.categories))
  lines.push('')

  lines.push(`## Priority Fixes`)
  lines.push('')
  lines.push(renderPriorityFixes(ctx.synthesis.priorityFixes))
  lines.push('')

  lines.push(`## Cross-Cutting Observations`)
  lines.push('')
  lines.push(renderObservations(ctx.synthesis.crossCuttingObservations))
  lines.push('')

  lines.push(`## Debt Estimate`)
  lines.push('')
  const debt = ctx.synthesis.debtEstimate
  const debtCounts = { critical: 0, high: 0, medium: 0, low: 0, total: 0 }
  for (const f of ctx.findings) {
    if (f.severity === 'critical') debtCounts.critical++
    if (f.severity === 'high') debtCounts.high++
    if (f.severity === 'medium') debtCounts.medium++
    if (f.severity === 'low') debtCounts.low++
    debtCounts.total++
  }
  lines.push(`| Critical | High | Medium | Low | Total |`)
  lines.push(`| --- | --- | --- | --- | --- |`)
  lines.push(
    `| ${debtCounts.critical} | ${debtCounts.high} | ${debtCounts.medium} | ${debtCounts.low} | ${debtCounts.total} |`
  )
  lines.push('')
  if (debt.highestROIFix) {
    lines.push(`**Highest ROI Fix:** ${debt.highestROIFix}`)
    lines.push('')
  }

  lines.push(`## Cross-Agent Findings`)
  lines.push('')
  lines.push(renderCrossAgentFindings(ctx.crossAgentFindings))
  lines.push('')

  lines.push(`## Findings Summary`)
  lines.push('')
  lines.push(renderFindingsSummary(ctx.findings))
  lines.push('')

  lines.push(`## Agent Timings`)
  lines.push('')
  lines.push(renderAgentTimings(ctx.swarm.agentTimings))
  lines.push('')

  lines.push(`---`)
  lines.push('')
  lines.push(`*Generated by Palade — AI-powered codebase intelligence engine*`)

  return lines.join('\n')
}

export function reportMarkdown(ctx: ReporterContext, outputPath?: string): ReporterOutput {
  const content = buildMarkdownReport(ctx)

  if (outputPath) {
    const dir = dirname(outputPath)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    writeFileSync(outputPath, content, 'utf-8')
  }

  return {
    format: 'markdown',
    path: outputPath,
    content,
  }
}
