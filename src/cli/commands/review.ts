import crypto from 'node:crypto'
import { loadConfig } from '../../config/loader.js'
import { initRouter } from '../../providers/router.js'
import { loadTargets, resolveTargetPaths } from '../../targets/loader.js'
import { launchPicker } from '../picker.js'
import { runPipeline } from '../../orchestrator/pipeline.js'
import { calculateScore } from '../../scorer/calculator.js'
import { readHistory, appendEntry } from '../../scorer/history.js'
import { renderBadge, getScoreColor } from '../../scorer/badge.js'
import { reportJson } from '../../reporters/json.js'
import { writeHtmlReport, startLocalServer } from '../../reporters/html.js'
import { reportMarkdown } from '../../reporters/markdown.js'
import { validateMode, getModeConfig } from '../../modes/index.js'
import { writeOnboardDocs } from '../../modes/onboard.js'
import { createLiveProgress } from '../../ui/progress.js'
import { theme, scoreTheme } from '../../ui/theme.js'
import {
  kvTable,
  findingsTable,
  divider,
  sparkline,
  sectionBox,
  scoreGrade,
  formatDelta,
} from '../../ui/layout.js'
import type { ScopeOptions } from '../../ingestion/types.js'
import type { AgentName } from '../../agents/base.js'
import type { ResolvedTarget } from '../../orchestrator/types.js'
import { resolveSymbol } from '../../ingestion/symbolResolver.js'
import { groupBySeverity } from '../../orchestrator/merger.js'
import { CliExitError } from '../../errors/types.js'
import chalk from 'chalk'
import { mkdirSync, existsSync, statSync } from 'node:fs'
import { join, basename, dirname, isAbsolute, resolve, relative, sep } from 'node:path'

interface ReviewOptions {
  target?: string
  allTargets?: boolean
  dir?: string
  file?: string[]
  glob?: string
  mode?: string
  annotations?: boolean
  pick?: boolean
  depth?: number
  format?: string
  open?: boolean
  quiet?: boolean
}

export async function reviewCommand(
  pathArg: string | undefined,
  opts: ReviewOptions
): Promise<void> {
  // Parse file::symbol syntax
  let symbolFilter: string | undefined
  let rawPath = pathArg ?? ''
  if (rawPath.includes('::')) {
    const parts = rawPath.split('::')
    rawPath = parts[0]
    symbolFilter = parts[1]
  }

  const resolvedPath = rawPath
    ? (isAbsolute(rawPath) ? rawPath : resolve(process.cwd(), rawPath))
    : process.cwd()

  if (!existsSync(resolvedPath)) {
    console.error(chalk.red(`Path does not exist: ${resolvedPath}`))
    throw new CliExitError(1)
  }

  // Detect if path is a file or directory
  let projectRoot: string
  let singleFile: string | undefined
  const pathStat = statSync(resolvedPath)
  if (pathStat.isFile()) {
    projectRoot = dirname(resolvedPath)
    singleFile = basename(resolvedPath)
  } else {
    projectRoot = resolvedPath
  }

  // Resolve symbol if :: syntax used
  let resolvedSymbolChunk = undefined
  if (symbolFilter) {
    const symbolRef = rawPath ? `${rawPath}::${symbolFilter}` : `${process.cwd()}::${symbolFilter}`
    const chunk = await resolveSymbol(symbolRef, process.cwd())
    if (!chunk) {
      console.error(chalk.red(`  Symbol '${symbolFilter}' not found in ${rawPath || '.'}`))
      throw new CliExitError(1)
    }
    resolvedSymbolChunk = chunk
    console.log(theme.success(`  ✓ Resolved symbol: ${chunk.filePath}:${chunk.startLine}-${chunk.endLine}`))
  }

  // 1. Load config + init providers
  const config = await loadConfig()
  await initRouter(config)

  // 2. Load targets
  const allTargets = await loadTargets(projectRoot)

  // 3. Validate mode
  const mode = validateMode(opts.mode ?? 'standard')
  const modeConfig = getModeConfig(mode)

  // 3b. Ghost mode banner
  if (mode === 'ghost') {
    const { printGhostBanner } = await import('../../ui/banner.js')
    printGhostBanner()
  }

  // 4. Build scope
  const normalizeDir = (d: string): string => {
    const absDir = isAbsolute(d) ? d : resolve(projectRoot, d)
    return relative(projectRoot, absDir).split(sep).join('/')
  }
  const scopeFiles = singleFile
    ? [singleFile]
    : opts.file && opts.file.length > 0
      ? opts.file.map(f => isAbsolute(f) ? relative(projectRoot, f).split(sep).join('/') : f)
      : undefined
  const scope: ScopeOptions = {
    projectRoot,
    dirs: opts.dir ? [normalizeDir(opts.dir)] : undefined,
    files: scopeFiles,
    globs: opts.glob ? [opts.glob] : undefined,
    annotationsOnly: opts.annotations ?? false,
    symbolChunks: resolvedSymbolChunk ? [resolvedSymbolChunk] : undefined,
  }

  // 5. Handle --pick
  let resolvedTarget: ResolvedTarget | undefined = undefined
  if (opts.pick) {
    const allManifests = await import('../../ingestion/walker.js').then((m) =>
      m.walkProject(projectRoot, { projectRoot })
    )
    const selectedPaths = await launchPicker(projectRoot, allManifests)
    if (selectedPaths.length === 0) {
      if (!process.stdin.isTTY) {
        console.log(theme.dim('  --pick requires an interactive terminal. Reviewing all files.'))
      } else {
        console.log(theme.dim('  No files selected.'))
        return
      }
    } else {
      scope.files = selectedPaths
    }
  }

  // 6. Handle --target
  if (opts.target) {
    const match = allTargets.find((t) => t.name === opts.target)
    if (!match) {
      console.error(
        chalk.red(
          `Target "${opts.target}" not found. Available: ${allTargets.map((t) => t.name).join(', ') || '(none)'}`
        )
      )
      throw new CliExitError(1)
    }
    console.log(theme.accent(`  Running review for target: ${match.name}`))
    resolvedTarget = {
      definition: match,
      resolvedPaths: resolveTargetPaths(match, projectRoot),
    }
  }

  // 7. Print run header
  if (!opts.quiet) {
    const rows: [string, string][] = [
      ['Project:', `${theme.white(basename(projectRoot))}`],
      ['Mode:', theme.accent(mode)],
      ['Scope:', theme.dim(opts.target ? `target: ${opts.target}` : opts.dir ? `dir: ${opts.dir}` : 'full codebase')],
      ['Swarm:', `${theme.white(config.swarm.primary)} → ${config.swarm.agentCount} agents`],
      ['Synthesis:', theme.white(config.swarm.synthesis)],
    ]
    if (opts.annotations) {
      rows.push(['Annotations:', theme.warning('only annotated items')])
    }
    console.log(kvTable(rows))
    console.log()
  }

  // 8. Run pipeline with progress
  const agentCount = config.swarm.agentCount
  let completedAgents = 0
  const progress = opts.quiet
    ? undefined
    : createLiveProgress()

  const swarmResult = await runPipeline({
    projectRoot,
    scope,
    context: {
      projectLanguages: [],
      totalFiles: 0,
      totalChunks: 0,
      mode,
      modeConfig,
    },
    swarmOptions: {
      onAgentStart: (name: AgentName): void => {
        progress?.agentStart(name)
      },
      onAgentComplete: (
        name: AgentName,
        findings: number,
        durationMs: number
      ): void => {
        completedAgents++
        progress?.agentDone(name, findings, durationMs)
      },
      onSynthesisStart: (): void => {
        progress?.synthesisStart(config.swarm.synthesis)
      },
      onSynthesisComplete: (durationMs: number): void => {
        progress?.synthesisDone(durationMs)
      },
      timeoutMs: config.swarm.timeoutMs,
      maxReviewTokens: config.swarm.maxReviewTokens,
    },
    target: resolvedTarget,
  })

  progress?.stop()

  // 9. Calculate score
  const historyPath = join(projectRoot, config.score.historyFile)
  const previousScore = (() => {
    try {
      const entries = readHistory(historyPath)
      return entries.length > 0 ? entries[entries.length - 1].score : null
    } catch {
      return null
    }
  })()

  const scoreResult = calculateScore(
    swarmResult.findings,
    swarmResult.crossAgentFindings,
    previousScore
  )

  // 10. Append to history
  appendEntry(historyPath, {
    timestamp: new Date().toISOString(),
    runId: swarmResult.runId,
    score: scoreResult.score,
    breakdown: scoreResult.breakdown,
    delta: scoreResult.delta,
  })

  // 11. Generate badge
  if (config.score.badge) {
    const badgeSvg = renderBadge({
      score: scoreResult.score,
      color: getScoreColor(scoreResult.score),
      label: 'palade',
    })
    const badgePath = join(projectRoot, config.score.badgePath)
    const badgeDir = join(badgePath, '..')
    if (!existsSync(badgeDir)) mkdirSync(badgeDir, { recursive: true })
    const { writeFileSync } = await import('node:fs')
    writeFileSync(badgePath, badgeSvg, 'utf-8')
  }

  // 12. Generate reports
  const outputDir = join(projectRoot, config.output.dir)
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true })

  const dateStr = new Date().toISOString().slice(0, 10)
  const runId = crypto.randomBytes(3).toString('hex') // 6-char hex, avoids same-day collisions
  const reportName = `${dateStr}-${scoreResult.score}-${runId}`
  const formats = (opts.format ?? config.output.formats.join(','))
    .split(',')
    .map((f) => f.trim())

  const reporterCtx = {
    score: scoreResult,
    swarm: swarmResult,
    synthesis: swarmResult.synthesis,
    findings: swarmResult.findings,
    crossAgentFindings: swarmResult.crossAgentFindings,
    history: readHistory(historyPath),
    config: {
      projectName: basename(projectRoot),
      runTimestamp: new Date().toISOString(),
    },
  }

  if (formats.includes('json')) {
    const jsonPath = join(outputDir, `${reportName}.json`)
    reportJson(reporterCtx, jsonPath)
  }

  let htmlPath: string | undefined
  if (formats.includes('html')) {
    htmlPath = join(outputDir, `${reportName}.html`)
    writeHtmlReport(reporterCtx, htmlPath)
  }

  if (formats.includes('md')) {
    const mdPath = join(outputDir, `${reportName}.md`)
    reportMarkdown(reporterCtx, mdPath)
  }

  // 13. Handle onboard mode output
  if (mode === 'onboard' && swarmResult.synthesis.executiveSummary) {
    const onboardDir = join(outputDir, `onboard-${dateStr}`)
    const paths = await writeOnboardDocs(
      swarmResult.synthesis.executiveSummary,
      onboardDir
    )
    if (paths.length > 0) {
      console.log(theme.success(`  ✓ Onboard docs written to ${onboardDir}/`))
    }
  }

  // 14. Print summary
  const grouped = groupBySeverity(swarmResult.findings)
  const critical = grouped.critical
  const high = grouped.high
  const medium = grouped.medium
  const low = [...grouped.low, ...grouped.info]

  console.log()
  console.log(divider())

  const scoreStr = scoreTheme(scoreResult.score)(
    `${scoreResult.score}/100`
  )
  const deltaStr = formatDelta(scoreResult.delta)
  const gradeStr = scoreGrade(scoreResult.score)

  console.log(
    `  Palade Score   ${scoreStr}  ${theme.dim(deltaStr)}  ${theme.dim(`Grade: ${gradeStr}`)}`
  )

  console.log(
    [
      `  Findings       `,
      theme.critical(`${critical.length} critical`),
      `  `,
      theme.high(`${high.length} high`),
      `  `,
      theme.medium(`${medium.length} medium`),
      `  `,
      theme.dim(`${low.length} low`),
    ].join('')
  )

  console.log()

  if (htmlPath) {
    console.log(
      `  ${theme.dim('→ Report')}   ${chalk.cyan(htmlPath)}`
    )
  }
  if (config.score.badge) {
    console.log(
      `  ${theme.dim('→ Badge')}     ${chalk.cyan(config.score.badgePath)} ${theme.success('updated')}`
    )
  }

  console.log()
  console.log(divider())
  console.log(
    `  ${theme.dim('Total time:')}  ${(swarmResult.durationMs / 1000).toFixed(1)}s`
  )
  console.log()

  // 15. Open browser
  if (htmlPath && opts.open !== false && config.output.openBrowser) {
    startLocalServer(htmlPath, config.output.port, { openBrowser: true })
  }
}
