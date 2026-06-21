import { theme } from './theme.js'

export interface BannerOptions {
  version: string
  quiet?: boolean
}

export function printBanner(opts: BannerOptions): void {
  if (opts.quiet) return

  console.log()
  console.log(theme.dim(`  v${opts.version}`))
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
