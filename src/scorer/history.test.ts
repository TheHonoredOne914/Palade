import { mkdtemp, rm, writeFile, readFile, utimes } from 'node:fs/promises'
import { existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, it, expect, afterEach } from 'vitest'
import { readHistory, writeHistory, appendEntry, getPreviousScore } from './history.js'
import type { ScoreHistoryEntry } from './types.js'

function entry(score: number, overrides: Partial<ScoreHistoryEntry> = {}): ScoreHistoryEntry {
  return {
    timestamp: new Date().toISOString(),
    runId: `run-${score}-${Math.random()}`,
    score,
    breakdown: { total: score, categories: [], findingCount: 0, crossAgentCount: 0 },
    delta: 0,
    ...overrides,
  }
}

const tmpDirs: string[] = []
async function makeTmpDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'palade-history-test-'))
  tmpDirs.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })))
})

describe('scorer/history', () => {
  describe('writeHistory / readHistory round trip', () => {
    it('writes and reads back entries unchanged', async () => {
      const dir = await makeTmpDir()
      const historyPath = join(dir, 'history.json')
      const entries = [entry(80), entry(85)]

      const wrote = writeHistory(historyPath, entries)
      expect(wrote).toBe(true)
      expect(existsSync(historyPath)).toBe(true)

      const read = readHistory(historyPath)
      expect(read).toHaveLength(2)
      expect(read.map((e) => e.score)).toEqual([80, 85])
    })

    it('returns [] for a path that does not exist', () => {
      const missing = join(tmpdir(), 'palade-history-does-not-exist', 'history.json')
      expect(readHistory(missing)).toEqual([])
    })
  })

  describe('trimEntries via writeHistory/appendEntry maxEntries', () => {
    it('maxEntries=0 trims to an empty array instead of returning everything (slice(-0) trap)', async () => {
      const dir = await makeTmpDir()
      const historyPath = join(dir, 'history.json')
      const entries = [entry(70), entry(75), entry(80)]

      writeHistory(historyPath, entries, 0)

      const raw = JSON.parse(await readFile(historyPath, 'utf-8'))
      expect(raw).toEqual([])
      expect(readHistory(historyPath)).toEqual([])
    })

    it('maxEntries=0 via appendEntry persists nothing and returns an empty trimmed array', async () => {
      const dir = await makeTmpDir()
      const historyPath = join(dir, 'history.json')

      const result = await appendEntry(historyPath, entry(90), 0)

      expect(result).toEqual([])
      const raw = JSON.parse(await readFile(historyPath, 'utf-8'))
      expect(raw).toEqual([])
    })

    it('a positive maxEntries keeps only the most recent N entries', async () => {
      const dir = await makeTmpDir()
      const historyPath = join(dir, 'history.json')
      const entries = [entry(60), entry(65), entry(70), entry(75)]

      writeHistory(historyPath, entries, 2)

      const read = readHistory(historyPath)
      expect(read.map((e) => e.score)).toEqual([70, 75])
    })
  })

  describe('corrupt history.json backup + recovery', () => {
    it('backs up unparsable JSON and starts from empty history', async () => {
      const dir = await makeTmpDir()
      const historyPath = join(dir, 'history.json')
      await writeFile(historyPath, '{ this is not valid json ]', 'utf-8')

      const read = readHistory(historyPath)
      expect(read).toEqual([])

      const files = readdirSync(dir)
      const backups = files.filter((f) => f.startsWith('history.json.corrupt-'))
      expect(backups).toHaveLength(1)
      const backupContent = await readFile(join(dir, backups[0]), 'utf-8')
      expect(backupContent).toBe('{ this is not valid json ]')
    })

    it('recovers cleanly after backing up: a subsequent append starts a fresh history', async () => {
      const dir = await makeTmpDir()
      const historyPath = join(dir, 'history.json')
      await writeFile(historyPath, 'not json at all', 'utf-8')

      // readHistory backs up + returns [] — appendEntry's own read (which
      // calls readHistory internally) must behave the same way rather than
      // throwing or clobbering the backup.
      const result = await appendEntry(historyPath, entry(50))
      expect(result).toHaveLength(1)
      expect(result[0].score).toBe(50)

      const files = readdirSync(dir)
      expect(files.some((f) => f.startsWith('history.json.corrupt-'))).toBe(true)
    })

    it('skips entries with non-finite scores instead of throwing', async () => {
      const dir = await makeTmpDir()
      const historyPath = join(dir, 'history.json')
      const raw = JSON.stringify([
        { timestamp: new Date().toISOString(), runId: 'a', score: 80, delta: 0 },
        { timestamp: new Date().toISOString(), runId: 'b', score: NaN, delta: 0 },
      ])
      await writeFile(historyPath, raw, 'utf-8')

      const read = readHistory(historyPath)
      expect(read).toHaveLength(1)
      expect(read[0].runId).toBe('a')
    })
  })

  describe('lock contention', () => {
    it('two concurrent appendEntry calls both eventually persist without clobbering each other', async () => {
      const dir = await makeTmpDir()
      const historyPath = join(dir, 'history.json')

      await Promise.all([
        appendEntry(historyPath, entry(10, { runId: 'first' })),
        appendEntry(historyPath, entry(20, { runId: 'second' })),
      ])

      const read = readHistory(historyPath)
      expect(read).toHaveLength(2)
      expect(read.map((e) => e.runId).sort()).toEqual(['first', 'second'])
    })

    it('skips writing (without throwing) when the lock is held by another process for the whole retry budget', async () => {
      const dir = await makeTmpDir()
      const historyPath = join(dir, 'history.json')
      const lockPath = `${historyPath}.lock`
      // Simulate a live, currently-writing process: a fresh lockfile that
      // never gets removed for the duration of this test.
      await writeFile(lockPath, '999999', 'utf-8')

      const result = await appendEntry(historyPath, entry(30))

      // The entry must NOT have been persisted — appendEntry gives up rather
      // than risk a racy read-modify-write against the lock holder.
      expect(result).toEqual([])
      expect(existsSync(historyPath)).toBe(false)
      // The lock we planted is untouched (appendEntry never acquired it, so
      // it must not delete a lock it doesn't own).
      expect(existsSync(lockPath)).toBe(true)
    }, 10000)
  })

  describe('stale lock recovery', () => {
    it('removes a lockfile older than the staleness threshold and proceeds to write', async () => {
      const dir = await makeTmpDir()
      const historyPath = join(dir, 'history.json')
      const lockPath = `${historyPath}.lock`
      await writeFile(lockPath, '123456', 'utf-8')
      // Back-date the lock's mtime well past STALE_LOCK_MS (30s) so
      // acquireLock treats it as abandoned by a crashed process and removes
      // it immediately instead of waiting out the ~1s retry budget.
      const old = new Date(Date.now() - 60_000)
      await utimes(lockPath, old, old)

      const result = await appendEntry(historyPath, entry(42, { runId: 'after-stale-lock' }))

      expect(result).toHaveLength(1)
      expect(result[0].runId).toBe('after-stale-lock')
      // The lock is released again after the write completes.
      expect(existsSync(lockPath)).toBe(false)
    })
  })

  describe('getPreviousScore', () => {
    it('returns null when there is no history', async () => {
      const dir = await makeTmpDir()
      expect(getPreviousScore(join(dir, 'history.json'))).toBeNull()
    })

    it('returns the score of the most recent non-diff entry', async () => {
      const dir = await makeTmpDir()
      const historyPath = join(dir, 'history.json')
      writeHistory(historyPath, [
        entry(50, { kind: 'full' }),
        entry(90, { kind: 'diff' }),
        entry(70, { kind: 'full' }),
      ])

      expect(getPreviousScore(historyPath)).toBe(70)
    })
  })

  describe('atomic write', () => {
    it('does not leave a .tmp file behind after a successful write', async () => {
      const dir = await makeTmpDir()
      const historyPath = join(dir, 'history.json')
      writeHistory(historyPath, [entry(88)])

      const files = readdirSync(dirname(historyPath))
      expect(files.some((f) => f.endsWith('.tmp'))).toBe(false)
      expect(files).toContain('history.json')
    })
  })
})
