import crypto from 'node:crypto'
import { loadConfig } from '../../config/loader.js'
import { initRouter, AllProvidersExhaustedError } from '../../providers/router.js'
import { loadTargets, resolveTargetPaths } from '../../targets/loader.js'
import { loadCustomAgents } from '../../agents/custom/loader.js'
import { launchPicker } from '../picker.js'
import { runPipeline } from '../../orchestrator/pipeline.js'
import { calculateScore } from '../../scorer/calculator.js'
import { readHistory, appendEntry, getPreviousScore } from '../../scorer/history.js'
import { renderBadge, getBadgeData } from '../../scorer/badge.js'
import { reportJson } from '../../reporters/json.js'
import { writeHtmlReport, startLocalServer } from '../../reporters/html.js'
import { reportMarkdown } from '../../reporters/markdown.js'
import { reportTerminal } from '../../reporters/terminal.js'
import { validateMode, getModeConfig } from '../../modes/index.js'
import { writeOnboardDocs } from '../../modes/onboard.js'
import { createLiveProgress } from '../../ui/progress.js'
import { theme } from '../../ui/theme.js'
import { kvTable } from '../../ui/layout.js'
import type { ScopeOptions } from '../../ingestion/types.js'
import type { AgentName } from '../../agents/base.js'
import type { ResolvedTarget, SwarmResult } from '../../orchestrator/types.js'
import { resolveSymbol } from '../../ingestion/symbolResolver.js'
import { CliExitError, ReviewCancelledError } from '../../errors/types.js'
import { detectLanguages } from '../../ingestion/walker.js'
import chalk from 'chalk'
import { mkdirSync, existsSync, statSync } from 'node:fs'
import { join, basename, dirname, isAbsolute, resolve, relative, sep } from 'node:path'

// Local execution (no API keys required):
//   OLLAMA_MODEL=codellama:13b npx palade review --target src/

// Keep in sync with the report formats review.ts actually knows how to write
// out below (json/html/md) — this mirrors config/schema.ts's
// `output.formats` enum, which is what config.output.formats.join(',') falls
// back to when --format isn't passed.
const VALID_REPORT_FORMATS = ['json', 'html', 'md']

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
  tui?: boolean
  signal?: AbortSignal
  dryRun?: boolean
  economy?: boolean
  exhaustive?: boolean
  strictTriage?: boolean
  noVerdict?: boolean
  /** Commander stores `--no-verdict` under the positive key: false when the flag is passed. */
  verdict?: boolean
}

export async function reviewCommand(
  pathArg: string | undefined,
  opts: ReviewOptions
): Promise<void> {
  if (opts.target && opts.allTargets) {
    console.error(
      chalk.red(
        "  Cannot use --target and --all-targets together — --all-targets would silently override --target's scope. Pick one."
      )
    )
    throw new CliExitError(1)
  }
  // Validate --format up front, before running the (potentially expensive and
  // slow) swarm review — an unknown format used to silently produce zero
  // report files only after the whole run had already completed.
  if (opts.format) {
    const requestedFormats = opts.format
      .split(',')
      .map((f) => f.trim())
      .filter(Boolean)
    const invalidFormats = requestedFormats.filter((f) => !VALID_REPORT_FORMATS.includes(f))
    if (invalidFormats.length > 0) {
      console.error(
        chalk.red(
          `  Invalid --format value${invalidFormats.length > 1 ? 's' : ''}: ${invalidFormats.join(', ')}. Valid options: ${VALID_REPORT_FORMATS.join(', ')}`
        )
      )
      throw new CliExitError(1)
    }
  }
  if (
    !pathArg &&
    !opts.allTargets &&
    !opts.target &&
    !opts.dir &&
    (!opts.file || opts.file.length === 0) &&
    !opts.glob &&
    !opts.pick
  ) {
    if (process.stdin.isTTY && !opts.tui) {
      opts.pick = true
    }
  }
  // Parse file::symbol syntax
  let symbolFilter: string | undefined
  let rawPath = pathArg ?? ''
  if (rawPath.includes('::')) {
    const parts = rawPath.split('::')
    rawPath = parts[0]
    symbolFilter = parts[1]
  }

  const resolvedPath = rawPath
    ? isAbsolute(rawPath)
      ? rawPath
      : resolve(process.cwd(), rawPath)
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
  let symbolChunks: import('../../ingestion/types.js').CodeChunk[] | undefined
  if (symbolFilter) {
    const symbolRef = rawPath ? `${rawPath}::${symbolFilter}` : `${process.cwd()}::${symbolFilter}`
    const chunk = await resolveSymbol(symbolRef, process.cwd())
    if (!chunk) {
      console.error(chalk.red(`  Symbol '${symbolFilter}' not found in ${rawPath || '.'}`))
      throw new CliExitError(1)
    }
    symbolChunks = [chunk]
    console.log(
      theme.success(`  ✓ Resolved symbol: ${chunk.filePath}:${chunk.startLine}-${chunk.endLine}`)
    )

    // --depth: pull in the symbol's local dependency files as extra context
    // chunks. Without this the flag is parsed but has no effect at all.
    let depth = opts.depth ?? 1
    if (!Number.isFinite(depth)) {
      // commander's numeric parser returns NaN for a non-numeric --depth
      // value (e.g. `--depth abc`), which would otherwise silently disable
      // dependency tracing via the `depth > 0` check below with no signal to
      // the user. Default back to 1 (tracing stays on) and warn instead.
      console.log(
        theme.warning(`  Invalid --depth value "${String(opts.depth)}" — defaulting to depth 1.`)
      )
      depth = 1
    }
    if (depth > 0) {
      const { traceDependencies } = await import('../../ingestion/dependencyTracer.js')
      const { readFile } = await import('node:fs/promises')
      const deps = await traceDependencies(chunk.filePath, process.cwd(), depth)
      for (const dep of deps.slice(0, 10)) {
        try {
          const content = await readFile(join(process.cwd(), dep), 'utf-8')
          const lineCount = content.split('\n').length
          symbolChunks.push({
            id: `${dep}:1-${lineCount}`,
            filePath: dep,
            startLine: 1,
            endLine: lineCount,
            content,
            tokenCount: Math.ceil(content.length / 4),
            language: chunk.language,
          })
        } catch {
          // unreadable dependency — skip
        }
      }
      if (symbolChunks.length > 1) {
        console.log(
          theme.dim(`  + ${symbolChunks.length - 1} dependency file(s) traced (depth ${depth})`)
        )
      }
      if (deps.length > 10) {
        console.log(theme.dim(`  + ${deps.length - 10} more dependencies truncated`))
      }
    }
  }

  // 1. Load config + init providers
  const config = await loadConfig()
  await initRouter(config)

  // 2. Load targets
  const allTargets = await loadTargets(projectRoot)

  // 2b. Load custom agents
  const customAgentDefs = await loadCustomAgents(projectRoot)

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
      ? opts.file.map((f) => (isAbsolute(f) ? relative(projectRoot, f).split(sep).join('/') : f))
      : undefined
  const scope: ScopeOptions = {
    projectRoot,
    dirs: opts.dir ? [normalizeDir(opts.dir)] : undefined,
    files: scopeFiles,
    globs: opts.glob ? [opts.glob] : undefined,
    annotationsOnly: opts.annotations ?? false,
    symbolChunks,
  }

  // 5. Handle --pick
  let resolvedTarget: ResolvedTarget | undefined = undefined
  if (opts.tui && opts.pick) {
    console.log(
      theme.dim('  --pick is not supported inside the interactive TUI. Reviewing all files.')
    )
    opts.pick = false
  }
  if (opts.pick && !process.stdin.isTTY) {
    console.log(theme.dim('  --pick requires an interactive terminal. Reviewing all files.'))
    opts.pick = false
  }
  if (opts.pick) {
    const allManifests = await import('../../ingestion/walker.js').then((m) =>
      m.walkProject(projectRoot, { projectRoot })
    )
    const selectedPaths = await launchPicker(projectRoot, allManifests)
    if (selectedPaths.length === 0) {
      console.log(theme.dim('  No files selected.'))
      return
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
    resolvedTarget = {
      definition: match,
      resolvedPaths: resolveTargetPaths(match, projectRoot),
    }
    scope.targetPaths = resolvedTarget.resolvedPaths
    // Apply the target's optional scope narrowing (dirs/files/globs/annotationsOnly) —
    // the schema validates it, so silently dropping it reviews far more than intended.
    if (match.scope) {
      if (match.scope.dirs?.length) scope.dirs = [...(scope.dirs ?? []), ...match.scope.dirs]
      if (match.scope.files?.length) scope.files = [...(scope.files ?? []), ...match.scope.files]
      if (match.scope.globs?.length) scope.globs = [...(scope.globs ?? []), ...match.scope.globs]
      if (match.scope.annotationsOnly !== undefined)
        scope.annotationsOnly = match.scope.annotationsOnly
    }
  }

  // 6c. Handle --all-targets: review the union of every defined target's paths
  if (opts.allTargets) {
    if (allTargets.length === 0) {
      console.log(theme.dim('  --all-targets: no targets defined; reviewing full codebase.'))
    } else {
      const unionPaths = new Set<string>()
      for (const t of allTargets) {
        for (const p of resolveTargetPaths(t, projectRoot)) unionPaths.add(p)
      }
      scope.targetPaths = Array.from(unionPaths)
    }
  }

  // 6b. Language Detection
  const langProfile = await detectLanguages(projectRoot, scope)

  // 7. Print run header
  if (!opts.quiet) {
    if (!langProfile.isFirstClass) {
      console.log(
        chalk.yellow(
          `\n  ⚠ Non-primary language detected (${langProfile.primary.join(', ')}). Palade is optimized for JS/TS. Findings may be less accurate.`
        )
      )
    }

    const rows: [string, string][] = [
      ['Project:', `${theme.white(basename(projectRoot))}`],
      ['Mode:', theme.accent(mode)],
      [
        'Scope:',
        theme.dim(
          opts.target ? `target: ${opts.target}` : opts.dir ? `dir: ${opts.dir}` : 'full codebase'
        ),
      ],
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
  const progress = opts.quiet || opts.tui ? undefined : createLiveProgress()
  let swarmResult: SwarmResult
  try {
    swarmResult = await runPipeline({
      projectRoot,
      scope,
      context: {
        projectLanguages: langProfile.primary,
        totalFiles: 0,
        totalChunks: 0,
        mode,
        modeConfig,
        includeSkills: config.swarm.includeSkills,
      },
      swarmOptions: {
        onAgentStart: (name: AgentName): void => {
          if (opts.tui) console.log(theme.dim(`  Starting ${name} agent...`))
          progress?.agentStart(name)
        },
        onAgentBatchComplete: (
          name: AgentName,
          current: number,
          total: number,
          findings: number
        ): void => {
          progress?.agentBatchDone(name, current, total, findings)
        },
        onAgentComplete: (
          name: AgentName,
          findings: number,
          durationMs: number,
          error?: Error
        ): void => {
          if (opts.tui) {
            if (error) {
              console.log(theme.error(`  ✖ ${name} agent failed: ${error.message}`))
            } else {
              console.log(
                theme.success(
                  `  ✓ ${name} agent finished in ${(durationMs / 1000).toFixed(1)}s (${findings} findings)`
                )
              )
            }
          }
          progress?.agentDone(name, findings, durationMs, error)
        },
        onSynthesisStart: (): void => {
          if (opts.tui) console.log(theme.dim(`  Synthesizing results...`))
          progress?.synthesisStart(config.swarm.synthesis)
        },
        onSynthesisComplete: (durationMs: number): void => {
          if (opts.tui) {
            console.log(
              theme.success(`  ✓ Synthesis complete in ${(durationMs / 1000).toFixed(1)}s`)
            )
          }
          progress?.synthesisDone(durationMs)
        },
        onVerdictDetected: (filePath: string, sideA: string, sideB: string): void => {
          if (opts.tui)
            console.log(theme.dim(`  Conflict detected: ${sideA} vs ${sideB} in ${filePath}`))
          progress?.conflictDetected(filePath, sideA, sideB)
        },
        onVerdictDecided: (decision: string, confidence: number): void => {
          if (opts.tui)
            console.log(theme.success(`  ✓ Verdict decided (${confidence}% confidence)`))
          progress?.verdictDecided(decision, confidence)
        },
        timeoutMs: config.swarm.timeoutMs,
        maxReviewTokens: config.swarm.maxReviewTokens,
        customAgents: customAgentDefs,
        agentCount: config.swarm.agentCount,
        providerShares: config.swarm.providerShares,
        economyMode: opts.economy ?? config.swarm.economyMode,
        exhaustive: opts.exhaustive,
        strictTriage: opts.strictTriage,
        noVerdict: opts.noVerdict ?? opts.verdict === false,
        signal: opts.signal,
        specPath: config.swarm.specPath,
        constitutionPath: config.swarm.constitutionPath,
        maxConcurrentBatches: config.swarm.maxConcurrentBatches,
        softTokenLimit: config.swarm.softTokenLimit,
        hardChunkLimit: config.swarm.hardChunkLimit,
        maxSynthesisFindings: config.swarm.maxSynthesisFindings,
        synthesisTimeoutMs: config.swarm.synthesisTimeoutMs,
        decisionsRetentionLimit: config.swarm.decisionsRetentionLimit,
        severityWeights: config.score.severityWeights,
      },
      target: resolvedTarget,
      dryRunConfig: opts.dryRun ? config : undefined,
    })
  } catch (err: unknown) {
    if (err instanceof ReviewCancelledError) {
      console.log(chalk.dim('\n  Review cancelled — no score or report generated.'))
      throw new CliExitError(0)
    }
    // A fatal auth error still carries whatever findings were collected
    // before it was thrown (see swarm.ts's partialFindings attachment) —
    // surface that so the user knows the run wasn't a total loss, even
    // though this path currently doesn't write a report for them
    // (orchestrator-003).
    const partialFindings = (err as { partialFindings?: unknown[] })?.partialFindings
    if (Array.isArray(partialFindings) && partialFindings.length > 0) {
      console.warn(
        chalk.yellow(
          `  ⚠ ${partialFindings.length} finding(s) were collected before the fatal error and were discarded.`
        )
      )
    }
    if (err instanceof AllProvidersExhaustedError) {
      console.error(
        chalk.red('\n✖ All LLM providers failed. Palade could not complete this review.\n')
      )
      console.error('Attempted providers:')
      err.attempts.forEach((attempt, i) => {
        console.error(`  ${i + 1}. ${attempt.provider.padEnd(10)} → ${attempt.finalError}`)
      })
      console.error('\nSuggestions:')
      console.error('  • Check your API key environment variables')
      console.error('  • Try again in a few minutes')
      console.error('  • Add a local fallback: OLLAMA_MODEL=codellama:13b\n')
      throw new CliExitError(1)
    }
    throw err
  } finally {
    progress?.stop()
  }

  // 9. Calculate score
  const historyPath = join(projectRoot, config.score.historyFile)
  const previousScore = getPreviousScore(historyPath)

  const scoreResult = calculateScore(
    swarmResult.findings,
    swarmResult.crossAgentFindings,
    previousScore,
    {
      severityWeights: config.score.severityWeights,
      crossAgentPenalty: config.score.crossAgentPenalty,
      complexityPenalties: config.score.complexityPenalties,
      penaltyCaps: config.score.penaltyCaps,
    },
    swarmResult.agentsRun?.filter((a) => !swarmResult.failedCategories?.includes(a))
  )

  // 10. Append to history
  await appendEntry(
    historyPath,
    {
      timestamp: new Date().toISOString(),
      runId: swarmResult.runId,
      score: scoreResult.score,
      breakdown: scoreResult.breakdown,
      delta: scoreResult.delta,
      kind: 'full',
    },
    config.score.maxHistoryEntries
  )

  // 11. Generate badge
  if (config.score.badge) {
    const badgeSvg = renderBadge(getBadgeData(scoreResult.score))
    const badgePath = join(projectRoot, config.score.badgePath)
    const badgeDir = dirname(badgePath)
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
  const formats = (opts.format ?? config.output.formats.join(',')).split(',').map((f) => f.trim())

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

  let jsonPath: string | undefined
  if (formats.includes('json')) {
    jsonPath = join(outputDir, `${reportName}.json`)
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
    const paths = await writeOnboardDocs(swarmResult.synthesis.executiveSummary, onboardDir)
    if (paths.length > 0) {
      console.log(theme.success(`  ✓ Onboard docs written to ${onboardDir}/`))
    }
  }

  // 14. Print summary
  console.log()
  const termReport = await reportTerminal(reporterCtx)
  console.log(termReport.content)

  console.log()
  if (htmlPath) {
    console.log(`  ${theme.dim('→ HTML')}     ${chalk.cyan(htmlPath)}`)
  }
  if (jsonPath) {
    console.log(
      `  ${theme.dim('→ JSON')}     ${chalk.cyan(jsonPath)} ${theme.dim('(ready for AI agents)')}`
    )
  }
  if (config.score.badge) {
    console.log(
      `  ${theme.dim('→ Badge')}     ${chalk.cyan(config.score.badgePath)} ${theme.success('updated')}`
    )
  }

  console.log()

  // 15. Open browser
  if (htmlPath && opts.open !== false && config.output.openBrowser) {
    startLocalServer(htmlPath, config.output.port, { openBrowser: true })
  }
}
