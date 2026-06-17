import chalk from 'chalk'
import { OWL_ART_DATA } from './owl-art-data.js'
import { GHOST_OWL_ART_TRIMMED } from './ghost-owl-art-trimmed.js'

function isTransparent(cell: { fg: string; bg: string; transparent?: boolean }): boolean {
  if (cell.transparent !== undefined) return cell.transparent
  return cell.fg === '#000000' && cell.bg === '#000000'
}

function renderHalfBlock(data: { fg: string; bg: string; transparent?: boolean }[][]): string[] {
  const lines: string[] = []
  for (const row of data) {
    let line = ''
    for (const cell of row) {
      if (isTransparent(cell)) {
        line += ' '
      } else {
        line += chalk.bgHex(cell.bg).hex(cell.fg)('\u2580')
      }
    }
    lines.push(line)
  }
  return lines
}

export function getStandardOwlLines(): string[] {
  return renderHalfBlock(OWL_ART_DATA)
}

export function getFullOwlArt(): string[] {
  return getStandardOwlLines()
}

export function getGhostOwlLines(): string[] {
  return renderHalfBlock(GHOST_OWL_ART_TRIMMED)
}
