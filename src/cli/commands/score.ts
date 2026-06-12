import { join } from 'node:path'
import { readHistory } from '../../scorer/history.js'
import { loadConfig } from '../../config/loader.js'
import chalk from 'chalk'

export async function scoreCommand(): Promise<void> {
  try {
    const config = await loadConfig()
    const historyPath = join(process.cwd(), config.score.historyFile)
    const entries = readHistory(historyPath)

    if (entries.length === 0) {
      console.log(chalk.gray('No score history found. Run `palade review` first.'))
      return
    }

    const latest = entries[entries.length - 1]
    const previous = entries.length > 1 ? entries[entries.length - 2] : null
    const delta = previous ? latest.score - previous.score : 0

    console.log('')
    console.log(chalk.bold('Codebase Health Score'))
    console.log(`  Score: ${chalk.bold(String(latest.score))}/100`)
    console.log(`  Delta: ${delta >= 0 ? chalk.green(`+${delta}`) : chalk.red(String(delta))}`)
    console.log(`  Run:   ${chalk.gray(latest.runId)} @ ${chalk.gray(latest.timestamp)}`)
    console.log('')
    console.log(chalk.bold('Category Breakdown:'))
    for (const cat of latest.breakdown.categories) {
      const filled = Math.round(cat.score / 10)
      const bar = '█'.repeat(filled) + '░'.repeat(10 - filled)
      console.log(`  ${cat.category.padEnd(20)} ${bar} ${cat.score}`)
    }
    console.log('')
  } catch (err) {
    console.error(chalk.red(`Score lookup failed: ${(err as Error).message}`))
    process.exit(1)
  }
}
