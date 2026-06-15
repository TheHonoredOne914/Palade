import chalk from 'chalk'
import { theme } from './theme.js'

export interface BannerOptions {
  version: string
  quiet?: boolean
}

const ASCII_ART = [
  ' ██████   █████  ██╗      █████╗ ██████╗ ███████╗',
  ' ██╔══██╗██╔══██╗██║     ██╔══██╗██╔══██╗██╔════╝',
  ' ██████╔╝███████║██║     ███████║██║  ██║█████╗',
  ' ██╔═══╝ ██╔══██║██║     ██╔══██║██║  ██║██╔══╝',
  ' ██║     ██║  ██║███████╗██║  ██║██████╔╝███████╗',
  ' ╚═╝     ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═════╝ ╚══════╝',
]

export function printBanner(opts: BannerOptions): void {
  if (opts.quiet) return

  const termWidth = process.stdout.columns || 80

  const longest = Math.max(...ASCII_ART.map((l) => l.length))
  const red = chalk.red
  const centered = ASCII_ART.map((line) => {
    const pad = Math.max(0, Math.floor((termWidth - longest) / 2))
    return ' '.repeat(pad) + line
  })

  console.log()
  for (const line of centered) {
    console.log(red(line))
  }

  const creditRaw = 'by Carren Mathew'
  const versionRaw = `v${opts.version}`
  const gap = Math.max(2, termWidth - creditRaw.length - versionRaw.length - 2)
  console.log()
  console.log(theme.dim(versionRaw) + theme.dim(' '.repeat(gap)) + theme.dim(creditRaw))

  console.log()
  console.log(theme.accent('  AI-powered codebase intelligence engine'))

  const divider = theme.muted('─'.repeat(Math.min(termWidth, 72)))
  console.log(divider)
  console.log()
}
