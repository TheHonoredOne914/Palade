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

  scoreGreen: chalk.hex('#00E676').bold,
  scoreYellow: chalk.hex('#FFEA00').bold,
  scoreOrange: chalk.hex('#FF9933').bold,
  scoreRed: chalk.hex('#FF3366').bold,
} as const

export const SCORE_THRESHOLDS = {
  good: 80,
  warning: 60,
  poor: 40,
} as const

export function scoreTheme(score: number) {
  if (score >= SCORE_THRESHOLDS.good) return theme.scoreGreen
  if (score >= SCORE_THRESHOLDS.warning) return theme.scoreYellow
  if (score >= SCORE_THRESHOLDS.poor) return theme.scoreOrange
  return theme.scoreRed
}

export function severityTheme(sev: string) {
  switch (sev) {
    case 'critical':
      return theme.critical
    case 'high':
      return theme.high
    case 'medium':
      return theme.medium
    case 'low':
      return theme.low
    default:
      return theme.infoSev
  }
}
