import boxen from 'boxen'
import Table from 'cli-table3'
import chalk from 'chalk'
import { theme } from './theme.js'
import type { AgentFinding } from '../agents/base.js'

export function sectionBox(title: string, content: string): string {
  return boxen(content, {
    title: theme.primaryBold(` ${title} `),
    titleAlignment: 'left',
    padding: { top: 0, bottom: 0, left: 1, right: 1 },
    margin: { top: 0, bottom: 1, left: 0, right: 0 },
    borderStyle: 'round',
    borderColor: '#EF4444',
  })
}

export function infoBox(lines: string[]): string {
  return boxen(lines.join('\n'), {
    padding: { top: 0, bottom: 0, left: 1, right: 1 },
    margin: { top: 0, bottom: 1, left: 0, right: 0 },
    borderStyle: 'round',
    borderColor: '#374151',
  })
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

  return boxen(lines.join('\n'), {
    title: theme.warning(` ⚠ Drift Detected: ${filePath} `),
    titleAlignment: 'left',
    padding: { top: 1, bottom: 1, left: 1, right: 1 },
    margin: { top: 0, bottom: 1, left: 2, right: 0 },
    borderStyle: 'round',
    borderColor: '#FFEA00',
  })
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
  const table = new Table({
    head: [
      theme.primaryBold('Severity'),
      theme.primaryBold('Agent'),
      theme.primaryBold('Location'),
      theme.primaryBold('Issue'),
    ],
    colWidths: [12, 20, 30, 40],
    style: { head: [], border: ['grey'], compact: true },
    chars: {
      top: '─',
      'top-mid': '┬',
      'top-left': '┌',
      'top-right': '┐',
      bottom: '─',
      'bottom-mid': '┴',
      'bottom-left': '└',
      'bottom-right': '┘',
      left: '│',
      'left-mid': '├',
      mid: '─',
      'mid-mid': '┼',
      right: '│',
      'right-mid': '┤',
      middle: '│',
    },
  })

  for (const f of findings.slice(0, 30)) {
    const loc = f.filePath ? `${truncatePath(f.filePath, 20)}:${f.lineStart ?? '?'}` : '—'

    table.push([
      severityChip(f.severity),
      theme.dim(f.agentName),
      theme.dim(loc),
      truncate(f.title, 38),
    ])
  }

  return table.toString()
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
