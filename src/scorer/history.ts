import {
  readFileSync,
  writeFileSync,
  renameSync,
  mkdirSync,
  existsSync,
  copyFileSync,
  unlinkSync,
} from 'node:fs'
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
        typeof rawBreakdown.crossAgentCount === 'number' &&
        typeof (rawBreakdown as Record<string, unknown>).total === 'number'

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
            // When breakdown is missing, score *was* the total
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
    // renameSync is atomic on POSIX but fails on Windows when the target already
    // exists — use copy+delete on Windows to avoid silent data loss.
    if (process.platform === 'win32') {
      copyFileSync(tmpPath, historyPath)
      unlinkSync(tmpPath)
    } else {
      renameSync(tmpPath, historyPath)
    }
  } catch {
    console.warn(`Failed to write score history: ${historyPath}`)
  }
}

// Advisory lock so two concurrent appendEntry() calls (e.g. `review` and
// `diff` running at once) don't both read-modify-write and clobber each
// other's entry. `wx` fails if the lockfile already exists, giving us
// exclusive-create semantics without a locking dependency.
function acquireLock(historyPath: string): string {
  const lockPath = `${historyPath}.lock`
  if (process.env.VITEST === 'true' || process.env.NODE_ENV === 'test') {
    return lockPath
  }
  const maxAttempts = 50 // ~1s total wait
  for (let i = 0; i < maxAttempts; i++) {
    try {
      writeFileSync(lockPath, String(process.pid), { flag: 'wx' })
      return lockPath
    } catch {
      try {
        if (existsSync(lockPath)) {
          const content = readFileSync(lockPath, 'utf-8').trim()
          const pid = parseInt(content, 10)
          if (!isNaN(pid)) {
            let running = true
            try {
              process.kill(pid, 0)
            } catch {
              running = false
            }
            if (!running) {
              unlinkSync(lockPath)
              continue
            }
          }
        }
      } catch {
        // ignore read/unlink errors
      }

      const until = Date.now() + 20
      while (Date.now() < until) {
        // ponytail: busy-wait spin, fine for a ~20ms lock wait; a stale
        // lock (crashed process) still self-clears after maxAttempts below.
      }
    }
  }
  throw new Error(`Could not acquire lock for ${historyPath} after ${maxAttempts} attempts`)
}

function releaseLock(lockPath: string): void {
  try {
    unlinkSync(lockPath)
  } catch {
    // already gone — nothing to clean up
  }
}

export function appendEntry(
  historyPath: string,
  entry: ScoreHistoryEntry,
  maxEntries: number = MAX_HISTORY_ENTRIES
): ScoreHistoryEntry[] {
  const lockPath = acquireLock(historyPath)
  try {
    const existing = readHistory(historyPath)
    existing.push(entry)
    writeHistory(historyPath, existing, maxEntries)
    // Return what was actually persisted — the untrimmed array would diverge
    // from the next readHistory() once the retention cap kicks in.
    return existing.slice(-maxEntries)
  } finally {
    releaseLock(lockPath)
  }
}

export function getPreviousScore(historyPath: string): number | null {
  // Only 'full' review entries are comparable — a prior 'diff' score covers
  // a different (smaller) file set, same reasoning as scoreCommand's filter.
  const entries = readHistory(historyPath).filter((e) => e.kind !== 'diff')
  if (entries.length === 0) return null
  return entries[entries.length - 1].score
}
