import chalk from 'chalk'

export const theme = {
  primary:     chalk.hex('#EF4444'),
  primaryBold: chalk.hex('#EF4444').bold,
  accent:      chalk.hex('#F87171'),
  dim:         chalk.hex('#6B7280'),
  muted:       chalk.hex('#374151'),

  success:     chalk.hex('#10B981'),
  warning:     chalk.hex('#F59E0B'),
  error:       chalk.hex('#EF4444'),
  info:        chalk.hex('#3B82F6'),

  critical:    chalk.hex('#EF4444').bold,
  high:        chalk.hex('#F97316').bold,
  medium:      chalk.hex('#F59E0B'),
  low:         chalk.hex('#6B7280'),
  infoSev:     chalk.hex('#374151'),

  bold:        chalk.bold,
  white:       chalk.white,
  whiteBold:   chalk.white.bold,

  scoreGreen:  chalk.hex('#10B981').bold,
  scoreYellow: chalk.hex('#F59E0B').bold,
  scoreOrange: chalk.hex('#F97316').bold,
  scoreRed:    chalk.hex('#EF4444').bold,
} as const

export function scoreTheme(score: number) {
  if (score >= 80) return theme.scoreGreen
  if (score >= 60) return theme.scoreYellow
  if (score >= 40) return theme.scoreOrange
  return theme.scoreRed
}

export function severityTheme(sev: string) {
  switch (sev) {
    case 'critical': return theme.critical
    case 'high':     return theme.high
    case 'medium':   return theme.medium
    case 'low':      return theme.low
    default:         return theme.infoSev
  }
}
