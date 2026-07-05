import { readdir, readFile, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import chalk from 'chalk'
import { kvTable } from '../../ui/layout.js'
import { theme } from '../../ui/theme.js'

export async function decisionsCommand(
  action: string | undefined,
  slug: string | undefined,
  opts: { days?: number }
): Promise<void> {
  const dir = join(process.cwd(), '.palade', 'decisions')

  if (!existsSync(dir)) {
    console.log(chalk.yellow('No decisions found. (.palade/decisions directory is missing)'))
    return
  }

  const act = action || 'list'

  if (act === 'list') {
    const files = await readdir(dir)
    const mdFiles = files.filter((f) => f.endsWith('.md'))
    if (mdFiles.length === 0) {
      console.log(chalk.yellow('No decisions found.'))
      return
    }

    console.log(chalk.bold('\nArchitecture Decisions (Verdict Mode)\n'))

    for (const file of mdFiles) {
      const content = await readFile(join(dir, file), 'utf-8')
      const lines = content.split('\n')
      const dateLine = lines
        .find((l) => l.startsWith('**Date:**'))
        ?.replace('**Date:**', '')
        .trim()
      const fileLine = lines
        .find((l) => l.startsWith('**File:**'))
        ?.replace('**File:**', '')
        .trim()
      const decisionLine = lines.findIndex((l) => l.startsWith('## Decision'))

      let decisionText = 'Unknown'
      if (decisionLine !== -1 && lines.length > decisionLine + 1) {
        decisionText = lines[decisionLine + 1].trim()
      }

      console.log(`  ${theme.primary(file.replace('.md', ''))}`)
      console.log(`    Date: ${theme.dim(dateLine || 'unknown')}`)
      console.log(`    File: ${theme.white(fileLine || 'unknown')}`)
      const truncated = decisionText.length > 50 ? decisionText.slice(0, 50) + '...' : decisionText
      console.log(`    Decision: ${theme.dim(truncated)}\n`)
    }
  } else if (act === 'show') {
    if (!slug) {
      console.error(chalk.red('Please provide a decision slug: palade decisions show <slug>'))
      return
    }
    const filepath = join(dir, slug.endsWith('.md') ? slug : `${slug}.md`)
    if (!existsSync(filepath)) {
      console.error(chalk.red(`Decision not found: ${slug}`))
      return
    }
    const content = await readFile(filepath, 'utf-8')
    console.log('\n' + content)
  } else if (act === 'stale') {
    const days = Number.isFinite(opts.days) ? (opts.days as number) : 30
    const files = await readdir(dir)
    const mdFiles = files.filter((f) => f.endsWith('.md'))
    const now = Date.now()
    const msPerDay = 1000 * 60 * 60 * 24

    console.log(chalk.bold(`\nStale Decisions (Older than ${days} days)\n`))

    let found = false
    for (const file of mdFiles) {
      const filepath = join(dir, file)
      const fileStat = await stat(filepath)
      const ageDays = (now - fileStat.mtimeMs) / msPerDay

      if (ageDays > days) {
        found = true
        console.log(
          `  ${theme.warning(file.replace('.md', ''))} ${theme.dim(`(${Math.floor(ageDays)} days old)`)}`
        )
      }
    }

    if (!found) {
      console.log(chalk.green(`No stale decisions found.`))
    }
  } else {
    console.error(chalk.red(`Unknown action: ${act}. Use list, show <slug>, or stale.`))
  }
}
