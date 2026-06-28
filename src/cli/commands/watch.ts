import chokidar from 'chokidar'
import chalk from 'chalk'
import { loadConfig } from '../../config/loader.js'
import { initRouter, getProvider } from '../../providers/router.js'
import { walkProject } from '../../ingestion/walker.js'
import { chunkFiles } from '../../ingestion/chunker.js'
import type { AgentFinding, AgentContext } from '../../agents/base.js'
import { MaintainabilityAgent } from '../../agents/specialist/maintainability.js'
import { ArchitectureAgent } from '../../agents/specialist/architecture.js'
import { theme } from '../../ui/theme.js'
import { CliExitError } from '../../errors/types.js'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const DEBOUNCE_MS: Record<string, number> = {
  low: 5000,
  medium: 2000,
  high: 500,
}

export async function watchCommand(opts: { sensitivity?: string }): Promise<void> {
  const projectRoot = process.cwd()
  const sensitivity = opts.sensitivity ?? 'medium'
  const debounceMs = DEBOUNCE_MS[sensitivity] ?? 2000

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
  console.log()

  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let isProcessing = false
  const accumulatedFindings = new Map<string, AgentFinding[]>()

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

  const analyzeFile = async (filePath: string): Promise<void> => {
    if (isProcessing) return
    isProcessing = true

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

      for (const agent of agents) {
        try {
          const findings = await agent.analyze(chunks, context)
          allFindings.push(...findings)
        } catch {
          // silent — watch mode is best-effort
        }
      }

      if (allFindings.length > 0) {
        accumulatedFindings.set(filePath, allFindings)
        console.log(theme.warning(`  ⚠ Drift detected in ${filePath}`))
        for (const f of allFindings.slice(0, 3)) {
          const loc = f.lineStart ? `:${f.lineStart}` : ''
          console.log(
            `    ${theme.dim(f.agentName)}: ${f.title} ${theme.dim(`${f.filePath}${loc}`)}`
          )
        }
        if (allFindings.length > 3) {
          console.log(theme.dim(`    ... and ${allFindings.length - 3} more`))
        }
        console.log()
      } else {
        accumulatedFindings.delete(filePath)
        console.log(theme.success(`  ✓ Clean: ${filePath}\n`))
      }

      updateWatchReport()
    } catch {
      // watch mode never crashes
    } finally {
      isProcessing = false
    }
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
      void analyzeFile(path.split('\\').join('/'))
    }, debounceMs)
  })

  process.on('exit', () => {
    watcher.close()
  })

  process.on('SIGINT', () => {
    if (debounceTimer) clearTimeout(debounceTimer)
    watcher.close()
    console.log(theme.dim('\n  Watcher stopped.'))
    process.exit(0)
  })

  // Keep process alive
  await new Promise(() => {})
}
