import chalk from 'chalk'
import { theme } from './theme.js'
import { OWL_ART_DATA } from './owl-art-data.js'

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

function renderOwl(): void {
  const termWidth = process.stdout.columns || 80
  const owlWidth = OWL_ART_DATA[0].length
  const pad = Math.max(0, Math.floor((termWidth - owlWidth) / 2))

  for (const row of OWL_ART_DATA) {
    let line = ' '.repeat(pad)
    for (const cell of row) {
      line += chalk.bgHex(cell.bg).hex(cell.fg)('\u2580')
    }
    console.log(line)
  }
}

function renderAscii(): void {
  const termWidth = process.stdout.columns || 80
  const longest = Math.max(...ASCII_ART.map((l) => l.length))
  const red = chalk.red
  const centered = ASCII_ART.map((line) => {
    const pad = Math.max(0, Math.floor((termWidth - longest) / 2))
    return ' '.repeat(pad) + line
  })

  for (const line of centered) {
    console.log(red(line))
  }
}

export function printBanner(opts: BannerOptions): void {
  if (opts.quiet) return

  const showOwl = Math.random() < 0.35

  console.log()

  if (showOwl) {
    renderOwl()
  } else {
    renderAscii()
  }

  const creditRaw = 'by Carren Mathew'
  const versionRaw = `v${opts.version}`
  const termWidth = process.stdout.columns || 80
  const gap = Math.max(2, termWidth - creditRaw.length - versionRaw.length - 2)
  console.log()
  console.log(theme.dim(versionRaw) + theme.dim(' '.repeat(gap)) + theme.dim(creditRaw))

  console.log()
  console.log(theme.accent('  AI-powered codebase intelligence engine'))

  const divider = theme.muted('─'.repeat(Math.min(termWidth, 72)))
  console.log(divider)
  console.log()
}
