import {
  readFileSync,
  writeFileSync,
  renameSync,
  mkdirSync,
  existsSync,
  copyFileSync,
  unlinkSync,
  statSync,
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
    Number.isFinite(c.score) &&
    typeof c.findingCount === 'number' &&
    Number.isFinite(c.findingCount) &&
    typeof c.criticalCount === 'number' &&
    Number.isFinite(c.criticalCount) &&
    typeof c.highCount === 'number' &&
    Number.isFinite(c.highCount)
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
            // Keep only the valid entries instead of discarding the whole
            // array when a single CategoryScore element fails validation.
            categories: (rawBreakdown!.categories as unknown[]).filter(isValidCategoryScore),
          }
        : {
            total: obj.score as number,
            categories: [],
            findingCount: 0,
            crossAgentCount: 0,
          }

      const kind: ScoreHistoryEntry['kind'] =
        obj.kind === 'diff' ? 'diff' : obj.kind === 'full' ? 'full' : undefined

      // Reject non-finite scores (NaN/Infinity from a corrupted file) instead
      // of trusting the `typeof === 'number'` check above — those would flow
      // into delta math and the badge undetected.
      if (!Number.isFinite(obj.score)) continue

      entries.push({
        timestamp: obj.timestamp as string,
        runId:
          typeof obj.runId === 'string' ? obj.runId : obj.runId != null ? String(obj.runId) : '',
        score: obj.score as number,
        breakdown,
        delta: typeof obj.delta === 'number' && Number.isFinite(obj.delta) ? obj.delta : 0,
        ...(kind ? { kind } : {}),
      })
    }
  }

  return entries
}

export function readHistory(historyPath: string): ScoreHistoryEntry[] {
  if (!existsSync(historyPath)) return []
  let raw: string
  try {
    raw = readFileSync(historyPath, 'utf-8')
  } catch (err) {
    // The file exists (checked above) but couldn't be read — back it up
    // before returning [] for the same reason the JSON-parse-failure path
    // below does: so the next appendEntry() write doesn't silently overwrite
    // it with a single entry and destroy all prior score trend data.
    const backupPath = `${historyPath}.corrupt-${Date.now()}`
    try {
      copyFileSync(historyPath, backupPath)
    } catch {
      // best-effort backup — still warn below even if this fails
    }
    console.error(
      `[palade] history.json could not be read (${err instanceof Error ? err.message : String(err)}). ` +
        `Backed up to ${backupPath}. Starting from empty history.`
    )
    return []
  }
  try {
    return parseHistoryEntries(raw)
  } catch (err) {
    // Corrupt history.json: back it up before returning [] so the next
    // appendEntry() write doesn't silently overwrite it with a single entry
    // and destroy all prior score trend data.
    const backupPath = `${historyPath}.corrupt-${Date.now()}`
    try {
      copyFileSync(historyPath, backupPath)
    } catch {
      // best-effort backup — still warn below even if this fails
    }
    console.error(
      `[palade] history.json is corrupt and could not be parsed (${err instanceof Error ? err.message : String(err)}). ` +
        `Backed up to ${backupPath}. Starting from empty history.`
    )
    return []
  }
}

export function writeHistory(
  historyPath: string,
  entries: ScoreHistoryEntry[],
  maxEntries: number = MAX_HISTORY_ENTRIES
): boolean {
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
    return true
  } catch {
    // history write is best-effort — never throw, but signal failure so
    // callers (e.g. appendEntry) don't assert the write actually landed.
    return false
  }
}

// Advisory lock so two concurrent appendEntry() calls (e.g. `review` and
// `diff` running at once) don't both read-modify-write and clobber each
// other's entry. `wx` fails if the lockfile already exists, giving us
// exclusive-create semantics without a locking dependency.
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// A lockfile older than this was almost certainly left behind by a process
// that crashed mid-write (normal writeHistory() calls complete in well under
// a second) — force-removing it prevents a stale lock from permanently
// defeating acquireLock for every future appendEntry() call.
const STALE_LOCK_MS = 30_000

async function acquireLock(historyPath: string): Promise<string | null> {
  const dir = dirname(historyPath)
  try {
    mkdirSync(dir, { recursive: true })
  } catch {
    // ignore
  }
  const lockPath = `${historyPath}.lock`
  const maxAttempts = 50 // ~1s total wait
  for (let i = 0; i < maxAttempts; i++) {
    try {
      writeFileSync(lockPath, String(process.pid), { flag: 'wx' })
      return lockPath
    } catch {
      try {
        const stat = statSync(lockPath)
        if (Date.now() - stat.mtimeMs > STALE_LOCK_MS) {
          // Stale lock from a crashed process — force-remove so the next
          // attempt (or this loop's next iteration) can acquire it cleanly.
          unlinkSync(lockPath)
          continue
        }
      } catch {
        // Lock disappeared between the failed write and this stat, or the
        // stat itself failed — just retry via the normal backoff below.
      }
      // Async sleep instead of a busy-wait spin — this blocks the whole
      // single-threaded Node process on every lock contention otherwise.
      await sleep(20)
    }
  }
  // Never acquired the lock (still held by another live process) — return
  // null so the caller skips releaseLock instead of deleting a lockfile it
  // doesn't own, which would let a third process barge in mid-write.
  return null
}

function releaseLock(lockPath: string): void {
  try {
    unlinkSync(lockPath)
  } catch {
    // already gone — nothing to clean up
  }
}

export async function appendEntry(
  historyPath: string,
  entry: ScoreHistoryEntry,
  maxEntries: number = MAX_HISTORY_ENTRIES
): Promise<ScoreHistoryEntry[]> {
  const lockPath = await acquireLock(historyPath)
  try {
    const existing = readHistory(historyPath)
    existing.push(entry)
    const wrote = writeHistory(historyPath, existing, maxEntries)
    if (!wrote) {
      console.warn(`[palade] failed to write history.json — this entry was not persisted to disk.`)
    }
    // Return what was actually persisted — the untrimmed array would diverge
    // from the next readHistory() once the retention cap kicks in.
    return existing.slice(-maxEntries)
  } finally {
    if (lockPath) releaseLock(lockPath)
  }
}

export function getPreviousScore(historyPath: string): number | null {
  // Only 'full' review entries are comparable — a prior 'diff' score covers
  // a different (smaller) file set, same reasoning as scoreCommand's filter.
  const entries = readHistory(historyPath).filter((e) => e.kind !== 'diff')
  if (entries.length === 0) return null
  return entries[entries.length - 1].score
}
