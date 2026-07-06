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
import { AllProvidersExhaustedError } from '../providers/router.js'

export function formatErrorMessages(err: unknown): string[] {
  if (err instanceof PaladeConfigError) {
    const lines = [chalk.red(`Configuration error at ${err.field}:`), `  ${err.message}`]
    if (err.suggestion) lines.push(chalk.dim(`  Hint: ${err.suggestion}`))
    return lines
  }

  if (err instanceof WorkspaceTooLargeError) {
    return [
      chalk.red(err.message),
      chalk.dim(`  To prevent memory exhaustion, Palade aborted the scan.`),
      chalk.dim(`  Please narrow the scope using --dir, --file, or .paladeignore rules.`),
    ]
  }

  if (err instanceof NoProvidersError) {
    return [
      chalk.red(`No providers available.`),
      `  ${err.message}`,
      chalk.dim(`\n  Quick fix (pick one provider):`),
      chalk.dim(`    export GROQ_API_KEY=your_key_here`),
      chalk.dim(`    export NVIDIA_API_KEY=your_key_here`),
      chalk.dim(`    export CEREBRAS_API_KEY=your_key_here`),
      chalk.dim(`    export OPENROUTER_API_KEY=your_key_here`),
      chalk.dim(`    export OPENCODE_ZEN_API_KEY=your_key_here`),
      chalk.dim(`    # or run locally: OLLAMA_MODEL=codellama:13b npx palade review`),
    ]
  }

  if (err instanceof TargetNotFoundError) {
    return [
      chalk.red(err.message),
      chalk.dim(`  Run 'palade targets list' to see defined targets.`),
    ]
  }

  if (err instanceof SwarmTimeoutError) {
    return [
      chalk.yellow(`Swarm timed out. ${err.completedAgents}/${err.totalAgents} agents completed.`),
      chalk.dim(`  Partial results will be included in the report.`),
      chalk.dim(`  To increase timeout: set swarm.timeoutMs in palade.config.ts`),
    ]
  }

  if (err instanceof AllProvidersExhaustedError) {
    const lines = [
      chalk.red(`All LLM providers failed. Palade could not complete this review.`),
      '',
      'Attempted providers:',
    ]
    err.attempts.forEach((attempt, i) => {
      lines.push(`  ${i + 1}. ${attempt.provider.padEnd(10)} → ${attempt.finalError}`)
    })
    lines.push('', 'Suggestions:', '  • Check your API key environment variables')
    return lines
  }

  if (err instanceof Error) {
    const debug = process.env.DEBUG === 'palade'
    const lines = [chalk.red(`Unexpected error: ${err.message}`)]
    if (debug) {
      lines.push(chalk.dim(err.stack ?? ''))
      const {
        message: _message,
        stack: _stack,
        ...extra
      } = err as unknown as Record<string, unknown>
      if (Object.keys(extra).length > 0) {
        lines.push(chalk.dim(JSON.stringify(sanitizeForLog(extra), null, 2)))
      }
    } else {
      lines.push(chalk.dim(`  Run with DEBUG=palade for full stack trace.`))
    }
    return lines.filter(Boolean)
  }

  return [chalk.red(`Unexpected error: ${String(err)}`)]
}

export function handleFatalError(err: unknown): undefined {
  // A CliExitError is a command signalling "exit with this code". The command
  // has already printed any user-facing message, so we just translate it into a
  // real process exit. This lets the same commands run safely inside the TUI,
  // where the host must survive — the TUI catches the throw instead of exiting.
  if (err instanceof CliExitError) {
    process.exit(err.exitCode)
  }

  for (const line of formatErrorMessages(err)) {
    console.error(line)
  }
  process.exit(1)
}
