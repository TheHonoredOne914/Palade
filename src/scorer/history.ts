import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'
import type { ScoreHistoryEntry, ScoreBreakdown } from './types.js'

const MAX_HISTORY_ENTRIES = 50

export function readHistory(historyPath: string): ScoreHistoryEntry[] {
  try {
    if (!existsSync(historyPath)) return []
    const raw = readFileSync(historyPath, 'utf-8')
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    const entries: ScoreHistoryEntry[] = []
    for (const item of parsed) {
      if (
        typeof item === 'object' &&
        item !== null &&
        typeof (item as Record<string, unknown>).timestamp === 'string' &&
        typeof (item as Record<string, unknown>).score === 'number'
      ) {
        const obj = item as Record<string, unknown>
        entries.push({
          timestamp: obj.timestamp as string,
          runId: (obj.runId as string) ?? '',
          score: obj.score as number,
          breakdown: (obj.breakdown as ScoreBreakdown) ?? {
            total: obj.score as number,
            categories: [],
            findingCount: 0,
            crossAgentCount: 0
          },
          delta: typeof obj.delta === 'number' ? obj.delta : 0
        })
      }
    }

    return entries
  } catch {
    return []
  }
}

export function writeHistory(
  historyPath: string,
  entries: ScoreHistoryEntry[]
): void {
  try {
    const dir = dirname(historyPath)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    const trimmed = entries.slice(-MAX_HISTORY_ENTRIES)
    writeFileSync(historyPath, JSON.stringify(trimmed, null, 2), 'utf-8')
  } catch {
    // history write is best-effort — never throw
  }
}

export function appendEntry(
  historyPath: string,
  entry: ScoreHistoryEntry
): ScoreHistoryEntry[] {
  const existing = readHistory(historyPath)
  existing.push(entry)
  writeHistory(historyPath, existing)
  return existing
}

export function getLatestEntry(
  historyPath: string
): ScoreHistoryEntry | null {
  const entries = readHistory(historyPath)
  if (entries.length === 0) return null
  return entries[entries.length - 1]
}

export function getPreviousScore(historyPath: string): number | null {
  const entries = readHistory(historyPath)
  if (entries.length === 0) return null
  return entries[entries.length - 1].score
}
