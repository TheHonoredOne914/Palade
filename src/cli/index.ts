import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(
  readFileSync(join(__dirname, '../../package.json'), 'utf-8')
)

// Detect if user passed a command (anything that isn't a flag)
const rawArgs = process.argv.slice(2)
const hasCommand = rawArgs.some(
  (a) => !a.startsWith('-') && a.length > 0
) || rawArgs.includes('--help') || rawArgs.includes('-h') || rawArgs.includes('--version') || rawArgs.includes('-V')

if (hasCommand) {
  runClassicCLI()
} else {
  launchTUI()
}

async function launchTUI(): Promise<void> {
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

  process.on('unhandledRejection', (reason) => {
    handleFatalError(reason)
  })

  process.on('uncaughtException', (err) => {
    handleFatalError(err)
  })

  process.on('SIGINT', () => {
    console.log(chalk.dim('\n  Interrupted. Exiting cleanly.'))
    process.exit(0)
  })

  const isQuiet = process.argv.includes('--quiet')
  if (!isQuiet) {
    printBanner({ version: pkg.version })
  }

  const program = new Command()

  program
    .name('palade')
    .description('AI-powered codebase intelligence engine')
    .version(pkg.version)

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
    .option(
      '--mode <mode>',
      'Review mode: standard|security|onboard|debt|ghost',
      'standard'
    )
    .option('--annotations', 'Only review @palade-annotated items')
    .option('--pick', 'Interactive file picker')
    .option('--depth <n>', 'Symbol dependency trace depth', parseInt, 1)
    .option('--format <formats>', 'Output formats: html,json,md', 'html,json')
    .option('--no-open', 'Do not open browser after review')
    .option('--quiet', 'Minimal terminal output (no spinners)')
    .action(
      async (
        pathArg: string | undefined,
        opts: Record<string, unknown>
      ): Promise<void> => {
        try {
          await reviewCommand(
            pathArg,
            opts as Parameters<typeof reviewCommand>[1]
          )
        } catch (err) {
          handleFatalError(err)
        }
      }
    )

  program
    .command('diff')
    .description('Branch pre-flight review')
    .option('--base <branch>', 'Base branch to diff against', 'main')
    .option('--ci', 'CI mode: exit 1 if critical findings introduced')
    .action(async (opts: { base?: string; ci?: boolean }): Promise<void> => {
      await diffCommand(opts)
    })

  program
    .command('watch')
    .description('Start drift detection watcher')
    .option(
      '--sensitivity <level>',
      'Drift sensitivity: low|medium|high',
      'medium'
    )
    .action(
      async (opts: { sensitivity?: string }): Promise<void> => {
        await watchCommand(opts)
      }
    )

  program
    .command('score')
    .description('Show current score and history')
    .option('--history', 'Show full score history')
    .action(
      async (opts: { history?: boolean }): Promise<void> => {
        await scoreCommand(opts)
      }
    )

  program.addCommand(targetsCommand)

  program
    .command('settings')
    .description('Interactive settings manager')
    .action(settingsCommand)

  program
    .command('init')
    .description('Scaffold Palade config in current directory')
    .option('-y, --yes', 'Skip confirmation prompts')
    .action(
      async (opts: { yes?: boolean }): Promise<void> => {
        await initCommand(opts)
      }
    )

  program.parse()
}
