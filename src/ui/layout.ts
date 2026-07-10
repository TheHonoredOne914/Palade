import chalk from 'chalk'
import { theme, SCORE_THRESHOLDS } from './theme.js'
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

const BLOCKS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█']

export function sparkline(values: number[], width = 20): string {
  if (values.length === 0) return theme.dim('No history')
  const min = values.reduce((a, b) => Math.min(a, b), Infinity)
  const max = values.reduce((a, b) => Math.max(a, b), -Infinity)
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

// Anchored to theme.ts's SCORE_THRESHOLDS (90/80/60/40) instead of a second,
// independently-hardcoded set of breakpoints — those used to diverge (this
// function's 90/80/75/70/60/40 vs SCORE_THRESHOLDS' 90/80/60/40), so a score
// could get a grade from one bucket and a color from a different one
// (uicli-006). The two intermediate grades (B+/B) that have no direct
// SCORE_THRESHOLDS equivalent are derived relative to `good`/`warning`
// instead of re-hardcoded — 75 = good-5, 70 = warning+10 — so they still
// move if the underlying thresholds do.
export function scoreGrade(score: number): string {
  if (score >= SCORE_THRESHOLDS.excellent) return 'A+'
  if (score >= SCORE_THRESHOLDS.good) return 'A'
  if (score >= SCORE_THRESHOLDS.good - 5) return 'B+'
  if (score >= SCORE_THRESHOLDS.warning + 10) return 'B'
  if (score >= SCORE_THRESHOLDS.warning) return 'C'
  if (score >= SCORE_THRESHOLDS.poor) return 'D'
  return 'F'
}

export function formatDelta(delta: number): string {
  if (delta === 0) return '+0'
  if (delta > 0) return `+${delta}`
  return String(delta)
}
