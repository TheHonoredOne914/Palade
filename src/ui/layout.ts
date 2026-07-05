import chalk from 'chalk'
import { theme } from './theme.js'
import type { AgentFinding } from '../agents/base.js'

// Match full SGR escape sequences, including multi-parameter truecolor codes
// like \x1b[38;2;R;G;Bm that chalk.hex() (used throughout theme.ts) emits.
// eslint-disable-next-line no-control-regex -- matching the ESC control char is the point
const ANSI_RE = /\u001b\[[0-9;]*m/g

function visibleLen(s: string): number {
  return s.replace(ANSI_RE, '').length
}

function drawBox(text: string, title?: string): string {
  const lines = text.split('\n')
  const titleLen = title ? visibleLen(title) : 0
  const width = Math.max(...lines.map(visibleLen), title ? titleLen + 2 : 0)

  const top = title
    ? `╭─ ${title} ${'─'.repeat(Math.max(0, width - titleLen - 3))}╮`
    : `╭${'─'.repeat(width + 2)}╮`

  const middle = lines
    .map((l) => `│ ${l}${' '.repeat(Math.max(0, width - visibleLen(l)))} │`)
    .join('\n')

  const bottom = `╰${'─'.repeat(width + 2)}╯`

  return [top, middle, bottom].join('\n')
}

export function sectionBox(title: string, content: string): string {
  return drawBox(content, title)
}

export function infoBox(lines: string[]): string {
  return drawBox(lines.join('\n'))
}

export function formatDriftAlert(filePath: string, findings: AgentFinding[]): string {
  const lines: string[] = []

  for (const f of findings.slice(0, 5)) {
    const loc = f.lineStart ? `:${f.lineStart}` : ''
    const title = truncate(f.title, 60)
    lines.push(
      ` ${severityChip(f.severity)} ${theme.dim(f.agentName.padEnd(16))} ${title} ${theme.dim(loc)}`
    )
  }

  if (findings.length > 5) {
    lines.push(theme.dim(`\n ... and ${findings.length - 5} more issues`))
  }

  return drawBox(lines.join('\n'), theme.warning(` ⚠ Drift Detected: ${filePath} `))
}

export function kvTable(rows: [string, string][]): string {
  return rows.map(([k, v]) => `  ${theme.dim(k.padEnd(18))} ${v}`).join('\n')
}

export function findingsTable(
  findings: {
    severity: string
    agentName: string
    filePath?: string
    lineStart?: number
    title: string
  }[]
): string {
  const lines: string[] = []

  // Table Header
  lines.push(
    `  ${theme.primaryBold('Severity'.padEnd(12))} ${theme.primaryBold('Agent'.padEnd(20))} ${theme.primaryBold('Location'.padEnd(30))} ${theme.primaryBold('Issue')}`
  )
  lines.push(theme.dim('  ' + '─'.repeat(12 + 20 + 30 + 40 + 3)))

  for (const f of findings.slice(0, 30)) {
    const loc = f.filePath ? `${truncatePath(f.filePath, 20)}:${f.lineStart ?? '?'}` : '—'

    // strip-ansi equivalent for padEnd calculations isn't available easily,
    // but we can just use template literals with fixed manual padding.
    // We'll pad the raw values, then apply color.

    const sevRaw = f.severity.padEnd(12)
    const agentRaw = f.agentName.padEnd(20)
    const locRaw = loc.padEnd(30)

    const coloredSev =
      f.severity === 'critical'
        ? theme.error(sevRaw)
        : f.severity === 'high'
          ? theme.warning(sevRaw)
          : f.severity === 'medium'
            ? theme.accent(sevRaw)
            : theme.dim(sevRaw)

    lines.push(
      `  ${coloredSev} ${theme.dim(agentRaw)} ${theme.dim(locRaw)} ${truncate(f.title, 38)}`
    )
  }

  return lines.join('\n')
}

export function divider(width?: number): string {
  const w = width ?? Math.min(process.stdout.columns || 72, 72)
  return theme.dim('─'.repeat(w))
}

const BLOCKS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█']

export function sparkline(values: number[], width = 20): string {
  if (values.length === 0) return theme.dim('No history')
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const chars = values.slice(-width).map((v) => {
    const idx = Math.round(((v - min) / range) * (BLOCKS.length - 1))
    const block = BLOCKS[idx]
    if (v >= 80) return chalk.hex('#10B981')(block)
    if (v >= 60) return chalk.hex('#F59E0B')(block)
    if (v >= 40) return chalk.hex('#F97316')(block)
    return chalk.hex('#EF4444')(block)
  })
  return chars.join('')
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

function truncatePath(p: string, n: number): string {
  const sep = p.includes('\\') ? '\\' : '/'
  const parts = p.split(sep)
  const short = parts.slice(-2).join(sep)
  return truncate(short, n)
}

function severityChip(sev: string): string {
  const chips: Record<string, string> = {
    critical: chalk.bgRed.white.bold(' CRIT '),
    high: chalk.bgHex('#F97316').white.bold(' HIGH '),
    medium: chalk.bgHex('#F59E0B').black(' MED  '),
    low: chalk.bgWhite.black(' LOW  '),
    info: chalk.bgBlue.white(' INFO '),
  }
  return chips[sev] ?? chalk.bgWhite.black(` ${sev.toUpperCase().slice(0, 4).padEnd(4)} `)
}

export function scoreGrade(score: number): string {
  if (score >= 90) return 'A+'
  if (score >= 80) return 'A'
  if (score >= 75) return 'B+'
  if (score >= 70) return 'B'
  if (score >= 60) return 'C'
  if (score >= 40) return 'D'
  return 'F'
}

export function formatDelta(delta: number): string {
  if (delta === 0) return '+0'
  if (delta > 0) return `+${delta}`
  return String(delta)
}
