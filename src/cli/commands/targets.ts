import { Command } from 'commander'
import { searchTargets, getTargetFromRegistry, appendTargetToFile } from '../../targets/registry.js'
import { loadTargets } from '../../targets/loader.js'
import { theme } from '../../ui/theme.js'
import { loadConfig } from '../../config/loader.js'
import { initRouter } from '../../providers/router.js'
import { generateTarget } from '../../targets/generator.js'
import { CliExitError } from '../../errors/types.js'
import chalk from 'chalk'
export const targetsCommand = new Command('targets').description(
  'Manage review targets (subsystems)'
)

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new CliExitError(1)
  }
}

export async function runTargetsSearch(query: string, signal?: AbortSignal): Promise<void> {
  console.log(theme.dim(`  Searching registry for "${query}"...`))
  const results = await searchTargets(query)
  throwIfAborted(signal)
  if (results.length === 0) {
    console.log(theme.dim(`  No community targets found for "${query}".`))
    return
  }
  for (const t of results) {
    console.log(`  ${chalk.cyan(t.name)} ${theme.dim(`(${t.version})`)} — ${t.description}`)
  }
}

export async function runTargetsAdd(pkg: string, signal?: AbortSignal): Promise<void> {
  const target = await getTargetFromRegistry(pkg)
  throwIfAborted(signal)
  if (!target) {
    console.log(theme.error(`Package "${pkg}" does not export a valid paladeTarget.`))
    return
  }
  appendTargetToFile(process.cwd(), target)
  console.log(theme.success(`Target "${target.name}" installed into .palade/palade.targets.ts`))
}

// ============================================================================
// SECURITY NOTE:
// The `generate` and `add` commands below are the ONLY operations in Palade
// that write source code to disk (`.palade/palade.targets.ts`). The `review` and
// `watch` commands are read-only operations that do not modify project source code.
// ============================================================================
export async function runTargetsGenerate(query: string, signal?: AbortSignal): Promise<void> {
  console.log(theme.dim(`  Initializing AI providers...`))
  const config = await loadConfig()
  await initRouter(config)
  throwIfAborted(signal)

  console.log(theme.dim(`  Analyzing repository structure for "${query}"...`))
  const target = await generateTarget(query, process.cwd())
  throwIfAborted(signal)
  if (!target) {
    console.log(theme.error('Failed to generate target.'))
    return
  }

  appendTargetToFile(process.cwd(), target)
  console.log(
    theme.success(
      `Target "${target.name}" generated and installed into .palade/palade.targets.ts
  Run ${chalk.cyan(`palade review --target ${target.name}`)} to review it.`
    )
  )
}

export async function runTargetsList(signal?: AbortSignal): Promise<void> {
  const targets = await loadTargets(process.cwd())
  throwIfAborted(signal)
  if (targets.length === 0) {
    console.log(
      theme.dim("  No targets defined. Run 'palade init' or edit .palade/palade.targets.ts.")
    )
    return
  }
  console.log(theme.dim(`  Defined targets (${targets.length}):`))
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
}

targetsCommand
  .command('search')
  .description('Search npm for palade-target-* packages')
  .argument('[query]', 'Search query', '')
  .action(async (query: string): Promise<void> => {
    await runTargetsSearch(query)
  })

targetsCommand
  .command('add')
  .description('Install a target package from npm into .palade/palade.targets.ts')
  .argument('<package>', 'npm package name (e.g. palade-target-auth)')
  .action(async (pkg: string): Promise<void> => {
    await runTargetsAdd(pkg)
  })

targetsCommand
  .command('generate')
  .description('Use AI to generate a target based on a natural language description')
  .argument('<query>', 'Description of the subsystem (e.g. "user authentication flow")')
  .action(async (query: string): Promise<void> => {
    await runTargetsGenerate(query)
  })

targetsCommand
  .command('list')
  .description('List locally defined targets')
  .action(async (): Promise<void> => {
    await runTargetsList()
  })
