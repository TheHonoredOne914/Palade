import chalk from 'chalk'
import { theme } from './theme.js'
import { ASCII_ART, GRADIENT } from './asciiArt.js'

export interface BannerOptions {
  version: string
  quiet?: boolean
}

function renderAscii(): void {
  const centered = ASCII_ART.map((line) => {
    // Left align it slightly off edge to match TUI paddingX={2}
    return '  ' + line
  })

  console.log()
  for (let i = 0; i < centered.length; i++) {
    const color = GRADIENT[i] ?? '#FF3366'
    console.log(chalk.hex(color).bold(centered[i]))
  }
}

export function printBanner(opts: BannerOptions): void {
  if (opts.quiet) return

  renderAscii()

  const creditRaw = 'by Carren Mathew'
  const versionRaw = `v${opts.version}`
  const asciiWidth = Math.max(...ASCII_ART.map((l) => l.length)) + 2 // +2 for left padding

  // Align "By Carren Mathew" to the right of the ASCII art, similar to TUI
  const gap = Math.max(2, asciiWidth - versionRaw.length - creditRaw.length - 2)
  console.log()
  console.log('  ' + theme.dim(versionRaw) + theme.dim(' '.repeat(gap)) + theme.dim(creditRaw))

  console.log()
  console.log(theme.accent('  AI-powered codebase intelligence engine'))
  console.log(theme.muted('─'.repeat(72)))
  console.log()
}

export function printGhostBanner(): void {
  console.log()
  console.log('  ░░ GHOST HUNT MODE ░░')
  console.log(theme.dim('  Hunting dead code, zombie features, unwired implementations...'))
  console.log()
  console.log(theme.muted('─'.repeat(72)))
  console.log()
}
