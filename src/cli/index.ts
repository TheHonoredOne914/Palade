#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf-8'))

process.on('uncaughtException', (err) => {
  const msg = err instanceof Error ? err.message : String(err)
  if (msg.includes('Raw mode') || msg.includes('isRawModeSupported')) {
    process.exit(0)
  }
  console.error(err)
  process.exit(1)
})

const originalEmit = process.emit
process.emit = function (name: any, data: any, ...args: any[]) {
  if (name === 'warning' && typeof data === 'object') {
    if (
      data.code === 'MODULE_TYPELESS_PACKAGE_JSON' ||
      (data.message && data.message.includes('MODULE_TYPELESS_PACKAGE_JSON'))
    ) {
      return false
    }
  }
  return originalEmit.apply(process, [name, data, ...args] as any)
} as any

const rawArgs = process.argv.slice(2)
const hasCommand =
  rawArgs.some((a) => !a.startsWith('-') && a.length > 0) ||
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

  process.on('SIGINT', () => {
    console.log(chalk.dim('\n  Interrupted. Exiting cleanly.'))
    process.exit(0)
  })

  const isQuiet = process.argv.includes('--quiet')
  const isTuiCommand = process.argv.includes('tui')
  if (!isQuiet && !isTuiCommand) {
    printBanner({ version: pkg.version })
  }

  const program = new Command()

  program.name('palade').description('AI-powered codebase intelligence engine').version(pkg.version)

  // Consumed by loadConfig() via process.argv — registered here so Commander
  // doesn't reject it as an unknown option.
  program.option('--config <path>', 'Path to an alternate palade config .ts file')

  function collect(val: string, prev: string[]): string[] {
    return prev.concat([val])
  }

  program
    .command('review [path]')
    .description('Review codebase with AI swarm')
    .option('--target <name>', 'Review a named target from palade.targets.ts')
    .option('--all-targets', 'Review all defined targets')
    .option('--dir <path>', 'Scope review to a directory')
    .option('--file <path>', 'Scope to specific file(s)', collect, [])
    .option('--glob <pattern>', 'Scope to glob pattern')
    .option('--mode <mode>', 'Review mode: standard|security|onboard|debt|ghost', 'standard')
    .option('--annotations', 'Only review @palade-annotated items')
    .option('--pick', 'Interactive file picker')
    .option('--depth <n>', 'Symbol dependency trace depth', parseInt, 1)
    .option('--format <formats>', 'Output formats: html,json,md (default: from config)')
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
    .option('--base <branch>', 'Base branch to diff against', 'main')
    .option('--ci', 'CI mode: exit 1 if critical findings introduced')
    .action(async (opts: { base?: string; ci?: boolean }): Promise<void> => {
      try {
        await diffCommand(opts)
      } catch (err) {
        handleFatalError(err)
      }
    })

  program
    .command('watch')
    .description('Start drift detection watcher')
    .option('--sensitivity <level>', 'Drift sensitivity: low|medium|high', 'medium')
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
    .option('--days <number>', 'Number of days for stale check', parseInt, 30)
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
      '--set <key=value>',
      'Set a config value (repeatable)',
      (val: string, prev: string[]) => prev.concat([val]),
      []
    )
    .option('--init', 'Create default palade.config.ts and .paladeignore')
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
