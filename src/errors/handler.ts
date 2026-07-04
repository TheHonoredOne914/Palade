import chalk from 'chalk'
import {
  PaladeConfigError,
  NoProvidersError,
  TargetNotFoundError,
  SwarmTimeoutError,
  WorkspaceTooLargeError,
  CliExitError,
} from './types.js'
import { sanitizeForLog } from '../utils/sanitize.js'

export function handleFatalError(err: unknown): undefined {
  const debug = process.env.DEBUG === 'palade'

  // A CliExitError is a command signalling "exit with this code". The command
  // has already printed any user-facing message, so we just translate it into
  // a real process exit. This lets the same commands run safely inside the TUI,
  // where the host must survive — the TUI catches the throw instead of exiting.
  if (err instanceof CliExitError) {
    process.exit(err.exitCode)
  }

  if (err instanceof PaladeConfigError) {
    console.error(chalk.red(`\nConfiguration error at ${err.field}:`))
    console.error(`  ${err.message}`)
    if (err.suggestion) console.error(chalk.dim(`  Hint: ${err.suggestion}`))
    process.exit(1)
  }

  if (err instanceof WorkspaceTooLargeError) {
    console.error(chalk.red(`\n${err.message}`))
    console.error(chalk.dim(`  To prevent memory exhaustion, Palade aborted the scan.`))
    console.error(
      chalk.dim(`  Please narrow the scope using --dir, --file, or .paladeignore rules.`)
    )
    process.exit(1)
  }

  if (err instanceof NoProvidersError) {
    console.error(chalk.red(`\nNo providers available.`))
    console.error(`  ${err.message}`)
    console.error(chalk.dim(`\n  Quick fix:`))
    console.error(chalk.dim(`    export GROQ_API_KEY=your_key_here`))
    console.error(chalk.dim(`    npx palade review`))
    process.exit(1)
  }

  if (err instanceof TargetNotFoundError) {
    console.error(chalk.red(`\n${err.message}`))
    console.error(chalk.dim(`  Run 'palade targets list' to see defined targets.`))
    process.exit(1)
  }

  if (err instanceof SwarmTimeoutError) {
    console.error(
      chalk.yellow(`\nSwarm timed out. ${err.completedAgents}/${err.totalAgents} agents completed.`)
    )
    console.error(chalk.dim(`  Partial results will be included in the report.`))
    console.error(chalk.dim(`  To increase timeout: set swarm.timeoutMs in palade.config.ts`))
    process.exit(1)
  }

  console.error(
    chalk.red(`\nUnexpected error: ${err instanceof Error ? err.message : String(err)}`)
  )
  if (debug && err instanceof Error) {
    console.error(chalk.dim(err.stack))
    // Errors bubbled up from HTTP-based provider clients often carry extra
    // properties (e.g. request/response objects with Authorization headers
    // or API keys) beyond `message`/`stack`. Redact those before printing.
    const { message: _message, stack: _stack, ...extra } = err as unknown as Record<string, unknown>
    if (Object.keys(extra).length > 0) {
      console.error(chalk.dim(JSON.stringify(sanitizeForLog(extra), null, 2)))
    }
  } else {
    console.error(chalk.dim(`  Run with DEBUG=palade for full stack trace.`))
  }
  process.exit(1)
}
