import chokidar from 'chokidar'
import chalk from 'chalk'
import { loadConfig } from '../../config/loader.js'
import { initRouter, getProvider } from '../../providers/router.js'
import { walkProject } from '../../ingestion/walker.js'
import { chunkFiles } from '../../ingestion/chunker.js'
import { scheduleBatches } from '../../orchestrator/scheduler.js'
import type { AgentFinding, AgentContext } from '../../agents/base.js'
import { MaintainabilityAgent } from '../../agents/specialist/maintainability.js'
import { ArchitectureAgent } from '../../agents/specialist/architecture.js'
import { theme } from '../../ui/theme.js'
import { formatDriftAlert } from '../../ui/layout.js'
import { CliExitError } from '../../errors/types.js'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const DEBOUNCE_MS: Record<string, number> = {
  low: 5000,
  medium: 2000,
  high: 500,
}

export async function watchCommand(opts: { sensitivity?: string; continuous?: boolean }): Promise<void> {
  const projectRoot = process.cwd()
  const sensitivity = opts.sensitivity ?? 'medium'
  const debounceMs = DEBOUNCE_MS[sensitivity] ?? 2000
  const isContinuous = opts.continuous === true

  try {
    const config = await loadConfig()
    await initRouter(config)
  } catch (err) {
    console.error(chalk.red(`Failed to initialise: ${(err as Error).message}`))
    throw new CliExitError(1)
  }

  console.log(
    theme.accent(`  palade watch started. Watching for changes... (${sensitivity} sensitivity)`)
  )
  console.log(theme.dim('  Press Ctrl+C to stop.'))
  if (isContinuous) {
    console.log(theme.dim('  Continuous background sweep is ENABLED.'))
  }
  console.log()

  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let isProcessing = false
  const accumulatedFindings = new Map<string, AgentFinding[]>()
  let sweepQueue: string[] = []
  let urgentQueue: string[] = []
  let loopTimer: ReturnType<typeof setTimeout> | null = null
  let currentSweepController: AbortController | null = null

  if (isContinuous) {
    try {
      const manifests = await walkProject(projectRoot, { projectRoot })
      sweepQueue = manifests.map((m) => m.path)
      // Shuffle the queue so sweeps don't always start deterministically
      for (let i = sweepQueue.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        const temp = sweepQueue[i]
        sweepQueue[i] = sweepQueue[j]
        sweepQueue[j] = temp
      }
    } catch {
      // ignore
    }
  }

  const updateWatchReport = () => {
    try {
      const paladeDir = join(projectRoot, '.palade')
      mkdirSync(paladeDir, { recursive: true })
      const mdPath = join(paladeDir, 'watch-bugs.md')

      const lines = [
        '# Watch Mode Findings',
        '',
        `*Last updated: ${new Date().toLocaleTimeString()}*`,
        '',
      ]

      if (accumulatedFindings.size === 0) {
        lines.push('No issues detected in actively watched files.')
      } else {
        for (const [file, findings] of accumulatedFindings.entries()) {
          lines.push(`## \`${file}\``, '')
          for (const f of findings) {
            const loc = f.lineStart ? ` (Line ${f.lineStart})` : ''
            lines.push(`- **[${f.severity.toUpperCase()}]** ${f.title}${loc}`)
            lines.push(`  - *${f.agentName}*: ${f.description}`)
          }
          lines.push('')
        }
      }

      writeFileSync(mdPath, lines.join('\n'), 'utf-8')
    } catch {
      // Ignore write errors in watch mode
    }
  }

  // Initial empty report
  updateWatchReport()

  const analyzeFile = async (filePath: string, signal?: AbortSignal): Promise<void> => {
    // isProcessing is now managed by processNext
    console.log(theme.dim(`\n  Scanning ${filePath}...`))

    try {
      const scope = { projectRoot, files: [filePath] }
      const manifests = await walkProject(projectRoot, scope)
      if (manifests.length === 0) {
        isProcessing = false
        return
      }

      const chunks = await chunkFiles(manifests)
      if (chunks.length === 0) {
        isProcessing = false
        return
      }

      const context: AgentContext = {
        projectLanguages: [manifests[0].language],
        totalFiles: 1,
        totalChunks: chunks.length,
        mode: 'standard',
      }

      // Run lightweight agents
      const agents = [new ArchitectureAgent(), new MaintainabilityAgent()]
      const allFindings: AgentFinding[] = []
      const batches = scheduleBatches(chunks)

      for (const agent of agents) {
        for (const batch of batches) {
          const timeoutMs = (config.swarm as any)?.timeoutMs ?? 60000
          const ac = new AbortController()
          const timer = setTimeout(() => ac.abort(), timeoutMs)
          
          const onParentAbort = () => {
            ac.abort()
            clearTimeout(timer)
          }
          if (signal) signal.addEventListener('abort', onParentAbort)

          try {
            const findings = await agent.analyze(batch, context, ac.signal)
            allFindings.push(...findings)
          } catch (err: unknown) {
            if (err instanceof Error && err.name === 'AbortError') {
              if (signal?.aborted) throw err // pass parent aborts up
              console.log(theme.dim(`    ⚠ ${agent.name} timed out.`))
            }
          } finally {
            clearTimeout(timer)
            if (signal) signal.removeEventListener('abort', onParentAbort)
          }
        }
      }

      if (allFindings.length > 0) {
        accumulatedFindings.set(filePath, allFindings)
        console.log('\n' + formatDriftAlert(filePath, allFindings))
      } else {
        accumulatedFindings.delete(filePath)
        console.log(theme.success(`  ✓ Clean: ${filePath}\n`))
      }

      updateWatchReport()
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        console.log(theme.dim(`  ⚠ Aborted scan of ${filePath} for higher priority task.`))
        throw err
      }
      // watch mode never crashes
    }
  }

  const processNext = async () => {
    if (isProcessing) return
    isProcessing = true
    currentSweepController = null

    try {
      let nextFile: string | undefined
      const isUrgent = urgentQueue.length > 0

      if (isUrgent) {
        nextFile = urgentQueue.shift()
        // Deduplicate from sweep queue and push to back
        if (isContinuous && nextFile) {
          sweepQueue = sweepQueue.filter((f) => f !== nextFile)
          sweepQueue.push(nextFile)
        }
      } else if (isContinuous && sweepQueue.length > 0) {
        nextFile = sweepQueue.shift()
        if (nextFile) sweepQueue.push(nextFile) // rotating queue
        currentSweepController = new AbortController()
      }

      if (nextFile) {
        try {
          await analyzeFile(nextFile, currentSweepController?.signal)
        } catch (err: unknown) {
          if (err instanceof Error && err.name === 'AbortError' && !isUrgent) {
            // If background sweep was aborted, it means an urgent task came in.
            // Push the aborted file back to the front of the sweep queue so we try again later.
            sweepQueue.unshift(nextFile)
          }
        }
      }
    } finally {
      isProcessing = false
      currentSweepController = null
      if (urgentQueue.length > 0 || isContinuous) {
        loopTimer = setTimeout(
          () => {
            void processNext()
          },
          urgentQueue.length > 0 ? 100 : 3000
        )
      }
    }
  }

  // Kick off the background sweep if continuous is enabled
  if (isContinuous) {
    void processNext()
  }

  const ignored = [
    /node_modules/,
    /\.palade/,
    /dist/,
    /\.git/,
    /\.lock$/,
    /\.min\.(js|css)$/,
    /coverage/,
  ]

  const watcher = chokidar.watch('.', {
    ignored,
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 300 },
  })

  watcher.on('change', (path: string) => {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      // chokidar emits OS-native separators (backslash on Windows). walkProject
      // produces forward-slash paths, so normalise before passing as scope.
      const normalizedPath = path.split('\\').join('/')
      
      if (!urgentQueue.includes(normalizedPath)) {
        urgentQueue.push(normalizedPath)
      }
      
      if (currentSweepController) {
        currentSweepController.abort()
      }
      
      void processNext()
    }, debounceMs)
  })

  process.on('exit', () => {
    watcher.close()
  })

  process.on('SIGINT', () => {
    if (debounceTimer) clearTimeout(debounceTimer)
    if (loopTimer) clearTimeout(loopTimer)
    watcher.close()
    console.log(theme.dim('\n  Watcher stopped.'))
    process.exit(0)
  })

  // Keep process alive
  await new Promise(() => {})
}
