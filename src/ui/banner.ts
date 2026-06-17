import chalk from 'chalk'
import { theme } from './theme.js'
import { getFullOwlArt, getGhostOwlLines } from './owl.js'

export interface BannerOptions {
  version: string
  quiet?: boolean
}

function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-9;]*m/g, '')
}

export function printBanner(opts: BannerOptions): void {
  if (opts.quiet) return

  const termWidth = process.stdout.columns || 80
  const owlArt = getFullOwlArt()
  const owlWidth = owlArt.length > 0 ? stripAnsi(owlArt[0]).length : 36
  const pad = Math.max(0, Math.floor((termWidth - owlWidth) / 2))

  console.log()
  for (const line of owlArt) {
    console.log(' '.repeat(pad) + line)
  }
  console.log()
  console.log(theme.dim(`  v${opts.version}`))
  console.log()
  console.log(theme.accent('  AI-powered codebase intelligence engine'))
  console.log(theme.muted('─'.repeat(72)))
  console.log()
}

export function printGhostBanner(): void {
  const owlLines = getGhostOwlLines()
  console.log()
  console.log(chalk.blue('  ░░ GHOST HUNT MODE ░░'))
  console.log(chalk.dim('  Hunting dead code, zombie features, unwired implementations...'))
  console.log()
  for (const line of owlLines) {
    console.log(line)
  }
  console.log()
  console.log(chalk.dim('─'.repeat(72)))
  console.log()
}
