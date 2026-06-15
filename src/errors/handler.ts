import chalk from 'chalk'
import {
  PaladeConfigError,
  NoProvidersError,
  TargetNotFoundError,
  SwarmTimeoutError,
} from './types.js'

export function handleFatalError(err: unknown): undefined {
  const debug = process.env.DEBUG === 'palade'

  if (err instanceof PaladeConfigError) {
    console.error(chalk.red(`\nConfiguration error at ${err.field}:`))
    console.error(`  ${err.message}`)
    if (err.suggestion) console.error(chalk.dim(`  Hint: ${err.suggestion}`))
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
    console.error(chalk.yellow(`\nSwarm timed out. ${err.completedAgents}/${err.totalAgents} agents completed.`))
    console.error(chalk.dim(`  Partial results will be included in the report.`))
    console.error(chalk.dim(`  To increase timeout: set swarm.timeoutMs in palade.config.ts`))
    return undefined
  }

  console.error(chalk.red(`\nUnexpected error: ${err instanceof Error ? err.message : String(err)}`))
  if (debug && err instanceof Error) {
    console.error(chalk.dim(err.stack))
  } else {
    console.error(chalk.dim(`  Run with DEBUG=palade for full stack trace.`))
  }
  process.exit(1)
}
