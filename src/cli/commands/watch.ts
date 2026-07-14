import chokidar, { type FSWatcher } from 'chokidar'
import chalk from 'chalk'
import { loadConfig } from '../../config/loader.js'
import type { PaladeConfig } from '../../config/schema.js'
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
import { applyEconomyRouting, applyEconomyLimits } from '../../orchestrator/economy.js'
import { CustomAgent } from '../../agents/custom/agent.js'
import { theme } from '../../ui/theme.js'
import { formatDriftAlert } from '../../ui/layout.js'
import { CliExitError } from '../../errors/types.js'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { mergeFindings } from '../../orchestrator/merger.js'

const DEBOUNCE_MS: Record<string, number> = {
  low: 5000,
  medium: 2000,
  high: 500,
}

class WatchController {
  private readonly projectRoot: string
  private readonly debounceMs: number
  private readonly isContinuous: boolean
  private readonly config: PaladeConfig
  private readonly watchAgents: IAgent[]

  private readonly debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private isProcessing = false
  private readonly accumulatedFindings = new Map<string, AgentFinding[]>()
  private readonly MAX_ACCUMULATED_FILES = 200
  
  private sweepQueue: string[] = []
  private readonly urgentQueue: string[] = []
  private readonly urgentSet = new Set<string>()
  private readonly sweepSet = new Set<string>()
  
  private loopTimer: ReturnType<typeof setTimeout> | null = null
  private currentSweepController: AbortController | null = null
  private watcher: FSWatcher | null = null
  private resolveDone!: () => void
  private donePromise!: Promise<void>
  private readonly boundOnExit = this.onExit.bind(this)
  private readonly boundOnSigint = this.onSigint.bind(this)

  constructor(
    projectRoot: string,
    debounceMs: number,
    isContinuous: boolean,
    config: PaladeConfig,
    watchAgents: IAgent[]
  ) {
    this.projectRoot = projectRoot
    this.debounceMs = debounceMs
    this.isContinuous = isContinuous
    this.config = config
    this.watchAgents = watchAgents
  }

  public async start(): Promise<void> {
    if (this.isContinuous) {
      console.log(
        theme.dim(`  Continuous background sweep enabled. Resolving initial file list...`)
      )
      try {
        const manifests = await walkProject(this.projectRoot, { projectRoot: this.projectRoot })
        this.sweepQueue = manifests.map((m) => m.path)
        manifests.forEach(m => this.sweepSet.add(m.path))
      } catch (err) {
        console.warn(theme.error(`⚠ Failed to initialize background sweep queue: ${err instanceof Error ? err.message : String(err)}`))
      }
    }

    // Initial empty report
    void this.updateWatchReport()

    // Kick off the background sweep if continuous is enabled
    if (this.isContinuous) {
      void this.processNext()
    }

    const ignoreFilter = await buildIgnoreFilter(this.projectRoot)

    this.watcher = chokidar.watch('.', {
      ignored: (path: string) => {
        const rel = path.replace(/\\/g, '/')
        if (rel === '.' || rel === '') return false
        return ignoreFilter.ignores(rel)
      },
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 300 },
    })

    this.watcher.on('unlink', (path: string) => {
      const timer = this.debounceTimers.get(path)
      if (timer) {
        clearTimeout(timer)
        this.debounceTimers.delete(path)
      }
    })

    const boundEnqueue = this.enqueueFileEvent.bind(this)
    this.watcher.on('change', boundEnqueue)
    this.watcher.on('add', boundEnqueue)

    this.donePromise = new Promise<void>((r) => { this.resolveDone = r })
    
    process.on('exit', this.boundOnExit)
    process.on('SIGINT', this.boundOnSigint)

    try {
      await this.donePromise
    } finally {
      this.stop()
    }
  }

  private stop(): void {
    process.removeListener('exit', this.boundOnExit)
    process.removeListener('SIGINT', this.boundOnSigint)
    for (const timer of this.debounceTimers.values()) clearTimeout(timer)
    this.debounceTimers.clear()
    if (this.loopTimer) clearTimeout(this.loopTimer)
    try { this.watcher?.close() } catch {}
  }

  private onExit(): void {
    try { this.watcher?.close() } catch {}
  }

  private onSigint(): void {
    this.resolveDone()
  }

  private enqueueFileEvent(path: string): void {
    const existing = this.debounceTimers.get(path)
    if (existing) clearTimeout(existing)
    
    this.debounceTimers.set(
      path,
      setTimeout(() => {
        this.debounceTimers.delete(path)
        const normalizedPath = path.split('\\').join('/')

        if (!this.urgentSet.has(normalizedPath)) {
          this.urgentSet.add(normalizedPath)
          this.urgentQueue.push(normalizedPath)
        }

        if (this.isContinuous && !this.sweepSet.has(normalizedPath)) {
          this.sweepQueue.push(normalizedPath)
          this.sweepSet.add(normalizedPath)
        }

        if (this.currentSweepController) {
          this.currentSweepController.abort()
        }

        void this.processNext()
      }, this.debounceMs)
    )
  }

  private async processNext(): Promise<void> {
    if (this.isProcessing) return
    this.isProcessing = true
    this.currentSweepController = null

    try {
      let nextFile: string | undefined
      const isUrgent = this.urgentQueue.length > 0

      if (isUrgent) {
        nextFile = this.urgentQueue.shift()
        if (nextFile) this.urgentSet.delete(nextFile)
        
        if (this.isContinuous && nextFile) {
          this.sweepQueue = this.sweepQueue.filter((f) => f !== nextFile)
          this.sweepQueue.push(nextFile)
          this.sweepSet.add(nextFile)
        }
      } else if (this.isContinuous && this.sweepQueue.length > 0) {
        nextFile = this.sweepQueue.shift()
        if (nextFile) this.sweepSet.delete(nextFile)
        this.currentSweepController = new AbortController()
      }

      if (nextFile) {
        try {
          await this.analyzeFile(nextFile, this.currentSweepController?.signal)
          if (!isUrgent && !this.sweepSet.has(nextFile)) {
            this.sweepQueue.push(nextFile)
            this.sweepSet.add(nextFile)
          }
        } catch (err: unknown) {
          if (err instanceof Error && err.name === 'AbortError' && !isUrgent) {
            if (!this.sweepSet.has(nextFile)) {
              this.sweepQueue.unshift(nextFile)
              this.sweepSet.add(nextFile)
            }
          }
          // Non-abort errors: don't re-queue. Persistent failures (permission
          // denied, corrupt file) would cause infinite retries otherwise.
          // ponytail: no backoff; the file re-enters via enqueueFileEvent if it
          // changes again.
        }
      }
    } finally {
      this.isProcessing = false
      this.currentSweepController = null
      if (this.loopTimer) clearTimeout(this.loopTimer)
      if (this.urgentQueue.length > 0 || this.isContinuous) {
        this.loopTimer = setTimeout(
          () => {
            void this.processNext()
          },
          this.urgentQueue.length > 0 ? 100 : 3000
        )
      }
    }
  }

  private async analyzeFile(filePath: string, signal?: AbortSignal): Promise<void> {
    console.log(theme.dim(`\n  Scanning ${filePath}...`))

    try {
      const scope = { projectRoot: this.projectRoot, files: [filePath] }
      const manifests = await walkProject(this.projectRoot, scope)
      if (manifests.length === 0) return

      const chunks = await chunkFiles(manifests)
      if (chunks.length === 0) return

      const context: AgentContext = {
        projectLanguages: [manifests[0].language],
        totalFiles: 1,
        totalChunks: chunks.length,
        mode: 'standard',
        includeSkills: this.config.swarm.includeSkills,
      }

      const allFindings: AgentFinding[] = []
      let hasErrors = false
      const { softTokenLimit, hardChunkLimit } = applyEconomyLimits(
        !!this.config.swarm.economyMode,
        this.config.swarm.softTokenLimit,
        this.config.swarm.hardChunkLimit
      )
      const batches = scheduleBatches(chunks, softTokenLimit, hardChunkLimit)
      const timeoutMs = this.config.swarm.timeoutMs ?? DEFAULT_CONFIG.swarm!.timeoutMs

      for (const agent of this.watchAgents) {
        for (const batch of batches) {
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
              if (signal?.aborted) throw err 
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
        this.accumulatedFindings.set(filePath, finalFindings)
        if (this.accumulatedFindings.size > this.MAX_ACCUMULATED_FILES) {
          const keysToDelete = [...this.accumulatedFindings.keys()].slice(
            0,
            this.accumulatedFindings.size - this.MAX_ACCUMULATED_FILES
          )
          for (const key of keysToDelete) this.accumulatedFindings.delete(key)
        }
        console.log('\n' + formatDriftAlert(filePath, finalFindings))
      } else if (!hasErrors) {
        this.accumulatedFindings.delete(filePath)
        console.log(theme.success(`  ✓ Clean: ${filePath}\n`))
      } else {
        console.log(theme.dim(`  ⚠ Scan incomplete due to errors, keeping previous findings for: ${filePath}\n`))
        throw new Error('Scan incomplete due to errors')
      }

      void this.updateWatchReport()
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        console.log(theme.dim(`  ⚠ Aborted scan of ${filePath} for higher priority task.`))
        throw err
      }
      console.warn(theme.error(`  ⚠ Error scanning ${filePath}: ${err instanceof Error ? err.message : String(err)}`))
      throw err
    }
  }

  private async updateWatchReport(): Promise<void> {
    try {
      const paladeDir = join(this.projectRoot, '.palade')
      await mkdir(paladeDir, { recursive: true })
      const mdPath = join(paladeDir, 'watch-bugs.md')

      const lines = [
        '# Watch Mode Findings',
        '',
        `*Last updated: ${new Date().toLocaleTimeString()}*`,
        '',
      ]

      if (this.accumulatedFindings.size === 0) {
        lines.push('No issues detected in actively watched files.')
      } else {
        for (const [file, findings] of this.accumulatedFindings.entries()) {
          lines.push(`## \`${file}\``, '')
          for (const f of findings) {
            const loc = f.lineStart ? ` (Line ${f.lineStart})` : ''
            lines.push(`- **[${f.severity.toUpperCase()}]** ${f.title}${loc}`)
            lines.push(`  - *${f.agentName}*: ${f.description}`)
          }
          lines.push('')
        }
      }

      await writeFile(mdPath, lines.join('\n'), 'utf-8')
    } catch {
      // Ignore write errors in watch mode
    }
  }
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

  const modeAgents = getAgentsForMode('standard', undefined, customAgentDefs)
  const watchAgents = applyEconomyRouting(modeAgents, !!config.swarm.economyMode)

  console.log(
    theme.accent(`  palade watch started. Watching for changes... (${sensitivity} sensitivity)`)
  )
  console.log(theme.dim('  Press Ctrl+C to stop.'))
  if (isContinuous) {
    console.log(theme.dim('  Continuous background sweep is ENABLED.'))
  }
  console.log()

  const controller = new WatchController(
    projectRoot,
    debounceMs,
    isContinuous,
    config,
    watchAgents
  )

  await controller.start()
}
