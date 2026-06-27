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
  baseFindings: AgentFinding[],
  changedFiles: ChangedFile[]
): FindingDiff {
  const changedPaths = new Set(changedFiles.map((f) => f.path))

  const headInScope = headFindings.filter((f) => f.filePath && changedPaths.has(f.filePath))

  // If no base findings were provided, we can't determine unchanged/resolved.
  // Scope head findings to the actual diff regions for a meaningful
  // "introduced" set, instead of marking every finding as new.
  // Fall back to treating all in-scope findings as introduced when no diff
  // content is available (e.g. callers that only provide file-level metadata).
  if (baseFindings.length === 0) {
    const hasDiffContent = changedFiles.some((cf) => cf.diff && cf.diff.length > 0)
    const introduced = hasDiffContent ? scopeToDiff(headInScope, changedFiles) : headInScope
    return { introduced, resolved: [], unchanged: [] }
  }

  const baseInScope = baseFindings.filter((f) => f.filePath && changedPaths.has(f.filePath))

  const headFingerprints = new Set(headInScope.map(buildFingerprint))
  const baseFingerprints = new Set(baseInScope.map(buildFingerprint))

  // Build loose fingerprint map for line-shift tolerance
  const baseByLoose = new Map<string, AgentFinding[]>()
  for (const f of baseInScope) {
    const loose = buildLooseFingerprint(f)
    if (!baseByLoose.has(loose)) baseByLoose.set(loose, [])
    baseByLoose.get(loose)!.push(f)
  }

  const introduced: AgentFinding[] = []
  const unchanged: AgentFinding[] = []

  for (const f of headInScope) {
    const fp = buildFingerprint(f)
    if (baseFingerprints.has(fp)) {
      unchanged.push(f)
      continue
    }

    // Check line-shift tolerance
    const loose = buildLooseFingerprint(f)
    const baseMatches = baseByLoose.get(loose)
    if (baseMatches) {
      const nearbyMatch = baseMatches.some(
        (bf) => Math.abs((bf.lineStart ?? 0) - (f.lineStart ?? 0)) <= LINE_TOLERANCE
      )
      if (nearbyMatch) {
        unchanged.push(f)
        continue
      }
    }

    introduced.push(f)
  }

  const resolved: AgentFinding[] = []
  const headByLoose = new Map<string, AgentFinding[]>()
  for (const f of headInScope) {
    const loose = buildLooseFingerprint(f)
    if (!headByLoose.has(loose)) headByLoose.set(loose, [])
    headByLoose.get(loose)!.push(f)
  }

  for (const f of baseInScope) {
    const fp = buildFingerprint(f)
    if (headFingerprints.has(fp)) continue

    const loose = buildLooseFingerprint(f)
    const headMatches = headByLoose.get(loose)
    if (headMatches) {
      const nearbyMatch = headMatches.some(
        (hf) => Math.abs((hf.lineStart ?? 0) - (f.lineStart ?? 0)) <= LINE_TOLERANCE
      )
      if (nearbyMatch) continue
    }

    resolved.push(f)
  }

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
