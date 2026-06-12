import type { AgentFinding } from '../agents/base.js'
import type { ChangedFile, FindingDiff } from './types.js'

function buildFingerprint(f: AgentFinding): string {
  return `${f.filePath}::${f.lineStart ?? 0}::${f.title.slice(0, 40)}`
}

function buildLooseFingerprint(f: AgentFinding): string {
  return `${f.filePath}::${f.title.slice(0, 40)}`
}

const LINE_TOLERANCE = 10

export function compareFindings(
  headFindings: AgentFinding[],
  baseFindings: AgentFinding[],
  changedFiles: ChangedFile[]
): FindingDiff {
  const changedPaths = new Set(changedFiles.map((f) => f.path))

  const headInScope = headFindings.filter(
    (f) => f.filePath && changedPaths.has(f.filePath)
  )
  const baseInScope = baseFindings.filter(
    (f) => f.filePath && changedPaths.has(f.filePath)
  )

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
    const sevDiff =
      (severityOrder[a.severity] ?? 5) - (severityOrder[b.severity] ?? 5)
    if (sevDiff !== 0) return sevDiff
    return (b.scorePenalty ?? 0) - (a.scorePenalty ?? 0)
  })
}
