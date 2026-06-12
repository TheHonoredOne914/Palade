import chalk from 'chalk'
import ora from 'ora'
import type { ReporterContext, TerminalColors, ReporterOutput } from './types.js'
import type { ScoreCategory, ScoreResult } from '../scorer/types.js'
import type { Severity, AgentFinding } from '../agents/base.js'
import type { FindingDiff, ChangedFile, DiffResult } from '../diff/types.js'

const CATEGORY_LABELS: Record<ScoreCategory, string> = {
  security: 'Security',
  architecture: 'Architecture',
  performance: 'Performance',
  maintainability: 'Maintainability',
  deadCode: 'Dead Code',
  testIntelligence: 'Test Intelligence'
}

const SEVERITY_COLORS: Record<Severity, (text: string) => string> = {
  critical: chalk.red.bold,
  high: chalk.red,
  medium: chalk.yellow,
  low: chalk.blue,
  info: chalk.gray
}

function getScoreColor(score: number): (text: string) => string {
  if (score >= 90) return chalk.green.bold
  if (score >= 75) return chalk.green
  if (score >= 60) return chalk.yellow
  if (score >= 40) return chalk.red
  return chalk.red.bold
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

function formatDelta(delta: number): string {
  if (delta === 0) return chalk.gray('  +0')
  if (delta > 0) return chalk.green(`  +${delta}`)
  return chalk.red(`  ${delta}`)
}

function createColors(): TerminalColors {
  return {
    score: getScoreColor(0),
    critical: SEVERITY_COLORS.critical,
    high: SEVERITY_COLORS.high,
    medium: SEVERITY_COLORS.medium,
    low: SEVERITY_COLORS.low,
    info: SEVERITY_COLORS.info,
    dim: chalk.gray,
    bold: chalk.bold,
    success: chalk.green,
    warning: chalk.yellow
  }
}

function renderScoreBar(score: number, width: number = 20): string {
  const filled = Math.round((score / 100) * width)
  const empty = width - filled
  const color = getScoreColor(score)
  return color('█'.repeat(filled)) + chalk.gray('░'.repeat(empty))
}

function renderCategoryScore(category: string, score: number, findingCount: number): string {
  const color = getScoreColor(score)
  const bar = renderScoreBar(score, 10)
  return `  ${chalk.bold(category.padEnd(20))} ${bar} ${color(score.toString().padStart(3))} ${chalk.gray(`(${findingCount} findings)`)}`
}

function renderFinding(finding: { severity: Severity; title: string; filePath?: string; lineStart?: number }): string {
  const severityColor = SEVERITY_COLORS[finding.severity]
  const location = finding.filePath 
    ? chalk.gray(` → ${finding.filePath}${finding.lineStart ? `:${finding.lineStart}` : ''}`)
    : ''
  return `    ${severityColor(finding.severity.toUpperCase().padEnd(8))} ${finding.title}${location}`
}

export async function reportTerminal(ctx: ReporterContext): Promise<ReporterOutput> {
  const colors = createColors()
  const lines: string[] = []
  
  lines.push('')
  lines.push(chalk.bold.blue('╔══════════════════════════════════════════════════════════════╗'))
  lines.push(chalk.bold.blue('║                    PALADE ANALYSIS REPORT                   ║'))
  lines.push(chalk.bold.blue('╚══════════════════════════════════════════════════════════════╝'))
  lines.push('')
  
  const scoreColor = getScoreColor(ctx.score.score)
  const grade = getScoreGrade(ctx.score.score)
  lines.push(`${chalk.bold('Overall Score:')} ${scoreColor(ctx.score.score.toString())} ${chalk.gray(`/ 100`)} ${chalk.bold(`(${grade})`)}`)
  lines.push(`${chalk.bold('Score Delta:')} ${formatDelta(ctx.score.delta)}`)
  lines.push('')
  
  lines.push(chalk.bold.underline('Category Breakdown:'))
  for (const cat of ctx.score.breakdown.categories) {
    lines.push(renderCategoryScore(CATEGORY_LABELS[cat.category], cat.score, cat.findingCount))
  }
  lines.push('')
  
  const criticalFindings = ctx.findings.filter(f => f.severity === 'critical')
  const highFindings = ctx.findings.filter(f => f.severity === 'high')
  
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
      lines.push(`     ${chalk.yellow(`~${fix.estimatedHours}h`)} → ${chalk.gray(fix.affectedFiles.join(', '))}`)
    }
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
  lines.push(`  Critical: ${chalk.red(debt.critical.toString())} | High: ${chalk.yellow(debt.high.toString())} | Medium: ${chalk.blue(debt.medium.toString())} | Low: ${chalk.gray(debt.low.toString())}`)
  lines.push(`  Total: ${chalk.bold(debt.total.toString())} findings`)
  if (debt.highestROIFix) {
    lines.push(`  Highest ROI: ${chalk.green(debt.highestROIFix)}`)
  }
  lines.push('')
  
  lines.push(chalk.dim(`Run ID: ${ctx.swarm.runId}`))
  lines.push(chalk.dim(`Duration: ${(ctx.swarm.durationMs / 1000).toFixed(1)}s | Chunks: ${ctx.swarm.totalChunks} | Tokens: ${ctx.swarm.totalTokensEstimated.toLocaleString()}`))
  lines.push('')
  
  const content = lines.join('\n')
  console.log(content)
  
  return {
    format: 'terminal',
    content
  }
}

export function printDiffBanner(ctx: {
  projectName: string
  headBranch: string
  baseBranch: string
  changedCount: number
  additions: number
  deletions: number
}): void {
  console.log('')
  console.log(chalk.bold.blue('╔══════════════════════════════════════════════════════════════╗'))
  console.log(chalk.bold.blue('║                     PALADE DIFF REVIEW                      ║'))
  console.log(chalk.bold.blue('╚══════════════════════════════════════════════════════════════╝'))
  console.log('')
  console.log(`  ${chalk.bold('Project:')}   ${ctx.projectName}`)
  console.log(`  ${chalk.bold('Comparing:')} ${chalk.cyan(ctx.headBranch)} → ${chalk.gray(ctx.baseBranch)}`)
  console.log(`  ${chalk.bold('Changed:')}   ${ctx.changedCount} files  ${chalk.green(`(+${ctx.additions})`)} ${chalk.red(`(-${ctx.deletions})`)}`)
  console.log('')
}

export function printDiffSummary(ctx: {
  score: ScoreResult
  findingDiff: FindingDiff
  changedFiles: ChangedFile[]
  baseBranch: string
  headBranch: string
  hasCriticalIntroduced: boolean
  durationMs: number
}): void {
  const { score, findingDiff, changedFiles, baseBranch, hasCriticalIntroduced, durationMs } = ctx

  console.log(chalk.gray('─'.repeat(50)))

  const scoreColor = getScoreColor(score.score)
  const deltaStr =
    score.delta === 0
      ? chalk.gray('  +0')
      : score.delta > 0
        ? chalk.green(`  +${score.delta}`)
        : chalk.red(`  ${score.delta}`)

  console.log(
    `  ${chalk.bold('Diff Score:')}  ${scoreColor(score.score.toString())} ${chalk.gray('/ 100')} ${chalk.bold(`(delta: ${deltaStr} vs ${baseBranch})`)}`
  )
  console.log('')
  console.log(`  Findings in changed files: ${chalk.bold(String(findingDiff.introduced.length))} total`)

  const critical = findingDiff.introduced.filter((f) => f.severity === 'critical')
  const high = findingDiff.introduced.filter((f) => f.severity === 'high')
  const medium = findingDiff.introduced.filter((f) => f.severity === 'medium')

  if (critical.length > 0) {
    console.log(`    ${SEVERITY_COLORS.critical('Critical introduced:')} ${critical.length}`)
  }
  if (high.length > 0) {
    console.log(`    ${SEVERITY_COLORS.high('High introduced:')}     ${high.length}`)
  }
  if (medium.length > 0) {
    console.log(`    ${SEVERITY_COLORS.medium('Medium introduced:')}   ${medium.length}`)
  }

  // Print critical findings inline (max 3)
  if (critical.length > 0) {
    console.log('')
    console.log(chalk.red.bold(`  ⚠ ${critical.length} critical finding(s) introduced:`))
    for (const f of critical.slice(0, 3)) {
      const loc = f.filePath ? chalk.gray(` → ${f.filePath}${f.lineStart ? `:${f.lineStart}` : ''}`) : ''
      console.log(`    ${chalk.red(f.title)}${loc}`)
    }
    if (critical.length > 3) {
      console.log(chalk.gray(`    ... and ${critical.length - 3} more`))
    }
  }

  console.log('')
  console.log(chalk.dim(`  Report:  .palade/reports/diff-*`))
  console.log(chalk.gray('─'.repeat(50)))
  console.log(chalk.dim(`  Total time: ${(durationMs / 1000).toFixed(1)}s`))
  console.log('')
}
