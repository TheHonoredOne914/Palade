#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { VALUE_FLAG_STRINGS } from './flags.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf-8'))

process.on('uncaughtException', (err) => {
  const msg = err instanceof Error ? err.message : String(err)
  // Ink (the TUI library) throws a plain `new Error(...)` for this condition
  // — no dedicated error class/code to match on instead (checked ink's
  // App.js source: both raw-mode-unsupported messages are free text). As a
  // partial mitigation, require BOTH substrings together instead of either
  // alone, so an unrelated crash whose message happens to contain just one
  // of the two terms isn't silently swallowed (cli-005).
  if (msg.includes('Raw mode') && msg.includes('isRawModeSupported')) {
    process.exit(0)
  }
  console.error(err)
  process.exit(1)
})

const originalEmit = process.emit
process.emit = function (name: string | symbol, ...args: unknown[]) {
  const data = args[0]
  if (name === 'warning' && typeof data === 'object' && data !== null) {
    const w = data as { code?: string; message?: string }
    if (
      w.code === 'MODULE_TYPELESS_PACKAGE_JSON' ||
      (w.message && w.message.includes('MODULE_TYPELESS_PACKAGE_JSON'))
    ) {
      return false
    }
  }
  return originalEmit.apply(process, [name, ...args] as Parameters<typeof process.emit>)
} as typeof process.emit

const rawArgs = process.argv.slice(2)
// --config takes a value; exclude it so `palade --config foo.ts` isn't
// mistaken for a subcommand invocation (foo.ts doesn't start with '-').
const configIdx = rawArgs.indexOf('--config')
const commandScanArgs = configIdx !== -1 ? rawArgs.filter((_, i) => i !== configIdx + 1) : rawArgs
const hasCommand =
  commandScanArgs.some((a) => !a.startsWith('-') && a.length > 0) ||
  rawArgs.includes('--help') ||
  rawArgs.includes('-h') ||
  rawArgs.includes('--version') ||
  rawArgs.includes('-V')

if (hasCommand) {
  runClassicCLI()
} else {
  launchTUI()
}

async function launchTUI(): Promise<void> {
  const { default: chalk } = await import('chalk')
  if (!process.stdout.isTTY || !process.stdin.isTTY) {
    console.log(
      chalk.dim('Interactive TUI requires a terminal. Showing available commands instead:\n')
    )
    console.log('  palade review [path]     Review codebase with AI swarm')
    console.log('  palade diff               Review changes since a branch')
    console.log('  palade watch              Continuous background review')
    console.log('  palade score              Show current health score')
    console.log('  palade init               Set up Palade in this project')
    console.log(chalk.dim('\nRun `palade --help` for the full command list.'))
    return
  }
  const { launchTUI: startTUI } = await import('../tui/launch.js')
  await startTUI()
}

async function runClassicCLI(): Promise<void> {
  const { Command } = await import('commander')
  const { default: chalk } = await import('chalk')
  const { printBanner } = await import('../ui/banner.js')
  const { handleFatalError } = await import('../errors/handler.js')
  const { reviewCommand } = await import('./commands/review.js')
  const { initCommand } = await import('./commands/init.js')
  const { scoreCommand } = await import('./commands/score.js')
  const { targetsCommand } = await import('./commands/targets.js')
  const { diffCommand } = await import('./commands/diff.js')
  const { watchCommand } = await import('./commands/watch.js')
  const { settingsCommand } = await import('./commands/settings.js')
  const { decisionsCommand } = await import('./commands/decisions.js')

  process.on('unhandledRejection', (reason) => {
    handleFatalError(reason)
  })

  // Identify the actual subcommand token (mirrors the hasCommand scan above:
  // the first non-flag arg, excluding --config's value) instead of scanning
  // the whole argv for the literal string 'tui' — that scan misfired on e.g.
  // `palade diff --base tui` (a branch literally named "tui"), which supplies
  // 'tui' as an option VALUE, not the subcommand.
  const subcommandToken = commandScanArgs.find((a) => !a.startsWith('-'))
  const isTuiCommand = subcommandToken === 'tui'
  // --quiet is only a `review` option (see the `.option('--quiet', ...)`
  // registered on the review command below) — a bare `process.argv.includes`
  // scan fired for ANY subcommand whose arguments happened to include the
  // literal string '--quiet' too (e.g. passed positionally/misplaced), which
  // isn't actually valid there. Gate it on the resolved subcommand instead,
  // mirroring isTuiCommand/isWatchCommand just below (cli-008).
  const isQuiet = subcommandToken === 'review' && process.argv.includes('--quiet')
  // 'watch' registers its own SIGINT handler (clears debounce timers, closes
  // the file watcher) later, after this classic-CLI handler would already
  // have synchronously exited — same reasoning as the 'tui' exclusion below
  // (cli-002).
  const isWatchCommand = subcommandToken === 'watch'

  // Don't install the classic-CLI SIGINT handler when dispatching to the
  // 'tui' or 'watch' subcommands: it calls process.exit(0) immediately, which
  // would hard-kill the process on Ctrl+C before the TUI's own SIGINT
  // handler (installed once <App/> mounts) or watch.ts's own cleanup handler
  // gets a chance to run.
  if (!isTuiCommand && !isWatchCommand) {
    process.on('SIGINT', () => {
      console.log(chalk.dim('\n  Interrupted. Exiting cleanly.'))
      process.exit(0)
    })
  }

  if (!isQuiet && !isTuiCommand) {
    printBanner({ version: pkg.version })
  }

  const program = new Command()

  program.name('palade').description('AI-powered codebase intelligence engine').version(pkg.version)

  // Consumed by loadConfig() via process.argv — registered here so Commander
  // doesn't reject it as an unknown option.
  program.option(VALUE_FLAG_STRINGS.config, 'Path to an alternate palade config .ts file')

  function collect(val: string, prev: string[]): string[] {
    return prev.concat([val])
  }

  program
    .command('review [path]')
    .description('Review codebase with AI swarm')
    .option(VALUE_FLAG_STRINGS.target, 'Review a named target from palade.targets.ts')
    .option('--all-targets', 'Review all defined targets')
    .option(VALUE_FLAG_STRINGS.dir, 'Scope review to a directory')
    .option(VALUE_FLAG_STRINGS.file, 'Scope to specific file(s)', collect, [])
    .option(VALUE_FLAG_STRINGS.glob, 'Scope to glob pattern')
    .option(
      VALUE_FLAG_STRINGS.mode,
      'Review mode: standard|security|onboard|debt|ghost',
      'standard'
    )
    .option('--annotations', 'Only review @palade-annotated items')
    .option('--pick', 'Interactive file picker')
    .option(VALUE_FLAG_STRINGS.depth, 'Symbol dependency trace depth', (v) => parseInt(v, 10), 1)
    .option(VALUE_FLAG_STRINGS.format, 'Output formats: html,json,md (default: from config)')
    .option('--no-open', 'Do not open browser after review')
    .option('--quiet', 'Minimal terminal output (no spinners)')
    .option('--dry-run', 'Estimate token usage and cost without running the swarm')
    .option(
      '--economy',
      'Economy mode: single combined call per batch (lower cost, higher latency)'
    )
    .option(
      '-e, --exhaustive',
      'Exhaustive mode: skip triage and analyze the entire project (maximum issues)'
    )
    .option(
      '--strict-triage',
      'Strict triage mode: halt if triage drops any files due to token limits'
    )
    .option('--no-verdict', 'Disable Verdict Mode (no conflict resolution)')
    .action(async (pathArg: string | undefined, opts: Record<string, unknown>): Promise<void> => {
      try {
        await reviewCommand(pathArg, opts as Parameters<typeof reviewCommand>[1])
      } catch (err) {
        handleFatalError(err)
      }
    })

  program
    .command('diff')
    .description('Branch pre-flight review')
    .option(VALUE_FLAG_STRINGS.base, 'Base branch to diff against', 'main')
    .option('--ci', 'CI mode: exit 1 if critical findings introduced')
    .option(
      '--strict-triage',
      'Strict triage mode: halt if triage drops any files due to token limits'
    )
    .action(
      async (opts: { base?: string; ci?: boolean; strictTriage?: boolean }): Promise<void> => {
        try {
          await diffCommand(opts)
        } catch (err) {
          handleFatalError(err)
        }
      }
    )

  program
    .command('watch')
    .description('Start drift detection watcher')
    .option(VALUE_FLAG_STRINGS.sensitivity, 'Drift sensitivity: low|medium|high', 'medium')
    .option('-c, --continuous', 'Continuously sweep the codebase in the background when idle')
    .action(async (opts: { sensitivity?: string; continuous?: boolean }): Promise<void> => {
      try {
        await watchCommand(opts)
      } catch (err) {
        handleFatalError(err)
      }
    })

  program
    .command('decisions [action] [slug]')
    .description('Manage architecture decisions (Verdict Mode ADRs)')
    .option(VALUE_FLAG_STRINGS.days, 'Number of days for stale check', (v) => parseInt(v, 10), 30)
    .action(
      async (
        action: string | undefined,
        slug: string | undefined,
        opts: { days?: number }
      ): Promise<void> => {
        try {
          await decisionsCommand(action, slug, opts)
        } catch (err) {
          handleFatalError(err)
        }
      }
    )

  program
    .command('score')
    .description('Show current score and history')
    .option('--history', 'Show full score history')
    .action(async (opts: { history?: boolean }): Promise<void> => {
      try {
        await scoreCommand(opts)
      } catch (err) {
        handleFatalError(err)
      }
    })

  program.addCommand(targetsCommand)

  program
    .command('settings')
    .description('View and update Palade config')
    .option(
      VALUE_FLAG_STRINGS.set,
      'Set a config value (repeatable)',
      (val: string, prev: string[]) => prev.concat([val]),
      []
    )
    .option('--init', 'Create default palade.config.ts and .palade/ignore')
    .option('--list', 'Show current config (default)')
    .action(async (opts: { set?: string[]; init?: boolean; list?: boolean }): Promise<void> => {
      try {
        await settingsCommand(opts)
      } catch (err) {
        handleFatalError(err)
      }
    })

  program
    .command('init')
    .description('Scaffold Palade config in current directory')
    .option('-y, --yes', 'Skip confirmation prompts')
    .action(async (opts: { yes?: boolean }): Promise<void> => {
      try {
        await initCommand(opts)
      } catch (err) {
        handleFatalError(err)
      }
    })

  program
    .command('tui')
    .description('Launch the interactive Terminal UI')
    .action(async (): Promise<void> => {
      try {
        const { launchTUI } = await import('../tui/launch.js')
        await launchTUI()
      } catch (err: unknown) {
        console.error(chalk.yellow('\n⚠ TUI failed to load. Falling back to classic CLI.'))
        console.error(chalk.dim('Reason: ' + (err instanceof Error ? err.message : String(err))))
      }
    })

  program.parse()
}
