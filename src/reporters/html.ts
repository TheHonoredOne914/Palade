import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createServer, type Server } from 'node:http'
import type { ReporterContext, ReporterOutput, HtmlTemplateData } from './types.js'
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

const SEVERITY_CLASSES: Record<Severity, string> = {
  critical: 'severity-critical',
  high: 'severity-high',
  medium: 'severity-medium',
  low: 'severity-low',
  info: 'severity-low'
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

function getScoreGradeClass(score: number): string {
  if (score >= 80) return 'grade-a'
  if (score >= 60) return 'grade-b'
  if (score >= 40) return 'grade-c'
  if (score >= 20) return 'grade-d'
  return 'grade-f'
}

function getScoreColor(score: number): string {
  if (score >= 90) return '#3fb950'
  if (score >= 75) return '#3fb950'
  if (score >= 60) return '#d29922'
  if (score >= 40) return '#db61a2'
  return '#f85149'
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

function renderCategoryScoreHtml(category: ScoreCategory, score: number, findingCount: number): string {
  const color = getScoreColor(score)
  return `
        <div class="category-item">
          <div class="category-name">${CATEGORY_LABELS[category]}</div>
          <div class="category-bar">
            <div class="category-bar-fill" style="width: ${score}%; background: ${color};"></div>
          </div>
          <div class="category-score" style="color: ${color};">${score}</div>
        </div>`
}

function renderPriorityFixHtml(fix: { rank: number; title: string; rationale: string; estimatedHours: number; affectedFiles: string[] }): string {
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

function renderCrossAgentFindingHtml(finding: { title: string; description: string; agents: string[]; filePaths: string[]; severity: string }): string {
  const severityClass = SEVERITY_CLASSES[finding.severity as Severity] ?? 'severity-low'
  const location = finding.filePaths.length > 0 
    ? `<div class="finding-location">${finding.filePaths.map(escapeHtml).join(', ')}</div>`
    : ''
  
  return `
        <li class="finding-item">
          <div class="finding-header">
            <span class="finding-severity ${severityClass}">${finding.severity}</span>
            <span class="finding-title">${escapeHtml(finding.title)}</span>
            ${location}
          </div>
          <div class="finding-description">${escapeHtml(finding.description)}</div>
        </li>`
}

function renderAgentTimingHtml(timing: { agent: string; durationMs: number }, maxDuration: number): string {
  const width = maxDuration > 0 ? (timing.durationMs / maxDuration) * 100 : 0
  return `
      <div class="agent-timing">
        <div class="agent-name">${timing.agent}</div>
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
  
  const rows = Array.from(byAgent.entries()).map(([agent, counts]) => {
    return `
        <tr>
          <td>${agent}</td>
          <td>${counts.total}</td>
          <td style="color: #f85149;">${counts.critical}</td>
          <td style="color: #d29922;">${counts.high}</td>
        </tr>`
  }).join('')
  
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

function getTemplatePath(): string {
  const possiblePaths = [
    join(process.cwd(), 'templates', 'report.html'),
    join(process.cwd(), 'node_modules', 'palade', 'templates', 'report.html'),
  ]
  
  for (const p of possiblePaths) {
    if (existsSync(p)) return p
  }
  
  return join(__dirname, '..', '..', '..', 'templates', 'report.html')
}

function loadTemplate(): string {
  const templatePath = getTemplatePath()
  return readFileSync(templatePath, 'utf-8')
}

function buildTemplateData(ctx: ReporterContext): HtmlTemplateData {
  const projectName = ctx.config?.projectName ?? 'Project'
  const timestamp = ctx.config?.runTimestamp ?? new Date().toISOString()
  const score = ctx.score.score
  const grade = getScoreGrade(score)
  const gradeClass = getScoreGradeClass(score)
  
  const categoryScoresHtml = ctx.score.breakdown.categories
    .map(c => renderCategoryScoreHtml(c.category, c.score, c.findingCount))
    .join('\n')
  
  const priorityFixesHtml = ctx.synthesis.priorityFixes
    .map(f => renderPriorityFixHtml(f))
    .join('\n')
  
  const observationsHtml = ctx.synthesis.crossCuttingObservations
    .map(o => renderObservationHtml(o))
    .join('\n')
  
  const crossAgentFindingsHtml = ctx.crossAgentFindings
    .map(f => renderCrossAgentFindingHtml(f))
    .join('\n')
  
  const maxDuration = Math.max(...Object.values(ctx.swarm.agentTimings), 1)
  const agentTimingsHtml = Object.entries(ctx.swarm.agentTimings)
    .map(([agent, duration]) => renderAgentTimingHtml({ agent, durationMs: duration }, maxDuration))
    .join('\n')
  
  const findingsSummaryHtml = renderFindingsSummaryHtml(ctx.findings)
  
  const sparklineData = ctx.history.length > 0 
    ? ctx.history.map(h => h.score) 
    : [score]
  
  return {
    title: projectName,
    timestamp,
    projectName,
    score,
    scoreColor: getScoreColor(score),
    scoreGrade: grade,
    delta: ctx.score.delta,
    deltaText: formatDeltaText(ctx.score.delta),
    executiveSummary: escapeHtml(ctx.synthesis.executiveSummary),
    categoryScoresHtml,
    priorityFixesHtml,
    crossAgentFindingsHtml,
    findingsSummaryHtml,
    debtEstimateHtml: '',
    sparklineData: JSON.stringify(sparklineData),
    sparklineLabels: JSON.stringify(sparklineData.map((_, i) => `Run ${i + 1}`)),
    agentTimingsHtml,
    durationMs: ctx.swarm.durationMs,
    totalChunks: ctx.swarm.totalChunks,
    totalTokens: ctx.swarm.totalTokensEstimated
  }
}

function replacePlaceholders(template: string, data: HtmlTemplateData, ctx: ReporterContext): string {
  let result = template
  
  result = result.replace(/\{\{TITLE\}\}/g, data.title)
  result = result.replace(/\{\{TIMESTAMP\}\}/g, data.timestamp)
  result = result.replace(/\{\{PROJECT_NAME\}\}/g, data.projectName)
  result = result.replace(/\{\{SCORE\}\}/g, String(data.score))
  result = result.replace(/\{\{SCORE_COLOR\}\}/g, data.scoreColor)
  result = result.replace(/\{\{SCORE_GRADE\}\}/g, data.scoreGrade)
  result = result.replace(/\{\{SCORE_GRADE_CLASS\}\}/g, getScoreGradeClass(data.score))
  result = result.replace(/\{\{DELTA\}\}/g, String(data.delta))
  result = result.replace(/\{\{DELTA_TEXT\}\}/g, data.deltaText)
  result = result.replace(/\{\{DELTA_CLASS\}\}/g, data.delta > 0 ? 'positive' : data.delta < 0 ? 'negative' : 'neutral')
  result = result.replace(/\{\{EXECUTIVE_SUMMARY\}\}/g, data.executiveSummary)
  result = result.replace(/\{\{CATEGORY_SCORES\}\}/g, data.categoryScoresHtml)
  result = result.replace(/\{\{PRIORITY_FIXES\}\}/g, data.priorityFixesHtml)
  result = result.replace(/\{\{OBSERVATIONS\}\}/g, data.crossAgentFindingsHtml)
  result = result.replace(/\{\{DEBT_CRITICAL\}\}/g, String(ctx.synthesis.debtEstimate.critical))
  result = result.replace(/\{\{DEBT_HIGH\}\}/g, String(ctx.synthesis.debtEstimate.high))
  result = result.replace(/\{\{DEBT_MEDIUM\}\}/g, String(ctx.synthesis.debtEstimate.medium))
  result = result.replace(/\{\{DEBT_LOW\}\}/g, String(ctx.synthesis.debtEstimate.low))
  result = result.replace(/\{\{DEBT_HIGHEST_ROI\}\}/g, ctx.synthesis.debtEstimate.highestROIFix 
    ? `<div style="margin-top: 1rem; padding: 1rem; background: #0f1117; border-radius: 6px;"><strong style="color: #3fb950;">Highest ROI:</strong> ${escapeHtml(ctx.synthesis.debtEstimate.highestROIFix)}</div>`
    : '')
  result = result.replace(/\{\{CROSS_AGENT_FINDINGS\}\}/g, data.crossAgentFindingsHtml)
  result = result.replace(/\{\{AGENT_TIMINGS\}\}/g, data.agentTimingsHtml)
  result = result.replace(/\{\{FINDINGS_SUMMARY\}\}/g, data.findingsSummaryHtml)
  result = result.replace(/\{\{SPARKLINE_DATA\}\}/g, data.sparklineData)
  result = result.replace(/\{\{SPARKLINE_LABELS\}\}/g, data.sparklineLabels)
  result = result.replace(/\{\{RUN_ID\}\}/g, ctx.swarm.runId)
  result = result.replace(/\{\{DURATION\}\}/g, `${(ctx.swarm.durationMs / 1000).toFixed(1)}s`)
  result = result.replace(/\{\{TOTAL_CHUNKS\}\}/g, String(ctx.swarm.totalChunks))
  result = result.replace(/\{\{TOTAL_TOKENS\}\}/g, ctx.swarm.totalTokensEstimated.toLocaleString())
  
  return result
}

let htmlServer: Server | null = null
let serverTimeout: ReturnType<typeof setTimeout> | null = null

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
    content: html
  }
}

export function startLocalServer(htmlPath: string, port: number = 4242): void {
  if (htmlServer) {
    stopLocalServer()
  }
  
  const html = readFileSync(htmlPath, 'utf-8')
  
  htmlServer = createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(html)
  })
  
  htmlServer.listen(port, '127.0.0.1', () => {
    console.log(`Palade report server running at http://127.0.0.1:${port}`)
  })
  
  serverTimeout = setTimeout(() => {
    stopLocalServer()
    console.log('Palade report server auto-closed after 10 minutes')
  }, 10 * 60 * 1000)
}

export function stopLocalServer(): void {
  if (serverTimeout) {
    clearTimeout(serverTimeout)
    serverTimeout = null
  }
  
  if (htmlServer) {
    htmlServer.close()
    htmlServer = null
  }
}
