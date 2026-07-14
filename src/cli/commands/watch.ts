import chokidar from 'chokidar'
import chalk from 'chalk'
import { loadConfig } from '../../config/loader.js'
import { DEFAULT_CONFIG } from '../../config/defaults.js'
import { initRouter } from '../../providers/router.js'
import { walkProject, buildIgnoreFilter } from '../../ingestion/walker.js'
import { chunkFiles } from '../../ingestion/chunker.js'
import {
  scheduleBatches,
  ECONOMY_SOFT_TOKEN_CAP,
  ECONOMY_HARD_CHUNK_CAP,
} from '../../orchestrator/scheduler.js'
import type { AgentFinding, AgentContext, AgentName, IAgent } from '../../agents/base.js'
import { getAgentsForMode } from '../../agents/registry.js'
import { loadCustomAgents } from '../../agents/custom/loader.js'
import { CombinedAnalyzer, DEFAULT_DOMAINS } from '../../agents/combined.js'
import { CustomAgent } from '../../agents/custom/agent.js'
import { theme } from '../../ui/theme.js'
import { formatDriftAlert } from '../../ui/layout.js'
import { CliExitError } from '../../errors/types.js'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { mergeFindings } from '../../orchestrator/merger.js'

const DEBOUNCE_MS: Record<string, number> = {
  low: 5000,
  medium: 2000,
  high: 500,
}

export async function watchCommand(opts: {
  sensitivity?: string
  continuous?: boolean
}): Promise<void> {
  const projectRoot = process.cwd()
  const sensitivity = opts.sensitivity ?? 'medium'
  if (!(sensitivity in DEBOUNCE_MS)) {
    console.error(
      chalk.red(
        `Invalid --sensitivity value "${sensitivity}". Valid values: ${Object.keys(DEBOUNCE_MS).join(', ')}`
      )
    )
    throw new CliExitError(1)
  }
  const debounceMs = DEBOUNCE_MS[sensitivity]
  const isContinuous = opts.continuous === true

  let config
  let customAgentDefs: Awaited<ReturnType<typeof loadCustomAgents>>
  try {
    config = await loadConfig()
    await initRouter(config)
    customAgentDefs = await loadCustomAgents(projectRoot)
  } catch (err) {
    console.error(chalk.red(`Failed to initialise: ${(err as Error).message}`))
    throw new CliExitError(1)
  }

  // Mirror swarm.ts's economy-mode routing: replace the N parallel built-in
  // agents with a single combined multi-domain analyzer per batch. Custom
  // agents still run as separate per-domain calls, same as review/diff.
  const modeAgents = getAgentsForMode('standard', undefined, customAgentDefs)
  let watchAgents: IAgent[] = modeAgents
  if (config.swarm.economyMode) {
    const builtInAgents = modeAgents.filter((a) => !(a instanceof CustomAgent))
    const customAgents = modeAgents.filter((a) => a instanceof CustomAgent)
    if (builtInAgents.length > 1) {
      const activeDomains = builtInAgents.map((a) => {
        const defaultSpec = DEFAULT_DOMAINS.find((d) => d.name === a.name)
        return (
          defaultSpec || { name: a.name as AgentName, label: a.name, focus: 'General code review' }
        )
      })
      watchAgents = [new CombinedAnalyzer(activeDomains), ...customAgents]
    }
  }

  console.log(
    theme.accent(`  palade watch started. Watching for changes... (${sensitivity} sensitivity)`)
  )
  console.log(theme.dim('  Press Ctrl+C to stop.'))
  if (isContinuous) {
    console.log(theme.dim('  Continuous background sweep is ENABLED.'))
  }
  console.log()

  // Debounce per file — a single shared timer would let a change to file B
  // cancel file A's pending enqueue, silently dropping A from the scan queue.
  const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()
  let isProcessing = false
  const accumulatedFindings = new Map<string, AgentFinding[]>()
  const MAX_ACCUMULATED_FILES = 200
  let sweepQueue: string[] = []
  const urgentQueue: string[] = []
  const urgentSet = new Set<string>()
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
    } catch (err) {
      console.warn(theme.error(`⚠ Failed to initialize background sweep queue: ${err instanceof Error ? err.message : String(err)}`))
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
        return
      }

      const chunks = await chunkFiles(manifests)
      if (chunks.length === 0) {
        return
      }

      const context: AgentContext = {
        projectLanguages: [manifests[0].language],
        totalFiles: 1,
        totalChunks: chunks.length,
        mode: 'standard',
        includeSkills: config.swarm.includeSkills,
      }

      // Run the full agent set for the current mode/config, mirroring review
      // (including custom agents and economy-mode combined-analyzer routing,
      // both resolved once above into `watchAgents`).
      const agents = watchAgents
      const allFindings: AgentFinding[] = []
      let hasErrors = false
      // In economy mode, cap batch sizes the same way review.ts/diff.ts do
      // before passing options into runSwarm — otherwise this call falls
      // back to scheduler.ts's un-capped defaults (16000/6000), letting a
      // large watched file's economy-mode CombinedAnalyzer prompt run much
      // larger than the same mode produces via review/diff.
      const softTokenLimit = config.swarm.economyMode
        ? Math.min(ECONOMY_SOFT_TOKEN_CAP, config.swarm.softTokenLimit ?? 16000)
        : config.swarm.softTokenLimit
      const hardChunkLimit = config.swarm.economyMode
        ? Math.min(ECONOMY_HARD_CHUNK_CAP, config.swarm.hardChunkLimit ?? 6000)
        : config.swarm.hardChunkLimit
      const batches = scheduleBatches(chunks, softTokenLimit, hardChunkLimit)

      for (const agent of agents) {
        for (const batch of batches) {
          const timeoutMs = config.swarm.timeoutMs ?? DEFAULT_CONFIG.swarm!.timeoutMs
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
            hasErrors = true
            if (err instanceof Error && err.name === 'AbortError') {
              if (signal?.aborted) throw err // pass parent aborts up
              console.log(theme.dim(`    ⚠ ${agent.name} timed out.`))
            } else {
              console.log(theme.dim(`    ⚠ ${agent.name} failed: ${err instanceof Error ? err.message : String(err)}`))
            }
          } finally {
            clearTimeout(timer)
            if (signal) signal.removeEventListener('abort', onParentAbort)
          }
        }
      }

      let finalFindings = allFindings
      if (allFindings.length > 0) {
        finalFindings = mergeFindings(allFindings)
      }

      if (finalFindings.length > 0) {
        // Delete before set so a re-scan of a long-tracked file moves it to
        // the end of Map iteration order — Map.set() on an EXISTING key does
        // NOT move it to the end, so without this a re-scanned file stays at
        // its original insertion position and isn't protected from the
        // oldest-first eviction below (cli-004).
        accumulatedFindings.delete(filePath)
        accumulatedFindings.set(filePath, finalFindings)
        // Evict oldest entries when the map grows unbounded
        if (accumulatedFindings.size > MAX_ACCUMULATED_FILES) {
          const keysToDelete = [...accumulatedFindings.keys()].slice(
            0,
            accumulatedFindings.size - MAX_ACCUMULATED_FILES
          )
          for (const key of keysToDelete) accumulatedFindings.delete(key)
        }
        console.log('\n' + formatDriftAlert(filePath, finalFindings))
      } else if (!hasErrors) {
        accumulatedFindings.delete(filePath)
        console.log(theme.success(`  ✓ Clean: ${filePath}\n`))
      } else {
        console.log(theme.dim(`  ⚠ Scan incomplete due to errors, keeping previous findings for: ${filePath}\n`))
        throw new Error('Scan incomplete due to errors')
      }

      updateWatchReport()
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        console.log(theme.dim(`  ⚠ Aborted scan of ${filePath} for higher priority task.`))
        throw err
      }
      console.warn(theme.error(`  ⚠ Error scanning ${filePath}: ${err instanceof Error ? err.message : String(err)}`))
      throw err
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
        if (nextFile) urgentSet.delete(nextFile)
        // Deduplicate from sweep queue and push to back
        if (isContinuous && nextFile) {
          sweepQueue = sweepQueue.filter((f) => f !== nextFile)
          sweepQueue.push(nextFile)
        }
      } else if (isContinuous && sweepQueue.length > 0) {
        nextFile = sweepQueue.shift()
        currentSweepController = new AbortController()
      }

      if (nextFile) {
        const sweepFile = !isUrgent ? nextFile : undefined
        try {
          await analyzeFile(nextFile, currentSweepController?.signal)
          if (sweepFile) sweepQueue.push(sweepFile) // rotate to back after successful scan
        } catch (err: unknown) {
          if (err instanceof Error && err.name === 'AbortError' && !isUrgent) {
            // If background sweep was aborted, it means an urgent task came in.
            // Push the aborted file back to the front of the sweep queue so we try again later.
            sweepQueue.unshift(nextFile)
          } else {
            if (!sweepQueue.includes(nextFile)) {
              sweepQueue.push(nextFile)
            }
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

  const ignoreFilter = await buildIgnoreFilter(projectRoot)

  const watcher = chokidar.watch('.', {
    ignored: (path: string) => {
      const rel = path.replace(/\\/g, '/')
      if (rel === '.' || rel === '') return false
      return ignoreFilter.ignores(rel)
    },
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 300 },
  })

  watcher.on('unlink', (path: string) => {
    const timer = debounceTimers.get(path)
    if (timer) {
      clearTimeout(timer)
      debounceTimers.delete(path)
    }
  })

  // Enqueue a changed or newly-created file for review, debounced the same
  // way for both — a brand-new file created while `palade watch` is running
  // must be scanned just like a modified one, not silently skipped.
  const enqueueFileEvent = (path: string) => {
    const existing = debounceTimers.get(path)
    if (existing) clearTimeout(existing)
    debounceTimers.set(
      path,
      setTimeout(() => {
        debounceTimers.delete(path)
        // chokidar emits OS-native separators (backslash on Windows). walkProject
        // produces forward-slash paths, so normalise before passing as scope.
        const normalizedPath = path.split('\\').join('/')

        if (!urgentSet.has(normalizedPath)) {
          urgentSet.add(normalizedPath)
          urgentQueue.push(normalizedPath)
        }

        // A file created/changed after the watcher started must also join
        // the periodic background sweep in continuous mode — otherwise it's
        // scanned once via the urgent queue and then permanently excluded
        // from every future sweep for the rest of the session (cli-003).
        if (isContinuous && !sweepQueue.includes(normalizedPath)) {
          sweepQueue.push(normalizedPath)
        }

        if (currentSweepController) {
          currentSweepController.abort()
        }

        void processNext()
      }, debounceMs)
    )
  }

  watcher.on('change', enqueueFileEvent)
  watcher.on('add', enqueueFileEvent)

  let resolveDone: () => void
  const donePromise = new Promise<void>((r) => { resolveDone = r })

  const onExit = () => {
    try { watcher.close() } catch {}
  }
  const onSigint = () => resolveDone()

  process.on('exit', onExit)
  process.on('SIGINT', onSigint)

  try {
    await donePromise
  } finally {
    process.removeListener('exit', onExit)
    process.removeListener('SIGINT', onSigint)
    for (const timer of debounceTimers.values()) clearTimeout(timer)
    debounceTimers.clear()
    if (loopTimer) clearTimeout(loopTimer)
    try { watcher.close() } catch {}
  }
}
