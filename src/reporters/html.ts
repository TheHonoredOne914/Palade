import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer, type Server } from 'node:http'

const __dirname = dirname(fileURLToPath(import.meta.url))
import type { ReporterContext, ReporterOutput, HtmlTemplateData } from './types.js'
import type { ScoreCategory, BadgeColor } from '../scorer/types.js'
import type { Severity } from '../agents/base.js'

import { CATEGORY_LABELS } from '../scorer/types.js'
import { getScoreColor as getScoreColorTier } from '../scorer/badge.js'
import { groupBySeverity } from '../orchestrator/merger.js'
import { scoreGrade } from '../ui/layout.js'

const SEVERITY_CLASSES: Record<Severity, string> = {
  critical: 'severity-critical',
  high: 'severity-high',
  medium: 'severity-medium',
  low: 'severity-low',
  info: 'severity-low',
}

function getScoreGradeClass(score: number): string {
  // Must match the .score-circle.grade-* rules actually defined in
  // templates/report.html — that stylesheet only has a/b/c/d/f tiers, no
  // "-plus" variants, so emitting grade-a-plus/grade-b-plus left the
  // best-scoring runs' score circle with no color at all.
  if (score >= 80) return 'grade-a'
  if (score >= 70) return 'grade-b'
  if (score >= 60) return 'grade-c'
  if (score >= 40) return 'grade-d'
  return 'grade-f'
}

// Reuses badge.ts's canonical 5-tier getScoreColor (SCORE_THRESHOLDS.excellent
// included) instead of maintaining a second, independently-drifting 4-tier
// threshold ladder — previously the same score could render a different
// color in the HTML report vs. the README badge (scorer-001).
const BADGE_COLOR_HEX: Record<BadgeColor, string> = {
  brightgreen: '#3fb950',
  green: '#57ab5a',
  yellow: '#d29922',
  orange: '#db61a2',
  red: '#f85149',
}

function getScoreColor(score: number): string {
  const clamped = Math.max(0, Math.min(100, score))
  const color = BADGE_COLOR_HEX[getScoreColorTier(clamped)]
  // Ensure the returned value is a valid hex color to prevent CSS injection
  return /^#[0-9a-f]{6}$/i.test(color) ? color : '#888888'
}

function formatDeltaText(delta: number): string {
  if (delta === 0) return 'No change from previous run'
  if (delta > 0) return `+${delta} from previous run`
  return `${delta} from previous run`
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function renderCategoryScoreHtml(category: ScoreCategory, score: number): string {
  const safeScore = Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 0
  const color = getScoreColor(safeScore)
  const label =
    CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS] ??
    category.charAt(0).toUpperCase() + category.slice(1)
  return `
        <div class="category-item">
          <div class="category-name">${escapeHtml(label)}</div>
          <div class="category-bar">
            <div class="category-bar-fill" style="width: ${safeScore}%; background: ${color};"></div>
          </div>
          <div class="category-score" style="color: ${color};">${safeScore}</div>
        </div>`
}

function renderPriorityFixHtml(fix: {
  rank: number
  title: string
  rationale: string
  estimatedHours: number
  affectedFiles: string[]
}): string {
  return `
      <div class="priority-fix">
        <div class="priority-fix-header">
          <div class="priority-rank">${fix.rank}</div>
          <div class="priority-title">${escapeHtml(fix.title)}</div>
        </div>
        <div class="priority-rationale">${escapeHtml(fix.rationale)}</div>
        <div class="priority-meta">
          <span>~${fix.estimatedHours}h estimated</span>
          <span>Files: ${fix.affectedFiles.map(escapeHtml).join(', ')}</span>
        </div>
      </div>`
}

function renderObservationHtml(observation: string): string {
  return `        <li>${escapeHtml(observation)}</li>`
}

function renderCrossAgentFindingHtml(finding: {
  title: string
  description: string
  agents: string[]
  filePaths: string[]
  severity: string
}): string {
  const severityClass = SEVERITY_CLASSES[finding.severity as Severity] ?? 'severity-low'
  const location =
    finding.filePaths.length > 0
      ? `<div class="finding-location">${finding.filePaths.map(escapeHtml).join(', ')}</div>`
      : ''

  return `
        <li class="finding-item">
          <div class="finding-header">
            <span class="finding-severity ${severityClass}">${escapeHtml(finding.severity)}</span>
            <span class="finding-title">${escapeHtml(finding.title)}</span>
            ${location}
          </div>
          <div class="finding-description">${escapeHtml(finding.description)}</div>
        </li>`
}

function renderAgentTimingHtml(
  timing: { agent: string; durationMs: number },
  maxDuration: number
): string {
  const width = maxDuration > 0 ? (timing.durationMs / maxDuration) * 100 : 0
  return `
      <div class="agent-timing">
        <div class="agent-name">${escapeHtml(timing.agent)}</div>
        <div class="agent-bar">
          <div class="agent-bar-fill" style="width: ${width}%;"></div>
        </div>
        <div class="agent-time">${timing.durationMs}ms</div>
      </div>`
}

function renderFindingsSummaryHtml(findings: ReporterContext['findings']): string {
  const byAgent = new Map<string, { total: number; critical: number; high: number }>()

  for (const f of findings) {
    const existing = byAgent.get(f.agentName) ?? { total: 0, critical: 0, high: 0 }
    existing.total++
    if (f.severity === 'critical') existing.critical++
    if (f.severity === 'high') existing.high++
    byAgent.set(f.agentName, existing)
  }

  const rows = Array.from(byAgent.entries())
    .map(([agent, counts]) => {
      return `
        <tr>
          <td>${escapeHtml(agent)}</td>
          <td>${counts.total}</td>
          <td style="color: #f85149;">${counts.critical}</td>
          <td style="color: #d29922;">${counts.high}</td>
        </tr>`
    })
    .join('')

  return `
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="border-bottom: 1px solid #30363d;">
            <th style="text-align: left; padding: 0.5rem;">Agent</th>
            <th style="text-align: left; padding: 0.5rem;">Total</th>
            <th style="text-align: left; padding: 0.5rem;">Critical</th>
            <th style="text-align: left; padding: 0.5rem;">High</th>
          </tr>
        </thead>
        <tbody>${rows}
        </tbody>
      </table>`
}

function renderFindingLocation(finding: {
  filePath?: string
  lineStart?: number
  lineEnd?: number
}): string {
  if (!finding.filePath) return ''
  let location = finding.filePath
  if (typeof finding.lineStart === 'number') {
    location += `:${finding.lineStart}`
    if (typeof finding.lineEnd === 'number' && finding.lineEnd !== finding.lineStart) {
      location += `-${finding.lineEnd}`
    }
  }
  return `<div class="finding-location">${escapeHtml(location)}</div>`
}

function renderFindingDetailHtml(finding: {
  agentName: string
  severity: string
  title: string
  description: string
  filePath?: string
  lineStart?: number
  lineEnd?: number
}): string {
  const severityClass = SEVERITY_CLASSES[finding.severity as Severity] ?? 'severity-low'

  return `
        <li class="finding-item">
          <div class="finding-header">
            <span class="finding-severity ${severityClass}">${escapeHtml(finding.severity)}</span>
            <span class="finding-title">${escapeHtml(finding.title)}</span>
            <span class="finding-category" style="color: var(--text-muted); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em;">${escapeHtml(finding.agentName)}</span>
            ${renderFindingLocation(finding)}
          </div>
          <div class="finding-description">${escapeHtml(finding.description)}</div>
        </li>`
}

function renderFindingsDetailHtml(findings: ReporterContext['findings']): string {
  if (findings.length === 0) {
    return '<p style="color: var(--text-muted); margin-top: 1.5rem;">No individual findings.</p>'
  }

  const severityOrder: Record<string, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
    info: 4,
  }

  const items = [...findings]
    .sort((a, b) => {
      const aRank = severityOrder[a.severity] ?? 5
      const bRank = severityOrder[b.severity] ?? 5
      if (aRank !== bRank) return aRank - bRank
      return (a.filePath ?? '').localeCompare(b.filePath ?? '')
    })
    .map((f) => renderFindingDetailHtml(f))
    .join('\n')

  return `
      <h3 style="margin: 1.5rem 0 1rem; font-family: 'Outfit', sans-serif; font-size: 1.05rem; color: #fff;">Detailed Findings</h3>
      <ul class="finding-list">${items}
      </ul>`
}

function getTemplatePath(): string {
  // Check the bundled template first to prevent user-controlled template hijacking
  const bundledPath = join(__dirname, '..', '..', 'templates', 'report.html')
  if (existsSync(bundledPath)) return bundledPath

  const possiblePaths = [
    join(process.cwd(), 'templates', 'report.html'),
    join(process.cwd(), 'node_modules', 'palade', 'templates', 'report.html'),
  ]

  for (const p of possiblePaths) {
    if (existsSync(p)) return p
  }

  return bundledPath
}

function loadTemplate(): string {
  const templatePath = getTemplatePath()
  return readFileSync(templatePath, 'utf-8')
}

function buildTemplateData(ctx: ReporterContext): HtmlTemplateData {
  const projectName = ctx.config?.projectName ?? 'Project'
  const timestamp = ctx.config?.runTimestamp ?? new Date().toISOString()
  const score = ctx.score.score

  const categoryScoresHtml = ctx.score.breakdown.categories
    .map((c) => renderCategoryScoreHtml(c.category, c.score))
    .join('\n')

  const priorityFixesHtml = ctx.synthesis.priorityFixes
    .map((f) => renderPriorityFixHtml(f))
    .join('\n')

  const observationsHtml = ctx.synthesis.crossCuttingObservations
    .map((o) => renderObservationHtml(o))
    .join('\n')

  const crossAgentFindingsHtml = ctx.crossAgentFindings
    .map((f) => renderCrossAgentFindingHtml(f))
    .join('\n')

  const agentTimingEntries = Object.entries(ctx.swarm.agentTimings).filter(
    (entry): entry is [string, number] => entry[1] !== undefined
  )
  const maxDuration = Math.max(...agentTimingEntries.map(([, duration]) => duration), 1)
  const agentTimingsHtml = agentTimingEntries
    .map(([agent, duration]) => renderAgentTimingHtml({ agent, durationMs: duration }, maxDuration))
    .join('\n')

  const findingsSummaryHtml = renderFindingsSummaryHtml(ctx.findings)
  const findingsDetailHtml = renderFindingsDetailHtml(ctx.findings)

  const sparklineData =
    ctx.history.length > 0
      ? ctx.history.map((h) =>
          typeof h.score === 'number' && Number.isFinite(h.score) ? h.score : 0
        )
      : [score]

  return {
    title: projectName,
    timestamp,
    projectName,
    score,
    scoreColor: getScoreColor(score),
    delta: ctx.score.delta,
    deltaText: formatDeltaText(ctx.score.delta),
    executiveSummary: escapeHtml(ctx.synthesis.executiveSummary),
    categoryScoresHtml,
    priorityFixesHtml,
    observationsHtml,
    crossAgentFindingsHtml,
    findingsSummaryHtml,
    findingsDetailHtml,
    sparklineData: JSON.stringify(sparklineData),
    sparklineLabels: JSON.stringify(sparklineData.map((_, i) => `Run ${i + 1}`)),
    agentTimingsHtml,
    durationMs: ctx.swarm.durationMs,
    totalChunks: ctx.swarm.totalChunks,
    totalTokens: ctx.swarm.totalTokensEstimated,
  }
}

function replacePlaceholders(
  template: string,
  data: HtmlTemplateData,
  ctx: ReporterContext
): string {
  const severityGroups = groupBySeverity(ctx.findings)
  const debtCounts = {
    critical: severityGroups.critical.length,
    high: severityGroups.high.length,
    medium: severityGroups.medium.length,
    low: severityGroups.low.length,
  }

  const values: Record<string, string> = {
    TITLE: escapeHtml(data.title),
    TIMESTAMP: escapeHtml(data.timestamp),
    PROJECT_NAME: escapeHtml(data.projectName),
    SCORE: String(data.score),
    SCORE_COLOR: data.scoreColor,
    SCORE_GRADE_CLASS: getScoreGradeClass(data.score),
    // The score circle only ever rendered its CSS grade class (a color), not
    // the actual letter grade text — a viewer had no way to see "B+" etc.
    // without cross-referencing the color against the CSS legend (rep-006).
    SCORE_GRADE: escapeHtml(scoreGrade(data.score)),
    DELTA: String(data.delta),
    DELTA_TEXT: data.deltaText,
    DELTA_CLASS: data.delta > 0 ? 'positive' : data.delta < 0 ? 'negative' : 'neutral',
    EXECUTIVE_SUMMARY: data.executiveSummary,
    // Surface when findings came from a degraded/fallback provider, not the
    // configured primary — mirrors terminal.ts's equivalent warning, which
    // used to be the only reporter that surfaced this (rep-007).
    PROVIDER_FALLBACK_NOTE: (() => {
      const providersUsed = new Set<string>()
      for (const f of ctx.findings) {
        if (f.provider) providersUsed.add(f.provider)
      }
      if (providersUsed.size <= 1) return ''
      return `<div class="provider-fallback-note" style="margin-top:0.75rem;color:var(--accent-yellow,#fbbf24);">⚠ Providers used: ${escapeHtml(Array.from(providersUsed).join(', '))} (some findings from fallback)</div>`
    })(),
    CATEGORY_SCORES: data.categoryScoresHtml,
    PRIORITY_FIXES: data.priorityFixesHtml,
    OBSERVATIONS: data.observationsHtml,
    DEBT_CRITICAL: String(debtCounts.critical),
    DEBT_HIGH: String(debtCounts.high),
    DEBT_MEDIUM: String(debtCounts.medium),
    DEBT_LOW: String(debtCounts.low),
    DEBT_HIGHEST_ROI: ctx.synthesis.debtEstimate.highestROIFix
      ? `<div style="margin-top: 1rem; padding: 1rem; background: #0f1117; border-radius: 6px;"><strong style="color: #3fb950;">Highest ROI:</strong> ${escapeHtml(ctx.synthesis.debtEstimate.highestROIFix)}</div>`
      : '',
    CROSS_AGENT_FINDINGS: data.crossAgentFindingsHtml,
    AGENT_TIMINGS: data.agentTimingsHtml,
    FINDINGS_SUMMARY: data.findingsSummaryHtml + data.findingsDetailHtml,
    SPARKLINE_DATA: data.sparklineData,
    SPARKLINE_LABELS: data.sparklineLabels,
    RUN_ID: escapeHtml(ctx.swarm.runId),
    DURATION: `${(ctx.swarm.durationMs / 1000).toFixed(1)}s`,
    TOTAL_CHUNKS: String(ctx.swarm.totalChunks),
    TOTAL_TOKENS: ctx.swarm.totalTokensEstimated.toLocaleString(),
  }

  // Single pass over the TEMPLATE only. Sequential .replace calls re-scan
  // already-substituted content, so a literal "{{RUN_ID}}" inside LLM-provided
  // text would get overwritten by a later replacement. The callback form also
  // avoids String.replace's `$&`/`$'` replacement-pattern expansion mangling
  // values that contain dollar signs.
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (match, key: string) =>
    key in values ? values[key] : match
  )
}

let htmlServer: Server | null = null
let serverTimeout: ReturnType<typeof setTimeout> | null = null

// How long the local report server stays up before auto-closing. Extracted
// from an inline `10 * 60 * 1000` magic number (rep-002).
export const REPORT_SERVER_TTL_MS = 10 * 60 * 1000

export function writeHtmlReport(ctx: ReporterContext, outputPath: string): ReporterOutput {
  const template = loadTemplate()
  const data = buildTemplateData(ctx)
  const html = replacePlaceholders(template, data, ctx)

  const dir = dirname(outputPath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  writeFileSync(outputPath, html, 'utf-8')

  return {
    format: 'html',
    path: outputPath,
    content: html,
  }
}

export function startLocalServer(
  htmlPath: string,
  // No default here — config/schema.ts's output.port already owns the
  // canonical default (4242), and every real caller (review.ts/diff.ts)
  // already threads config.output.port through. A second hardcoded default
  // here was an unreachable duplicate that could silently drift from the
  // schema's value (rep-001).
  port: number,
  options: { openBrowser?: boolean } = {}
): void {
  if (htmlServer) {
    stopLocalServer()
  }

  const html = readFileSync(htmlPath, 'utf-8')
  const url = `http://127.0.0.1:${port}`

  htmlServer = createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(html)
  })

  htmlServer.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      htmlServer = null
      if (serverTimeout) {
        clearTimeout(serverTimeout)
        serverTimeout = null
      }
      console.log(`Palade report server port ${port} is already in use. Opening file directly...`)
      if (options.openBrowser !== false) {
        // Fallback to opening the local file URI if the server can't start
        const fileUri = `file://${htmlPath.replace(/\\/g, '/')}`
        openBrowser(fileUri).catch(() => {
          console.log(`Open manually: ${htmlPath}`)
        })
      }
    } else {
      console.error(`Failed to start report server: ${err.message}`)
    }
  })

  htmlServer.listen(port, '127.0.0.1', () => {
    // Unref the server so the CLI process can exit without waiting for the
    // 10-minute auto-close timeout.
    htmlServer!.unref()
    console.log(`Palade report server running at ${url}`)
    if (options.openBrowser !== false) {
      // Best-effort: open the report in the user's default browser. Never let
      // a failure here prevent the report from being served.
      openBrowser(url).catch(() => {
        console.log(`Open manually: ${url}`)
      })
    }
  })

  serverTimeout = setTimeout(() => {
    stopLocalServer()
    console.log('Palade report server auto-closed after 10 minutes')
  }, REPORT_SERVER_TTL_MS)
  serverTimeout.unref?.()
}

/**
 * Opens a URL in the default browser. Lazily imports the `open` package so the
 * dependency is only loaded when actually needed, and any environment that
 * can't resolve it simply falls back to printing the URL.
 */
async function openBrowser(url: string): Promise<void> {
  const openModule = await import('open')
  const open = (openModule as { default: (target: string) => Promise<unknown> }).default
  await open(url)
}

function stopLocalServer(): void {
  if (serverTimeout) {
    clearTimeout(serverTimeout)
    serverTimeout = null
  }

  if (htmlServer) {
    htmlServer.close()
    htmlServer = null
  }
}
