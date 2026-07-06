import type { AgentFinding } from '../agents/base.js'
import type { ChangedFile, FindingDiff } from './types.js'

function buildFingerprint(f: AgentFinding): string {
  return `${f.filePath}::${f.lineStart ?? 0}::${f.title.slice(0, 40)}`
}

function buildLooseFingerprint(f: AgentFinding): string {
  return `${f.filePath}::${f.title.slice(0, 40)}`
}

const LINE_TOLERANCE = 10

/**
 * Parse a unified diff for a single file and return the HEAD line ranges
 * that were added or modified (i.e. the `+` lines). Findings whose line range
 * overlaps these regions are considered "in scope" for this diff.
 */
function addedLineRanges(diff: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = []
  let headLine = 0
  let rangeStart: number | null = null
  let rangeEnd: number | null = null

  const lines = diff.split('\n')
  for (const line of lines) {
    if (line.startsWith('@@')) {
      if (rangeStart !== null && rangeEnd !== null) {
        ranges.push([rangeStart, rangeEnd])
      }
      rangeStart = null
      rangeEnd = null
      const match = line.match(/\+(\d+)(?:,(\d+))?/)
      headLine = match ? parseInt(match[1], 10) : 0
      continue
    }
    if (line.startsWith('+++') || line.startsWith('---')) continue

    if (line.startsWith('+')) {
      if (rangeStart === null) {
        rangeStart = headLine
        rangeEnd = headLine
      } else {
        rangeEnd = headLine
      }
      headLine++
    } else if (line.startsWith('-')) {
      if (rangeStart !== null && rangeEnd !== null) {
        ranges.push([rangeStart, rangeEnd])
      }
      rangeStart = null
      rangeEnd = null
    } else {
      if (rangeStart !== null && rangeEnd !== null) {
        ranges.push([rangeStart, rangeEnd])
      }
      rangeStart = null
      rangeEnd = null
      headLine++
    }
  }
  if (rangeStart !== null && rangeEnd !== null) {
    ranges.push([rangeStart, rangeEnd])
  }
  return ranges
}

function findingOverlapsAdded(
  finding: AgentFinding,
  addedRanges: Array<[number, number]>
): boolean {
  const fStart = finding.lineStart ?? 0
  const fEnd = finding.lineEnd ?? fStart
  if (fStart === 0 && fEnd === 0) {
    return addedRanges.length > 0
  }
  return addedRanges.some(([aStart, aEnd]) => fStart <= aEnd && fEnd >= aStart)
}

/**
 * When no base-branch findings are available, scope head findings to only
 * those that fall within added/changed lines of the diff. This produces a
 * meaningful "introduced" set instead of marking every finding as new.
 */
export function scopeToDiff(findings: AgentFinding[], changedFiles: ChangedFile[]): AgentFinding[] {
  const addedByPath = new Map<string, Array<[number, number]>>()
  for (const cf of changedFiles) {
    if (cf.diff && cf.status !== 'deleted') {
      addedByPath.set(cf.path, addedLineRanges(cf.diff))
    }
  }

  return findings.filter((f) => {
    const ranges = addedByPath.get(f.filePath ?? '')
    if (!ranges) return false
    return findingOverlapsAdded(f, ranges)
  })
}

export function compareFindings(
  headFindings: AgentFinding[],
  // `undefined` means the base-branch scan never ran (no data available at
  // all); `[]` means the scan ran and legitimately found nothing. These are
  // NOT the same case — conflating them made a clean base silently
  // under-report introduced findings that fall outside added diff lines.
  baseFindings: AgentFinding[] | undefined,
  changedFiles: ChangedFile[]
): FindingDiff {
  const changedPaths = new Set(changedFiles.map((f) => f.path))

  const headInScope = headFindings.filter((f) => f.filePath && changedPaths.has(f.filePath))

  // If the base-branch scan didn't run at all, we can't determine
  // unchanged/resolved. Scope head findings to the actual diff regions for a
  // meaningful "introduced" set, instead of marking every finding as new.
  // Fall back to treating all in-scope findings as introduced when no diff
  // content is available (e.g. callers that only provide file-level metadata).
  // A scan that DID run and found zero base findings falls through to the
  // normal matching path below, which naturally yields "introduced = all of
  // headInScope" when baseInScope is empty.
  if (baseFindings === undefined) {
    const hasDiffContent = changedFiles.some((cf) => cf.diff && cf.diff.length > 0)
    const introduced = hasDiffContent ? scopeToDiff(headInScope, changedFiles) : headInScope
    return { introduced, resolved: [], unchanged: [] }
  }

  const baseInScope = baseFindings.filter((f) => f.filePath && changedPaths.has(f.filePath))

  // Each base finding may only be consumed by (matched to) one head finding
  // and vice versa, otherwise a single base finding could be loose-matched by
  // several head findings (or several base findings by one head finding),
  // corrupting the introduced/resolved counts.
  const matchedHead = new Set<AgentFinding>()
  const matchedBase = new Set<AgentFinding>()

  // Pass 1: exact fingerprint matches (same file + line + title prefix), 1:1.
  const baseByFingerprint = new Map<string, AgentFinding[]>()
  for (const f of baseInScope) {
    const fp = buildFingerprint(f)
    if (!baseByFingerprint.has(fp)) baseByFingerprint.set(fp, [])
    baseByFingerprint.get(fp)!.push(f)
  }
  for (const f of headInScope) {
    const bf = baseByFingerprint.get(buildFingerprint(f))?.find((c) => !matchedBase.has(c))
    if (bf) {
      matchedHead.add(f)
      matchedBase.add(bf)
    }
  }

  // Pass 2: loose matches (same file + title, line within tolerance). Collect
  // every candidate pair still unmatched, then greedily consume the closest
  // pairs first so each finding is matched at most once.
  const baseByLoose = new Map<string, AgentFinding[]>()
  for (const f of baseInScope) {
    if (matchedBase.has(f)) continue
    const loose = buildLooseFingerprint(f)
    if (!baseByLoose.has(loose)) baseByLoose.set(loose, [])
    baseByLoose.get(loose)!.push(f)
  }

  const candidatePairs: Array<{ head: AgentFinding; base: AgentFinding; dist: number }> = []
  for (const f of headInScope) {
    if (matchedHead.has(f)) continue
    const baseMatches = baseByLoose.get(buildLooseFingerprint(f))
    if (!baseMatches) continue
    for (const bf of baseMatches) {
      const dist = Math.abs((bf.lineStart ?? 0) - (f.lineStart ?? 0))
      if (dist <= LINE_TOLERANCE) candidatePairs.push({ head: f, base: bf, dist })
    }
  }
  candidatePairs.sort((a, b) => a.dist - b.dist)
  for (const { head, base } of candidatePairs) {
    if (matchedHead.has(head) || matchedBase.has(base)) continue
    matchedHead.add(head)
    matchedBase.add(base)
  }

  const introduced = headInScope.filter((f) => !matchedHead.has(f))
  const unchanged = headInScope.filter((f) => matchedHead.has(f))
  const resolved = baseInScope.filter((f) => !matchedBase.has(f))

  return { introduced, resolved, unchanged }
}

export function rankIntroducedFindings(introduced: AgentFinding[]): AgentFinding[] {
  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 }
  return [...introduced].sort((a, b) => {
    const sevDiff = (severityOrder[a.severity] ?? 5) - (severityOrder[b.severity] ?? 5)
    if (sevDiff !== 0) return sevDiff
    return (b.scorePenalty ?? 0) - (a.scorePenalty ?? 0)
  })
}
