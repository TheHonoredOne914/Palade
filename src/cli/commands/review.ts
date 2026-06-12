import { loadConfig } from '../../config/loader.js'
import { initRouter } from '../../providers/router.js'
import { loadTargets, resolveTargetPaths } from '../../targets/loader.js'
import { launchPicker } from '../picker.js'
import { runPipeline } from '../../orchestrator/pipeline.js'
import { calculateScore } from '../../scorer/calculator.js'
import { readHistory, appendEntry } from '../../scorer/history.js'
import { renderBadge, getScoreColor } from '../../scorer/badge.js'
import { reportTerminal } from '../../reporters/terminal.js'
import { reportJson } from '../../reporters/json.js'
import { writeHtmlReport, startLocalServer } from '../../reporters/html.js'
import { reportMarkdown } from '../../reporters/markdown.js'
import type { ScopeOptions } from '../../ingestion/types.js'
import type { AgentName } from '../../agents/base.js'
import chalk from 'chalk'
import ora from 'ora'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join, basename, dirname } from 'node:path'

export async function reviewCommand(opts: { pick?: boolean; target?: string }): Promise<void> {
  const projectRoot = process.cwd()

  try {
    // 1. Load config + init providers
    const configSpinner = ora('Loading configuration...').start()
    const config = await loadConfig()
    configSpinner.succeed('Configuration loaded')

    await initRouter(config)

    // 2. Handle target selection
    let scope: ScopeOptions = { projectRoot }
    let targetDescription: string | undefined
    let targetFocus: string[] | undefined

    if (opts.pick) {
      const targets = await loadTargets(projectRoot)
      if (targets.length === 0) {
        console.log(chalk.yellow('No targets defined in palade.targets.ts'))
        return
      }
      const selected = await launchPicker(targets)
      if (selected.length === 0) {
        console.log(chalk.gray('No targets selected.'))
        return
      }
      console.log(chalk.cyan(`Selected: ${selected.map(t => t.name).join(', ')}`))
      const allPaths: string[] = []
      for (const t of selected) {
        allPaths.push(...resolveTargetPaths(t, projectRoot))
      }
      scope = { projectRoot, dirs: allPaths }
    } else if (opts.target) {
      const targets = await loadTargets(projectRoot)
      const match = targets.find((t) => t.name === opts.target)
      if (!match) {
        console.log(chalk.red(`Target "${opts.target}" not found in palade.targets.ts`))
        process.exit(1)
      }
      console.log(chalk.cyan(`Running review for target: ${match.name}`))
      const paths = resolveTargetPaths(match, projectRoot)
      scope = { projectRoot, dirs: paths }
      targetDescription = match.description
      targetFocus = match.focus
    }

    // 3. Run pipeline (walk + chunk + swarm) with progress
    const agentCount = config.swarm.agentCount
    let completedAgents = 0

    const progressSpinner = ora('Starting analysis...').start()

    const swarmResult = await runPipeline({
      projectRoot,
      scope,
      context: {
        projectLanguages: ['typescript'],
        totalFiles: 0,
        totalChunks: 0,
        mode: 'standard',
        ...(targetDescription ? { targetDescription } : {}),
        ...(targetFocus ? { targetFocus } : {})
      },
      swarmOptions: {
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
        timeoutMs: config.swarm.timeoutMs
      }
    })

    progressSpinner.succeed(
      `Analysis complete — ${swarmResult.findings.length} findings in ${(swarmResult.durationMs / 1000).toFixed(1)}s`
    )

    // 4. Calculate score
    const scoreSpinner = ora('Calculating score...').start()
    const historyPath = join(projectRoot, config.score.historyFile)
    const previousScore = (() => {
      try {
        const entries = readHistory(historyPath)
        return entries.length > 0 ? entries[entries.length - 1].score : null
      } catch { return null }
    })()

    const scoreResult = calculateScore(
      swarmResult.findings,
      swarmResult.crossAgentFindings,
      previousScore
    )
    scoreSpinner.succeed(
      `Score: ${scoreResult.score}/100 (delta: ${scoreResult.delta >= 0 ? '+' : ''}${scoreResult.delta})`
    )

    // 5. Append to history
    appendEntry(historyPath, {
      timestamp: new Date().toISOString(),
      runId: swarmResult.runId,
      score: scoreResult.score,
      breakdown: scoreResult.breakdown,
      delta: scoreResult.delta
    })

    // 6. Generate badge
    if (config.score.badge) {
      const badgeSvg = renderBadge({
        score: scoreResult.score,
        color: getScoreColor(scoreResult.score),
        label: 'palade'
      })
      const badgePath = join(projectRoot, config.score.badgePath)
      const badgeDir = dirname(badgePath)
      if (!existsSync(badgeDir)) mkdirSync(badgeDir, { recursive: true })
      writeFileSync(badgePath, badgeSvg, 'utf-8')
      console.log(chalk.green(`  Badge updated: ${config.score.badgePath}`))
    }

    // 7. Build reporter context
    const reporterCtx = {
      score: scoreResult,
      swarm: swarmResult,
      synthesis: swarmResult.synthesis,
      findings: swarmResult.findings,
      crossAgentFindings: swarmResult.crossAgentFindings,
      history: readHistory(historyPath),
      config: {
        projectName: basename(projectRoot),
        runTimestamp: new Date().toISOString()
      }
    }

    // 8. Generate reports
    const outputDir = join(projectRoot, config.output.dir)
    if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true })

    const dateStr = new Date().toISOString().slice(0, 10)
    const reportName = `${dateStr}-${scoreResult.score}`

    const reportSpinner = ora('Generating reports...').start()

    if (config.output.formats.includes('json')) {
      const jsonPath = join(outputDir, `${reportName}.json`)
      reportJson(reporterCtx, jsonPath)
      console.log(chalk.green(`  JSON: ${jsonPath}`))
    }

    if (config.output.formats.includes('html')) {
      const htmlPath = join(outputDir, `${reportName}.html`)
      writeHtmlReport(reporterCtx, htmlPath)
      console.log(chalk.green(`  HTML: ${htmlPath}`))
      if (config.output.openBrowser) {
        startLocalServer(htmlPath, config.output.port)
      }
    }

    if (config.output.formats.includes('md')) {
      const mdPath = join(outputDir, `${reportName}.md`)
      reportMarkdown(reporterCtx, mdPath)
      console.log(chalk.green(`  Markdown: ${mdPath}`))
    }

    reportSpinner.succeed('Reports generated')

    // 9. Terminal summary
    await reportTerminal(reporterCtx)

  } catch (err) {
    console.error(chalk.red(`\nReview failed: ${(err as Error).message}`))
    if ((err as Error).stack && process.env.DEBUG) {
      console.error(chalk.gray((err as Error).stack))
    }
    process.exit(1)
  }
}
