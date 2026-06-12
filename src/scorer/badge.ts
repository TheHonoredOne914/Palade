import type { BadgeColor, BadgeData } from './types.js'

const COLOR_MAP: Record<BadgeColor, string> = {
  brightgreen: '#4c1',
  green: '#97ca00',
  yellow: '#dfb317',
  orange: '#fe7d37',
  red: '#e05d44'
}

export function getScoreColor(score: number): BadgeColor {
  if (score >= 90) return 'brightgreen'
  if (score >= 75) return 'green'
  if (score >= 60) return 'yellow'
  if (score >= 40) return 'orange'
  return 'red'
}

export function getBadgeData(score: number): BadgeData {
  return {
    score,
    color: getScoreColor(score),
    label: 'palade'
  }
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function measureTextWidth(text: string): number {
  let width = 0
  for (const ch of text) {
    if (ch >= '0' && ch <= '9') width += 9
    else if (ch >= 'a' && ch <= 'z') width += 7.5
    else if (ch >= 'A' && ch <= 'Z') width += 9
    else if (ch === '.') width += 4.5
    else if (ch === ' ') width += 4
    else width += 7.5
  }
  return width
}

export function renderBadge(data: BadgeData): string {
  const scoreStr = String(data.score)
  const labelStr = data.label

  const scoreTextWidth = measureTextWidth(scoreStr)
  const labelTextWidth = measureTextWidth(labelStr)

  const scoreBlockWidth = Math.round(scoreTextWidth + 14)
  const labelBlockWidth = Math.round(labelTextWidth + 14)
  const totalWidth = scoreBlockWidth + labelBlockWidth

  const scoreX = Math.round(scoreBlockWidth / 2)
  const labelX = scoreBlockWidth + Math.round(labelBlockWidth / 2)

  const scoreColor = COLOR_MAP[data.color]
  const labelColor = '#555'

  const escapedScore = escapeXml(scoreStr)
  const escapedLabel = escapeXml(labelStr)

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20" role="img" aria-label="${escapedLabel}: ${escapedScore}">
  <title>${escapedLabel}: ${escapedScore}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-color-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r">
    <rect width="${totalWidth}" height="20" rx="3" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#r)">
    <rect width="${scoreBlockWidth}" height="20" fill="${scoreColor}"/>
    <rect x="${scoreBlockWidth}" width="${labelBlockWidth}" height="20" fill="${labelColor}"/>
    <rect width="${totalWidth}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
    <text x="${scoreX}" y="15" fill="#010101" fill-opacity=".3">${escapedScore}</text>
    <text x="${scoreX}" y="14">${escapedScore}</text>
    <text x="${labelX}" y="15" fill="#010101" fill-opacity=".3">${escapedLabel}</text>
    <text x="${labelX}" y="14">${escapedLabel}</text>
  </g>
</svg>`
}
