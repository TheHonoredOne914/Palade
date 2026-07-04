import { loadConfig } from '../../config/loader.js'
import { initRouter } from '../../providers/router.js'
import { walkProject, detectLanguages } from '../../ingestion/walker.js'
import { chunkFiles } from '../../ingestion/chunker.js'
import { estimateTotalTokens } from '../../orchestrator/scheduler.js'
import { runSwarm } from '../../orchestrator/swarm.js'
import { calculateScore } from '../../scorer/calculator.js'
import { appendEntry } from '../../scorer/history.js'
import { reportJson } from '../../reporters/json.js'
import { writeHtmlReport, startLocalServer } from '../../reporters/html.js'
import { reportMarkdown } from '../../reporters/markdown.js'
import { isGitRepo, getCurrentBranch, getChangedFiles, getBaseScore } from '../../diff/git.js'
import { compareFindings, rankIntroducedFindings } from '../../diff/comparator.js'
import { checkDecisionDrift } from '../../orchestrator/verdict.js'
import { printDiffBanner, printDiffSummary } from '../../reporters/terminal.js'
import { theme } from '../../ui/theme.js'
import { loadCustomAgents } from '../../agents/custom/loader.js'
import { askConfirm } from '../../ui/prompt.js'
import { buildAnnotationSummary } from '../../ingestion/annotationParser.js'
import { renderBadge, getBadgeData } from '../../scorer/badge.js'
import type { ScopeOptions } from '../../ingestion/types.js'
import type { AgentContext, AgentName, DiffContext } from '../../agents/base.js'
import { CliExitError } from '../../errors/types.js'
import chalk from 'chalk'
import { mkdirSync, existsSync, writeFileSync } from 'node:fs'
import { join, basename, dirname } from 'node:path'

interface DiffOpts {
  base?: string
  ci?: boolean
  signal?: AbortSignal
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new CliExitError(1)
  }
}

export async function diffCommand(opts: DiffOpts): Promise<void> {
  const projectRoot = process.cwd()
  const base = opts.base ?? 'main'

  try {
    if (!(await isGitRepo(projectRoot))) {
      console.error(theme.error('  Not a git repository. palade diff requires git.'))
      throw new CliExitError(1)
    }

    const config = await loadConfig()
    await initRouter(config)

    throwIfAborted(opts.signal)

    // Load custom agents
    const customAgentDefs = await loadCustomAgents(projectRoot)

    const headBranch = await getCurrentBranch(projectRoot)
    console.log(theme.dim(`  Comparing ${headBranch} → ${base}...`))

    const changedFiles = await getChangedFiles(base, projectRoot)

    if (changedFiles.length === 0) {
      console.log(theme.success(`  ✓ No changed files vs ${base}`))
      throw new CliExitError(0)
    }

    const additions = changedFiles.reduce((s, f) => s + f.additions, 0)
    const deletions = changedFiles.reduce((s, f) => s + f.deletions, 0)
    console.log(theme.dim(`  ${changedFiles.length} changed files (+${additions} / -${deletions})`))

    const driftWarnings = await checkDecisionDrift(projectRoot, changedFiles)
    for (const warning of driftWarnings) {
      console.log(chalk.red(`\n  ⚠ DRIFT  ${warning}`))
      const override = await askConfirm(chalk.yellow('  Override?'), false)
      if (!override) {
        console.error(theme.error('\n  ✗ Drift blocked by user.'))
        throw new CliExitError(1)
      }
    }

    const nonDeleted = changedFiles.filter((f) => f.status !== 'deleted')
    const scope: ScopeOptions = {
      projectRoot,
      files: nonDeleted.map((f) => f.path),
    }

    const manifests = await walkProject(projectRoot, scope)
    const chunks = await chunkFiles(manifests)

    console.log(
      theme.dim(
        `  Chunking: ${manifests.length} files → ${chunks.length} chunks (~${estimateTotalTokens(chunks).toLocaleString()} tokens)`
      )
    )

    console.log(
      printDiffBanner({
        projectName: basename(projectRoot),
        headBranch,
        baseBranch: base,
        changedCount: changedFiles.length,
        additions,
        deletions,
      })
    )

    const diffContext: DiffContext = {
      baseBranch: base,
      headBranch,
      changedFiles,
    }

    const context: AgentContext = {
      projectLanguages: (await detectLanguages(projectRoot, scope)).primary,
      totalFiles: manifests.length,
      totalChunks: chunks.length,
      mode: 'standard',
      diffContext,
    }

    const agentCount = config.swarm.agentCount
    let completedAgents = 0

    throwIfAborted(opts.signal)
    console.log(theme.dim('  Starting analysis...'))

    let swarmResult: any
    try {
      swarmResult = await runSwarm(chunks, context, {
        onAgentStart: (name: AgentName): void => {
          console.log(theme.dim(`  [${completedAgents}/${agentCount}] ${name} agent analyzing...`))
        },
        onAgentComplete: (name: AgentName, findings: number, durationMs: number): void => {
          completedAgents++
          console.log(
            theme.dim(
              `  [${completedAgents}/${agentCount}] ${name} complete (${findings} findings, ${(durationMs / 1000).toFixed(1)}s)`
            )
          )
        },
        onSynthesisStart: (): void => {
          console.log(theme.dim('  Synthesizing cross-agent findings...'))
        },
        onSynthesisComplete: (durationMs: number): void => {
          console.log(theme.dim(`  Synthesis complete (${(durationMs / 1000).toFixed(1)}s)`))
        },
        timeoutMs: config.swarm.timeoutMs,
        maxReviewTokens: config.swarm.maxReviewTokens,
        customAgents: customAgentDefs,
        economyMode: config.swarm.economyMode,
        signal: opts.signal,
      })
      console.log(
        theme.success(
          `  Analysis complete — ${swarmResult.findings.length} findings in ${(swarmResult.durationMs / 1000).toFixed(1)}s`
        )
      )
    } catch (err) {
      console.error(
        theme.error(`  Analysis failed: ${err instanceof Error ? err.message : String(err)}`)
      )
      throw err
    }

    // Apply the same @palade-ignore annotation filtering that the shared
    // review pipeline (orchestrator/pipeline.ts) applies, so diff findings
    // honor ignored files/lines just like `review` does.
    const annotationSummary = buildAnnotationSummary(manifests, chunks)
    if (annotationSummary.ignoredFiles.length > 0 || annotationSummary.ignoredLines.length > 0) {
      const norm = (p: string) => p.replace(/^\.?\/+/, '')
      const ignoredFileSet = new Set(annotationSummary.ignoredFiles.map(norm))
      swarmResult.findings = swarmResult.findings.filter((f: { filePath?: string; lineStart?: number }) => {
        if (!f.filePath) return true
        if (ignoredFileSet.has(norm(f.filePath))) return false
        if (f.lineStart === undefined) return true
        return !annotationSummary.ignoredLines.some(
          (il) =>
            norm(il.filePath) === norm(f.filePath!) &&
            f.lineStart! >= il.startLine &&
            f.lineStart! <= il.startLine + 1
        )
      })
    }

    if (swarmResult.fallbackStats) {
      const fs = swarmResult.fallbackStats
      const pFallbacks = fs.primary.fallbacks
      const sFallbacks = fs.synthesis.fallbacks
      if (pFallbacks > 0 || sFallbacks > 0) {
        const parts: string[] = []
        if (pFallbacks > 0)
          parts.push(`primary: ${pFallbacks}/${fs.primary.total} calls used fallback`)
        if (sFallbacks > 0)
          parts.push(`synthesis: ${sFallbacks}/${fs.synthesis.total} calls used fallback`)
        console.log(chalk.yellow(`  ⚠ ${parts.join(' | ')}`))
      }
    }

    const historyPath = join(projectRoot, config.score.historyFile)
    const baseScore = await getBaseScore(base, historyPath, projectRoot)

    const scoreResult = calculateScore(
      swarmResult.findings,
      swarmResult.crossAgentFindings,
      baseScore
    )

    const updatedHistory = appendEntry(historyPath, {
      timestamp: new Date().toISOString(),
      runId: swarmResult.runId,
      score: scoreResult.score,
      breakdown: scoreResult.breakdown,
      delta: scoreResult.delta,
    })

    // Regenerate the score badge the same way `review` does, so it doesn't
    // go stale after a `diff` run.
    if (config.score.badge) {
      const badgeSvg = renderBadge(getBadgeData(scoreResult.score))
      const badgePath = join(projectRoot, config.score.badgePath)
      const badgeDir = dirname(badgePath)
      if (!existsSync(badgeDir)) mkdirSync(badgeDir, { recursive: true })
      writeFileSync(badgePath, badgeSvg, 'utf-8')
    }

    const findingDiff = compareFindings(swarmResult.findings, [], changedFiles)

    const rankedIntroduced = rankIntroducedFindings(findingDiff.introduced)
    findingDiff.introduced = rankedIntroduced

    const hasCriticalIntroduced = rankedIntroduced.some((f) => f.severity === 'critical')

    console.log(
      printDiffSummary({
        score: scoreResult,
        findingDiff,
        changedFiles,
        baseBranch: base,
        headBranch,
        hasCriticalIntroduced,
        durationMs: swarmResult.durationMs,
      })
    )

    const outputDir = join(projectRoot, config.output.dir)
    if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true })

    const dateStr = new Date().toISOString().slice(0, 10)
    const branchSlug = headBranch.replace(/[^a-zA-Z0-9-]/g, '-')
    const reportName = `diff-${dateStr}-${branchSlug}`

    const reporterCtx = {
      score: scoreResult,
      swarm: swarmResult,
      synthesis: swarmResult.synthesis,
      findings: swarmResult.findings,
      crossAgentFindings: swarmResult.crossAgentFindings,
      history: updatedHistory,
      config: {
        projectName: basename(projectRoot),
        runTimestamp: new Date().toISOString(),
      },
    }

    const formats = config.output.formats

    if (formats.includes('json')) {
      const jsonPath = join(outputDir, `${reportName}.json`)
      reportJson(reporterCtx, jsonPath)
      console.log(theme.success(`  JSON: ${jsonPath}`))
    }

    if (formats.includes('html')) {
      const htmlPath = join(outputDir, `${reportName}.html`)
      writeHtmlReport(reporterCtx, htmlPath)
      console.log(theme.success(`  HTML: ${htmlPath}`))
      if (config.output.openBrowser) {
        startLocalServer(htmlPath, config.output.port, { openBrowser: true })
      }
    }

    if (formats.includes('md')) {
      const mdPath = join(outputDir, `${reportName}.md`)
      reportMarkdown(reporterCtx, mdPath)
      console.log(theme.success(`  Markdown: ${mdPath}`))
    }

    if (opts.ci && hasCriticalIntroduced) {
      console.error(theme.error('\n  ✗ Critical findings introduced. Blocking.'))
      throw new CliExitError(1)
    }
  } catch (err) {
    // CliExitError is an intentional exit signal — pass it through untouched.
    // Its message (if any) has already been printed at the throw site.
    if (err instanceof CliExitError) throw err
    console.error(theme.error(`\nDiff review failed: ${(err as Error).message}`))
    if ((err as Error).stack && process.env.DEBUG) {
      console.error(chalk.gray((err as Error).stack))
    }
    throw new CliExitError(1)
  }
}
