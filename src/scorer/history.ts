import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'
import type { ScoreHistoryEntry, ScoreBreakdown, CategoryScore } from './types.js'

const MAX_HISTORY_ENTRIES = 50

function isValidCategoryScore(item: unknown): item is CategoryScore {
  if (typeof item !== 'object' || item === null) return false
  const c = item as Record<string, unknown>
  return (
    typeof c.category === 'string' &&
    typeof c.score === 'number' &&
    typeof c.findingCount === 'number' &&
    typeof c.criticalCount === 'number' &&
    typeof c.highCount === 'number'
  )
}

/**
 * Parse+validate a raw history.json string into ScoreHistoryEntry[]. Shared
 * by readHistory() and git.ts's getBaseScore() so both apply the same
 * shape validation instead of git.ts trusting a raw type assertion.
 */
export function parseHistoryEntries(raw: string): ScoreHistoryEntry[] {
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
      const rawBreakdown = obj.breakdown as Record<string, unknown> | null | undefined
      const isValidBreakdown =
        rawBreakdown !== null &&
        typeof rawBreakdown === 'object' &&
        Array.isArray(rawBreakdown.categories) &&
        typeof rawBreakdown.findingCount === 'number' &&
        typeof rawBreakdown.crossAgentCount === 'number'

      const breakdown: ScoreBreakdown = isValidBreakdown
        ? {
            ...(rawBreakdown as unknown as ScoreBreakdown),
            categories: (rawBreakdown!.categories as unknown[]).every(isValidCategoryScore)
              ? (rawBreakdown!.categories as CategoryScore[])
              : [],
          }
        : {
            total: obj.score as number,
            categories: [],
            findingCount: 0,
            crossAgentCount: 0,
          }

      const kind: ScoreHistoryEntry['kind'] =
        obj.kind === 'diff' ? 'diff' : obj.kind === 'full' ? 'full' : undefined

      entries.push({
        timestamp: obj.timestamp as string,
        runId: (obj.runId as string) ?? '',
        score: obj.score as number,
        breakdown,
        delta: typeof obj.delta === 'number' ? obj.delta : 0,
        ...(kind ? { kind } : {}),
      })
    }
  }

  return entries
}

export function readHistory(historyPath: string): ScoreHistoryEntry[] {
  try {
    if (!existsSync(historyPath)) return []
    const raw = readFileSync(historyPath, 'utf-8')
    return parseHistoryEntries(raw)
  } catch {
    return []
  }
}

export function writeHistory(
  historyPath: string,
  entries: ScoreHistoryEntry[],
  maxEntries: number = MAX_HISTORY_ENTRIES
): void {
  try {
    const dir = dirname(historyPath)
    mkdirSync(dir, { recursive: true })
    const trimmed = entries.slice(-maxEntries)
    // Write to a temp file then rename — rename is atomic on POSIX/NTFS, so a
    // concurrent reader never observes a half-written history.json.
    const tmpPath = `${historyPath}.${process.pid}.${Date.now()}.tmp`
    writeFileSync(tmpPath, JSON.stringify(trimmed, null, 2), 'utf-8')
    renameSync(tmpPath, historyPath)
  } catch {
    // history write is best-effort — never throw
  }
}

export function appendEntry(
  historyPath: string,
  entry: ScoreHistoryEntry,
  maxEntries: number = MAX_HISTORY_ENTRIES
): ScoreHistoryEntry[] {
  const existing = readHistory(historyPath)
  existing.push(entry)
  writeHistory(historyPath, existing, maxEntries)
  // Return what was actually persisted — the untrimmed array would diverge
  // from the next readHistory() once the retention cap kicks in.
  return existing.slice(-maxEntries)
}

export function getLatestEntry(historyPath: string): ScoreHistoryEntry | null {
  const entries = readHistory(historyPath)
  if (entries.length === 0) return null
  return entries[entries.length - 1]
}

export function getPreviousScore(historyPath: string): number | null {
  const entries = readHistory(historyPath)
  if (entries.length === 0) return null
  return entries[entries.length - 1].score
}
