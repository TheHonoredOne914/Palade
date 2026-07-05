import chalk from 'chalk'
import type { ReporterContext, ReporterOutput } from './types.js'
import type { ScoreResult } from '../scorer/types.js'
import type { Severity } from '../agents/base.js'
import type { FindingDiff, ChangedFile } from '../diff/types.js'
import { CATEGORY_LABELS } from '../scorer/types.js'
import { scoreTheme } from '../ui/theme.js'
import { scoreGrade } from '../ui/layout.js'

const SEVERITY_COLORS: Record<Severity, (text: string) => string> = {
  critical: chalk.red.bold,
  high: chalk.red,
  medium: chalk.yellow,
  low: chalk.blue,
  info: chalk.gray,
}

function formatDelta(delta: number): string {
  if (delta === 0) return chalk.gray('  +0')
  if (delta > 0) return chalk.green(`  +${delta}`)
  return chalk.red(`  ${delta}`)
}

function renderScoreBar(score: number, width: number = 20): string {
  const clamped = Math.max(0, Math.min(100, score))
  const filled = Math.round((clamped / 100) * width)
  const empty = width - filled
  const color = scoreTheme(clamped)
  return color('█'.repeat(filled)) + chalk.gray('░'.repeat(empty))
}

function renderCategoryScore(category: string, score: number, findingCount: number): string {
  const color = scoreTheme(score)
  const bar = renderScoreBar(score, 10)
  return `  ${chalk.bold(category.padEnd(20))} ${bar} ${color(score.toString().padStart(3))} ${chalk.gray(`(${findingCount} findings)`)}`
}

function renderFinding(finding: {
  severity: Severity
  title: string
  filePath?: string
  lineStart?: number
}): string {
  const severityColor = SEVERITY_COLORS[finding.severity]
  const location = finding.filePath
    ? chalk.gray(` → ${finding.filePath}${finding.lineStart ? `:${finding.lineStart}` : ''}`)
    : ''
  return `    ${severityColor(finding.severity.toUpperCase().padEnd(8))} ${finding.title}${location}`
}

export async function reportTerminal(ctx: ReporterContext): Promise<ReporterOutput> {
  const lines: string[] = []

  lines.push('')
  lines.push(chalk.bold.blue('╔══════════════════════════════════════════════════════════════╗'))
  lines.push(chalk.bold.blue('║                    PALADE ANALYSIS REPORT                   ║'))
  lines.push(chalk.bold.blue('╚══════════════════════════════════════════════════════════════╝'))
  lines.push('')

  const scoreColor = scoreTheme(ctx.score.score)
  const grade = scoreGrade(ctx.score.score)
  lines.push(
    `${chalk.bold('Overall Score:')} ${scoreColor(ctx.score.score.toString())} ${chalk.gray(`/ 100`)} ${chalk.bold(`(${grade})`)}`
  )
  lines.push(`${chalk.bold('Score Delta:')} ${formatDelta(ctx.score.delta)}`)
  lines.push('')

  lines.push(chalk.bold.underline('Category Breakdown:'))
  for (const cat of ctx.score.breakdown.categories) {
    const label =
      CATEGORY_LABELS[cat.category] ?? cat.category.charAt(0).toUpperCase() + cat.category.slice(1)
    lines.push(renderCategoryScore(label, cat.score, cat.findingCount))
  }
  lines.push('')

  const criticalFindings = ctx.findings.filter((f) => f.severity === 'critical')
  const highFindings = ctx.findings.filter((f) => f.severity === 'high')

  if (criticalFindings.length > 0) {
    lines.push(chalk.red.bold(`⚠ ${criticalFindings.length} Critical Finding(s):`))
    for (const f of criticalFindings.slice(0, 5)) {
      lines.push(renderFinding(f))
    }
    if (criticalFindings.length > 5) {
      lines.push(chalk.gray(`    ... and ${criticalFindings.length - 5} more`))
    }
    lines.push('')
  }

  if (highFindings.length > 0) {
    lines.push(chalk.yellow.bold(`⚠ ${highFindings.length} High Finding(s):`))
    for (const f of highFindings.slice(0, 5)) {
      lines.push(renderFinding(f))
    }
    if (highFindings.length > 5) {
      lines.push(chalk.gray(`    ... and ${highFindings.length - 5} more`))
    }
    lines.push('')
  }

  if (ctx.synthesis.priorityFixes.length > 0) {
    lines.push(chalk.bold.underline('Priority Fixes:'))
    for (const fix of ctx.synthesis.priorityFixes.slice(0, 3)) {
      lines.push(`  ${chalk.bold(`#${fix.rank}`)} ${chalk.cyan(fix.title)}`)
      lines.push(`     ${chalk.gray(fix.rationale)}`)
      lines.push(
        `     ${chalk.yellow(`~${fix.estimatedHours}h`)} → ${chalk.gray(fix.affectedFiles.join(', '))}`
      )
    }
    lines.push('')
  }

  // Surface when findings came from a degraded/fallback source, not the
  // configured primary provider. This is the R2 tagging contract: specialists
  // stamp each finding with the actual provider/model that answered.
  const providersUsed = new Set<string>()
  for (const f of ctx.findings) {
    if (f.provider) providersUsed.add(f.provider)
  }
  if (providersUsed.size > 1) {
    const providerList = Array.from(providersUsed).join(', ')
    lines.push(chalk.yellow.bold(`⚠ Providers used: ${providerList} (some findings from fallback)`))
    lines.push('')
  }

  if (ctx.synthesis.crossCuttingObservations.length > 0) {
    lines.push(chalk.bold.underline('Cross-Cutting Observations:'))
    for (const obs of ctx.synthesis.crossCuttingObservations.slice(0, 3)) {
      lines.push(`  • ${obs}`)
    }
    lines.push('')
  }

  lines.push(chalk.bold.underline('Debt Estimate:'))
  const debt = ctx.synthesis.debtEstimate
  const debtCounts = { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: 0 }
  for (const f of ctx.findings) {
    if (f.severity === 'critical') debtCounts.critical++
    if (f.severity === 'high') debtCounts.high++
    if (f.severity === 'medium') debtCounts.medium++
    if (f.severity === 'low') debtCounts.low++
    if (f.severity === 'info') debtCounts.info++
    debtCounts.total++
  }

  lines.push(
    `  Critical: ${chalk.red(debtCounts.critical.toString())} | High: ${chalk.yellow(debtCounts.high.toString())} | Medium: ${chalk.blue(debtCounts.medium.toString())} | Low: ${chalk.gray(debtCounts.low.toString())} | Info: ${chalk.gray(debtCounts.info.toString())}`
  )
  lines.push(`  Total: ${chalk.bold(debtCounts.total.toString())} findings`)
  if (debt.highestROIFix) {
    lines.push(`  Highest ROI: ${chalk.green(debt.highestROIFix)}`)
  }
  lines.push('')

  lines.push(chalk.dim(`Run ID: ${ctx.swarm.runId}`))
  lines.push(
    chalk.dim(
      `Duration: ${(ctx.swarm.durationMs / 1000).toFixed(1)}s | Chunks: ${ctx.swarm.totalChunks} | Tokens: ${ctx.swarm.totalTokensEstimated.toLocaleString()}`
    )
  )
  lines.push('')

  const content = lines.join('\n')

  return {
    format: 'terminal',
    content,
  }
}

export function printDiffBanner(ctx: {
  projectName: string
  headBranch: string
  baseBranch: string
  changedCount: number
  additions: number
  deletions: number
}): string {
  const lines: string[] = []
  lines.push('')
  lines.push(chalk.bold.blue('╔══════════════════════════════════════════════════════════════╗'))
  lines.push(chalk.bold.blue('║                     PALADE DIFF REVIEW                      ║'))
  lines.push(chalk.bold.blue('╚══════════════════════════════════════════════════════════════╝'))
  lines.push('')
  lines.push(`  ${chalk.bold('Project:')}   ${ctx.projectName}`)
  lines.push(
    `  ${chalk.bold('Comparing:')} ${chalk.cyan(ctx.headBranch)} → ${chalk.gray(ctx.baseBranch)}`
  )
  lines.push(
    `  ${chalk.bold('Changed:')}   ${ctx.changedCount} files  ${chalk.green(`(+${ctx.additions})`)} ${chalk.red(`(-${ctx.deletions})`)}`
  )
  lines.push('')
  return lines.join('\n')
}

export function printDiffSummary(ctx: {
  score: ScoreResult
  findingDiff: FindingDiff
  changedFiles: ChangedFile[]
  baseBranch: string
  headBranch: string
  hasCriticalIntroduced: boolean
  durationMs: number
}): string {
  const { score, findingDiff, baseBranch, durationMs } = ctx
  const lines: string[] = []

  lines.push(chalk.gray('─'.repeat(50)))

  const scoreColor = scoreTheme(score.score)
  const deltaStr =
    score.delta === 0
      ? chalk.gray('  +0')
      : score.delta > 0
        ? chalk.green(`  +${score.delta}`)
        : chalk.red(`  ${score.delta}`)

  lines.push(
    `  ${chalk.bold('Diff Score:')}  ${scoreColor(score.score.toString())} ${chalk.gray('/ 100')} ${chalk.bold(`(delta: ${deltaStr} vs ${baseBranch})`)}`
  )
  lines.push('')
  lines.push(
    `  Findings in changed files: ${chalk.bold(String(findingDiff.introduced.length))} total`
  )

  const critical = findingDiff.introduced.filter((f) => f.severity === 'critical')
  const high = findingDiff.introduced.filter((f) => f.severity === 'high')
  const medium = findingDiff.introduced.filter((f) => f.severity === 'medium')

  if (critical.length > 0) {
    lines.push(`    ${SEVERITY_COLORS.critical('Critical introduced:')} ${critical.length}`)
  }
  if (high.length > 0) {
    lines.push(`    ${SEVERITY_COLORS.high('High introduced:')}     ${high.length}`)
  }
  if (medium.length > 0) {
    lines.push(`    ${SEVERITY_COLORS.medium('Medium introduced:')}   ${medium.length}`)
  }

  // Print critical findings inline (max 3)
  if (critical.length > 0) {
    lines.push('')
    lines.push(chalk.red.bold(`  ⚠ ${critical.length} critical finding(s) introduced:`))
    for (const f of critical.slice(0, 3)) {
      const loc = f.filePath
        ? chalk.gray(` → ${f.filePath}${f.lineStart ? `:${f.lineStart}` : ''}`)
        : ''
      lines.push(`    ${chalk.red(f.title)}${loc}`)
    }
    if (critical.length > 3) {
      lines.push(chalk.gray(`    ... and ${critical.length - 3} more`))
    }
  }

  lines.push('')
  lines.push(chalk.dim(`  Report:  .palade/reports/diff-*`))
  lines.push(chalk.gray('─'.repeat(50)))
  lines.push(chalk.dim(`  Total time: ${(durationMs / 1000).toFixed(1)}s`))
  lines.push('')

  return lines.join('\n')
}
