import chalk from 'chalk'

export const theme = {
  primary: chalk.hex('#FF3366'),
  primaryBold: chalk.hex('#FF3366').bold,
  accent: chalk.hex('#FF9933'),
  dim: chalk.hex('#6B7280'),
  muted: chalk.hex('#374151'),

  success: chalk.hex('#00E676'),
  warning: chalk.hex('#FFEA00'),
  error: chalk.hex('#FF3366'),
  info: chalk.hex('#00D0FF'),

  critical: chalk.hex('#FF3366').bold,
  high: chalk.hex('#FF9933').bold,
  medium: chalk.hex('#FFEA00'),
  low: chalk.hex('#6B7280'),
  infoSev: chalk.hex('#374151'),

  bold: chalk.bold,
  white: chalk.white,
  whiteBold: chalk.white.bold,

  // Distinct from scoreGreen so the 'excellent' tier (>= SCORE_THRESHOLDS.excellent)
  // reads as visibly different from plain 'good', matching badge.ts's 5-tier
  // brightgreen/green/yellow/orange/red ladder instead of collapsing the top
  // two tiers into one color (scorer-006).
  scoreExcellent: chalk.hex('#39FF6A').bold,
  scoreGreen: chalk.hex('#00E676').bold,
  scoreYellow: chalk.hex('#FFEA00').bold,
  scoreOrange: chalk.hex('#FF9933').bold,
  scoreRed: chalk.hex('#FF3366').bold,
} as const

export const SCORE_THRESHOLDS = {
  excellent: 90,
  good: 80,
  warning: 60,
  poor: 40,
} as const

// Matches badge.ts's getScoreColor 5-tier ladder (brightgreen/green/yellow/
// orange/red over excellent/good/warning/poor) — this used to only check 3
// of SCORE_THRESHOLDS' 4 thresholds (skipping 'excellent'), so the badge and
// the terminal/HTML report could disagree on tier count for the same score
// (scorer-006).
export function scoreTheme(score: number) {
  if (score >= SCORE_THRESHOLDS.excellent) return theme.scoreExcellent
  if (score >= SCORE_THRESHOLDS.good) return theme.scoreGreen
  if (score >= SCORE_THRESHOLDS.warning) return theme.scoreYellow
  if (score >= SCORE_THRESHOLDS.poor) return theme.scoreOrange
  return theme.scoreRed
}
