import { Command } from 'commander'
import { reviewCommand } from './commands/review.js'
import { initCommand } from './commands/init.js'
import { scoreCommand } from './commands/score.js'
import { targetsCommand } from './commands/targets.js'
import { registerDiffCommand } from './commands/diff.js'
import chalk from 'chalk'

const program = new Command()

program
  .name('palade')
  .description('AI-powered codebase intelligence engine')
  .version('0.1.0')

program
  .command('init')
  .description('Scaffold Palade config in the current directory')
  .option('-y, --yes', 'Skip confirmation prompts and proceed with defaults')
  .action(initCommand)

program
  .command('review')
  .description('Review codebase with AI swarm')
  .option('--pick', 'Interactive target picker before review')
  .option('--target <name>', 'Run review on a specific named target')
  .action(reviewCommand)

program
  .command('score')
  .description('Show codebase health score from last run')
  .action(scoreCommand)

program.addCommand(targetsCommand)

registerDiffCommand(program)

program
  .command('watch')
  .description('Drift detection watcher')
  .action((): void => {
    console.log(chalk.gray('Not yet implemented'))
  })

process.on('SIGINT', (): void => {
  console.log(chalk.yellow('\n\nReview cancelled by user.'))
  process.exit(130)
})

program.parse()
