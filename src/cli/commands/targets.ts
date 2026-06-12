import { Command } from 'commander'
import { searchTargets, getTargetFromRegistry, appendTargetToFile } from '../../targets/registry.js'
import chalk from 'chalk'

export const targetsCommand = new Command('targets')
  .description('Manage review targets (subsystems)')

targetsCommand
  .command('search')
  .description('Search npm for palade-target-* packages')
  .argument('[query]', 'Search query', '')
  .action(async (query: string): Promise<void> => {
    const results = await searchTargets(query)
    if (results.length === 0) {
      console.log(chalk.gray('No palade-target-* packages found.'))
      return
    }
    for (const t of results) {
      console.log(`  ${chalk.cyan(t.name)} (${t.version}) — ${t.description}`)
    }
  })

targetsCommand
  .command('install')
  .description('Install a target package from npm into palade.targets.ts')
  .argument('<package>', 'npm package name (e.g. palade-target-auth)')
  .action(async (pkg: string): Promise<void> => {
    const target = await getTargetFromRegistry(pkg)
    if (!target) {
      console.log(chalk.red(`Package "${pkg}" does not export a valid paladeTarget.`))
      return
    }
    appendTargetToFile(process.cwd(), target)
    console.log(chalk.green(`Target "${target.name}" installed into palade.targets.ts`))
  })
