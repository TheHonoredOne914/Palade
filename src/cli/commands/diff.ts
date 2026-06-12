import { Command } from 'commander'
import { loadConfig } from '../../config/loader.js'
import { initRouter } from '../../providers/router.js'
import { walkProject, detectLanguages } from '../../ingestion/walker.js'
import { chunkFiles } from '../../ingestion/chunker.js'
import { estimateTotalTokens } from '../../orchestrator/scheduler.js'
import { runSwarm } from '../../orchestrator/swarm.js'
import { calculateScore } from '../../scorer/calculator.js'
import { readHistory, appendEntry } from '../../scorer/history.js'
import { reportTerminal } from '../../reporters/terminal.js'
import { reportJson } from '../../reporters/json.js'
import { writeHtmlReport, startLocalServer } from '../../reporters/html.js'
import { reportMarkdown } from '../../reporters/markdown.js'
import { isGitRepo, getCurrentBranch, getChangedFiles, getBaseScore } from '../../diff/git.js'
import { compareFindings, rankIntroducedFindings } from '../../diff/comparator.js'
import { printDiffBanner, printDiffSummary } from '../../reporters/terminal.js'
import type { ScopeOptions } from '../../ingestion/types.js'
import type { AgentContext, AgentName } from '../../agents/base.js'
import type { ChangedFile } from '../../diff/types.js'
import type { DiffContext } from '../../agents/base.js'
import chalk from 'chalk'
import ora from 'ora'
import { mkdirSync, existsSync } from 'node:fs'
import { join, basename } from 'node:path'

interface DiffOpts {
  base: string
  mode: string
  browser: boolean
  format: string
  out: string
  ci: boolean
}

export function registerDiffCommand(program: Command): void {
  program
    .command('diff')
    .description('Review changes vs a base branch (pre-push pre-flight)')
    .option('--base <branch>', 'Base branch to compare against', 'main')
    .option('--mode <mode>', 'Review mode', 'standard')
    .option('--no-browser', 'Skip browser opening')
    .option('--format <fmt>', 'Output formats (html,json,md)', 'html,json')
    .option('--out <dir>', 'Output directory', '.palade/reports')
    .option('--ci', 'CI mode: exit 2 if critical findings introduced')
    .action(async (opts) => {
      await runDiff(opts as DiffOpts)
    })
}

async function runDiff(opts: DiffOpts): Promise<void> {
  const projectRoot = process.cwd()

  try {
    // 1. Verify git repo
    if (!(await isGitRepo(projectRoot))) {
      console.error(chalk.red('Not a git repository. palade diff requires git.'))
      process.exit(1)
    }

    // 2. Load config + init providers
    const configSpinner = ora('Loading configuration...').start()
    const config = await loadConfig()
    configSpinner.succeed('Configuration loaded')

    await initRouter(config)

    // 3. Get changed files
    const headBranch = await getCurrentBranch(projectRoot)
    console.log(chalk.dim(`Comparing ${headBranch} → ${opts.base}...`))

    const changedFiles = await getChangedFiles(opts.base, projectRoot)

    if (changedFiles.length === 0) {
      console.log(chalk.green(`✓ No changed files vs ${opts.base}`))
      process.exit(0)
    }

    const additions = changedFiles.reduce((s, f) => s + f.additions, 0)
    const deletions = changedFiles.reduce((s, f) => s + f.deletions, 0)
    console.log(chalk.dim(`${changedFiles.length} changed files (+${additions} / -${deletions})`))

    // 4. Build scope limited to changed files
    const nonDeleted = changedFiles.filter((f) => f.status !== 'deleted')
    const scope: ScopeOptions = {
      projectRoot,
      files: nonDeleted.map((f) => f.path),
    }

    // 5. Walk and chunk only changed files
    const manifests = await walkProject(projectRoot, scope)
    const chunks = await chunkFiles(manifests)

    console.log(
      chalk.dim(
        `Chunking: ${manifests.length} files → ${chunks.length} chunks (~${estimateTotalTokens(chunks).toLocaleString()} tokens)`
      )
    )

    // 6. Print diff banner
    printDiffBanner({
      projectName: basename(projectRoot),
      headBranch,
      baseBranch: opts.base,
      changedCount: changedFiles.length,
      additions,
      deletions,
    })

    // 7. Build context with diff info
    const diffContext: DiffContext = {
      baseBranch: opts.base,
      headBranch,
      changedFiles,
    }

    const context: AgentContext = {
      projectLanguages: await detectLanguages(projectRoot, scope),
      totalFiles: manifests.length,
      totalChunks: chunks.length,
      mode: (opts.mode as AgentContext['mode']) ?? 'standard',
      diffContext,
    }

    // 8. Run swarm on changed files only
    const agentCount = config.swarm.agentCount
    let completedAgents = 0

    const progressSpinner = ora('Starting analysis...').start()

    const swarmResult = await runSwarm(chunks, context, {
      onAgentStart: (name: AgentName): void => {
        progressSpinner.text = `[${completedAgents}/${agentCount}] ${name} agent analyzing...`
      },
      onAgentComplete: (name: AgentName, findings: number, durationMs: number): void => {
        completedAgents++
        progressSpinner.text = `[${completedAgents}/${agentCount}] ${name} complete (${findings} findings, ${(durationMs / 1000).toFixed(1)}s)`
      },
      onSynthesisStart: (): void => {
        progressSpinner.text = 'Synthesizing cross-agent findings...'
      },
      onSynthesisComplete: (durationMs: number): void => {
        progressSpinner.text = `Synthesis complete (${(durationMs / 1000).toFixed(1)}s)`
      },
      timeoutMs: config.swarm.timeoutMs,
    })

    progressSpinner.succeed(
      `Analysis complete — ${swarmResult.findings.length} findings in ${(swarmResult.durationMs / 1000).toFixed(1)}s`
    )

    // 9. Calculate score
    const scoreSpinner = ora('Calculating score...').start()
    const historyPath = join(projectRoot, config.score.historyFile)
    const baseScore = await getBaseScore(opts.base, historyPath, projectRoot)

    const scoreResult = calculateScore(
      swarmResult.findings,
      swarmResult.crossAgentFindings,
      baseScore
    )

    scoreSpinner.succeed(
      `Score: ${scoreResult.score}/100 (delta: ${scoreResult.delta >= 0 ? '+' : ''}${scoreResult.delta})`
    )

    // 10. Append to history
    appendEntry(historyPath, {
      timestamp: new Date().toISOString(),
      runId: swarmResult.runId,
      score: scoreResult.score,
      breakdown: scoreResult.breakdown,
      delta: scoreResult.delta,
    })

    // 11. Compare findings vs base
    const findingDiff = compareFindings(
      swarmResult.findings,
      [], // No base findings stored — full comparison requires base run
      changedFiles
    )

    const rankedIntroduced = rankIntroducedFindings(findingDiff.introduced)
    findingDiff.introduced = rankedIntroduced

    const hasCriticalIntroduced = rankedIntroduced.some((f) => f.severity === 'critical')

    // 12. Print diff summary
    printDiffSummary({
      score: scoreResult,
      findingDiff,
      changedFiles,
      baseBranch: opts.base,
      headBranch,
      hasCriticalIntroduced,
      durationMs: swarmResult.durationMs,
    })

    if (baseScore === null) {
      console.log(
        chalk.yellow(
          `  No base score in history. Run palade review on ${opts.base} for an exact delta.`
        )
      )
    }

    // 13. Write reports
    const outputDir = join(projectRoot, opts.out)
    if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true })

    const dateStr = new Date().toISOString().slice(0, 10)
    const branchSlug = headBranch.replace(/\//g, '-')
    const reportName = `diff-${dateStr}-${branchSlug}`

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

    const formats = opts.format.split(',').map((f) => f.trim())

    const reportSpinner = ora('Generating reports...').start()

    if (formats.includes('json')) {
      const jsonPath = join(outputDir, `${reportName}.json`)
      reportJson(reporterCtx, jsonPath)
      console.log(chalk.green(`  JSON: ${jsonPath}`))
    }

    if (formats.includes('html')) {
      const htmlPath = join(outputDir, `${reportName}.html`)
      writeHtmlReport(reporterCtx, htmlPath)
      console.log(chalk.green(`  HTML: ${htmlPath}`))
      if (opts.browser && !opts.ci) {
        startLocalServer(htmlPath, config.output.port)
      }
    }

    if (formats.includes('md')) {
      const mdPath = join(outputDir, `${reportName}.md`)
      reportMarkdown(reporterCtx, mdPath)
      console.log(chalk.green(`  Markdown: ${mdPath}`))
    }

    reportSpinner.succeed('Reports generated')

    // 14. CI exit code
    if (opts.ci && hasCriticalIntroduced) {
      console.error(chalk.red('\n  ✗ Critical findings introduced. Blocking.'))
      process.exit(2)
    }
  } catch (err) {
    console.error(chalk.red(`\nDiff review failed: ${(err as Error).message}`))
    if ((err as Error).stack && process.env.DEBUG) {
      console.error(chalk.gray((err as Error).stack))
    }
    process.exit(1)
  }
}
