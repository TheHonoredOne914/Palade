import { Command } from 'commander'
import { searchTargets, getTargetFromRegistry, appendTargetToFile } from '../../targets/registry.js'
import { loadTargets } from '../../targets/loader.js'
import { theme } from '../../ui/theme.js'
import { loadConfig } from '../../config/loader.js'
import { initRouter } from '../../providers/router.js'
import { generateTarget } from '../../targets/generator.js'
import chalk from 'chalk'
export const targetsCommand = new Command('targets')
  .description('Manage review targets (subsystems)')

targetsCommand
  .command('search')
  .description('Search npm for palade-target-* packages')
  .argument('[query]', 'Search query', '')
  .action(async (query: string): Promise<void> => {
    console.log(theme.dim(`  Searching registry for "${query}"...`))
    const results = await searchTargets(query)
    if (results.length === 0) {
      console.log(
        theme.dim(`  No community targets found for "${query}".`)
      )
      return
    }
    for (const t of results) {
      console.log(
        `  ${chalk.cyan(t.name)} ${theme.dim(`(${t.version})`)} — ${t.description}`
      )
    }
  })

targetsCommand
  .command('add')
  .description('Install a target package from npm into palade.targets.ts')
  .argument('<package>', 'npm package name (e.g. palade-target-auth)')
  .action(async (pkg: string): Promise<void> => {
    const target = await getTargetFromRegistry(pkg)
    if (!target) {
      console.log(
        theme.error(
          `Package "${pkg}" does not export a valid paladeTarget.`
        )
      )
      return
    }
    appendTargetToFile(process.cwd(), target)
    console.log(
      theme.success(
        `Target "${target.name}" installed into palade.targets.ts`
      )
    )
  })

targetsCommand
  .command('generate')
  .description('Use AI to generate a target based on a natural language description')
  .argument('<query>', 'Description of the subsystem (e.g. "user authentication flow")')
  .action(async (query: string): Promise<void> => {
    console.log(theme.dim(`  Initializing AI providers...`))
    const config = await loadConfig()
    await initRouter(config)

    console.log(theme.dim(`  Analyzing repository structure for "${query}"...`))
    const target = await generateTarget(query, process.cwd())
    if (!target) {
      console.log(theme.error('Failed to generate target.'))
      return
    }

    appendTargetToFile(process.cwd(), target)
    console.log(
      theme.success(
        `Target "${target.name}" generated and installed into palade.targets.ts\n  Run ${chalk.cyan(`palade review --target ${target.name}`)} to review it.`
      )
    )
  })

targetsCommand
  .command('list')
  .description('List locally defined targets')
  .action(async (): Promise<void> => {
    const targets = await loadTargets(process.cwd())
    if (targets.length === 0) {
      console.log(
        theme.dim(
          "  No targets defined. Run 'palade init' or edit palade.targets.ts."
        )
      )
      return
    }
    console.log(
      theme.dim(`  Defined targets (${targets.length}):`)
    )
    console.log()
    for (const t of targets) {
      console.log(
        `  ${theme.accent(t.name.padEnd(16))} ${theme.dim(Array.isArray(t.entry) ? t.entry.join(', ') : t.entry)}`
      )
      if (t.description) {
        console.log(`  ${theme.dim(' '.repeat(16))} ${theme.dim(t.description)}`)
      }
    }
    console.log()
  })
