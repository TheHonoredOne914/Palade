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

// `entries.slice(-maxEntries)` degenerates to `entries.slice(-0)` — which is
// `entries.slice(0)`, i.e. the *entire* untrimmed array — when maxEntries is
// 0, silently defeating the retention cap instead of producing an empty
// array. Shared by writeHistory and appendEntry so both trim consistently.
//
// Trims 'full' and 'diff' kind entries against separate retention budgets
// (each gets its own slice of maxEntries) instead of one flat FIFO cap over
// the combined stream — a flat cap let frequent `palade diff` runs (e.g. in
// CI) evict every 'full'-kind entry within the retention window, silently
// breaking score delta/trend tracking (getPreviousScore and the sparkline
// both care about the chronologically-last 'full' entry) (scorer-002).
// Entries with no `kind` (written before the diff/full distinction existed)
// are treated as 'full', mirroring getPreviousScore's `kind !== 'diff'`
// filter. The combined result preserves the original chronological
// interleaving of both kinds.
function trimEntries(entries: ScoreHistoryEntry[], maxEntries: number): ScoreHistoryEntry[] {
  if (maxEntries <= 0) return []
  const diffEntries = entries.filter((e) => e.kind === 'diff')
  const fullEntries = entries.filter((e) => e.kind !== 'diff')
  const keptDiff = new Set(diffEntries.slice(-maxEntries))
  const keptFull = new Set(fullEntries.slice(-maxEntries))
  return entries.filter((e) => keptDiff.has(e) || keptFull.has(e))
}

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
        typeof rawBreakdown.crossAgentCount === 'number' &&
        typeof rawBreakdown.total === 'number' &&
        Number.isFinite(rawBreakdown.total)

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
    const trimmed = trimEntries(entries, maxEntries)
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

// Each acquisition writes a token unique to THIS acquisition (not just this
// process's pid, which would be indistinguishable from a prior acquisition by
// the same process) into the lockfile, and every removal — stale eviction or
// normal release — verifies the file still contains that same token before
// unlinking. Without this, a critical section that runs longer than
// STALE_LOCK_MS (slow disk/NFS, not just a crash) can have its lock evicted
// by another process as "stale"; when the original slow holder eventually
// finishes and releases, an unconditional path-based unlink would delete the
// NEW holder's live lock instead of its own, letting a third process acquire
// while the second still believes it holds exclusive access (scorer-00X).
let lockTokenCounter = 0
function makeLockToken(): string {
  lockTokenCounter += 1
  return `${process.pid}-${Date.now()}-${lockTokenCounter}-${Math.random().toString(36).slice(2)}`
}

function readLockToken(lockPath: string): string | null {
  try {
    return readFileSync(lockPath, 'utf-8')
  } catch {
    return null
  }
}

interface LockHandle {
  lockPath: string
  token: string
}

async function acquireLock(historyPath: string): Promise<LockHandle | null> {
  const dir = dirname(historyPath)
  try {
    mkdirSync(dir, { recursive: true })
  } catch {
    // ignore
  }
  const lockPath = `${historyPath}.lock`
  const maxAttempts = 50 // ~1s total wait
  for (let i = 0; i < maxAttempts; i++) {
    const token = makeLockToken()
    try {
      writeFileSync(lockPath, token, { flag: 'wx' })
      return { lockPath, token }
    } catch {
      try {
        const stat = statSync(lockPath)
        if (Date.now() - stat.mtimeMs > STALE_LOCK_MS) {
          // Stale lock from a crashed (or pathologically slow) process —
          // force-remove so the next attempt can acquire it cleanly. Re-read
          // the content immediately before unlinking and only remove it if
          // it's still the same token we just found stale, narrowing the
          // window where the original holder finishes and refreshes/replaces
          // it between our stat and our unlink.
          const staleToken = readLockToken(lockPath)
          const recheckStat = statSync(lockPath)
          if (
            staleToken !== null &&
            recheckStat.mtimeMs === stat.mtimeMs &&
            Date.now() - recheckStat.mtimeMs > STALE_LOCK_MS
          ) {
            unlinkSync(lockPath)
          }
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

function releaseLock(handle: LockHandle): void {
  try {
    // Only remove the lockfile if it still holds the exact token THIS
    // acquisition wrote. If it holds a different token, another process
    // evicted us as stale and acquired its own lock in the meantime — that
    // lock is live and must not be deleted out from under it.
    const current = readLockToken(handle.lockPath)
    if (current === handle.token) {
      unlinkSync(handle.lockPath)
    }
  } catch {
    // already gone — nothing to clean up
  }
}

export async function appendEntry(
  historyPath: string,
  entry: ScoreHistoryEntry,
  maxEntries: number = MAX_HISTORY_ENTRIES
): Promise<ScoreHistoryEntry[]> {
  const lockHandle = await acquireLock(historyPath)
  if (!lockHandle) {
    // Never acquired the lock (still held by another live process after
    // acquireLock's own ~1s retry budget) — a read-modify-write here would
    // race whichever process holds it and could silently clobber its write,
    // defeating the whole point of the lock. Skip persisting this entry
    // instead of writing unlocked.
    console.warn(
      `[palade] Could not acquire history.json lock — this run's score was not persisted to disk.`
    )
    return readHistory(historyPath)
  }
  try {
    const beforeAppend = readHistory(historyPath)
    const existing = [...beforeAppend, entry]
    const wrote = writeHistory(historyPath, existing, maxEntries)
    if (!wrote) {
      console.warn(`[palade] failed to write history.json — this entry was not persisted to disk.`)
      // Disk write failed — the optimistic `existing` array (including this
      // run's entry) was never actually persisted, so returning it would let
      // callers display/rely on data that vanishes on the next run. Return
      // the last known-good persisted state instead (scorer-002).
      return trimEntries(beforeAppend, maxEntries)
    }
    // Return what was actually persisted — the untrimmed array would diverge
    // from the next readHistory() once the retention cap kicks in.
    return trimEntries(existing, maxEntries)
  } finally {
    if (lockHandle) releaseLock(lockHandle)
  }
}

export function getPreviousScore(historyPath: string): number | null {
  // Only 'full' review entries are comparable — a prior 'diff' score covers
  // a different (smaller) file set, same reasoning as scoreCommand's filter.
  const entries = readHistory(historyPath).filter((e) => e.kind !== 'diff')
  if (entries.length === 0) return null
  return entries[entries.length - 1].score
}
