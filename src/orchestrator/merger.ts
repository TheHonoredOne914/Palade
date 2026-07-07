import type { AgentFinding, Severity } from '../agents/base.js'

export const SEVERITY_RANK: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
}

export function jaccardSimilarity(a: string, b: string): number {
  const getWords = (str: string) =>
    new Set(
      str
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length > 0)
    )

  const aSet = getWords(a)
  const bSet = getWords(b)

  if (aSet.size === 0 && bSet.size === 0) return 1
  if (aSet.size === 0 || bSet.size === 0) return 0

  let overlap = 0
  for (const word of aSet) {
    if (bSet.has(word)) overlap++
  }

  const union = aSet.size + bSet.size - overlap
  return union === 0 ? 0 : overlap / union
}

function shouldMerge(a: AgentFinding, b: AgentFinding): boolean {
  if (
    a.findingFingerprint &&
    b.findingFingerprint &&
    a.findingFingerprint === b.findingFingerprint
  ) {
    return true
  }

  if (a.filePath && b.filePath && a.filePath === b.filePath) {
    if (a.lineStart !== undefined && b.lineStart !== undefined) {
      if (a.lineStart === b.lineStart) {
        if (jaccardSimilarity(a.title, b.title) > 0.4) return true
      }
      // Nearby lines: only merge when the titles actually describe the same
      // issue — proximity alone collapses unrelated findings and loses one of
      // them. The 60-line window (not 5) covers duplicates produced by the
      // chunk splitter, whose halves overlap by up to 50 lines (scheduler.ts),
      // so the same defect can be reported from both halves.
      //
      // Different agents can also flag the exact same defect near the same
      // lines (e.g. security and architecture both catching a hardcoded
      // secret) — allow the proximity merge across agents too, but require a
      // stricter title-similarity bar (0.7 vs 0.5) to stay conservative, since
      // cross-agent titles are less likely to coincidentally share wording
      // than two passes of the same agent.
      if (Math.abs(a.lineStart - b.lineStart) <= 60) {
        const threshold = a.agentName === b.agentName ? 0.5 : 0.7
        if (jaccardSimilarity(a.title, b.title) > threshold) return true
      }
    }
  }
  return false
}

function mergeTwo(a: AgentFinding, b: AgentFinding): AgentFinding {
  const sevA = SEVERITY_RANK[a.severity]
  const sevB = SEVERITY_RANK[b.severity]
  const keep = sevA <= sevB ? a : b
  const discard = sevA <= sevB ? b : a

  const tagSet = new Set([...(keep.tags ?? []), ...(discard.tags ?? [])])
  const mergedDescription =
    keep.description === discard.description
      ? keep.description
      : `${keep.description}\n\nAdditional context: ${discard.description}`

  return {
    ...keep,
    scorePenalty:
      keep.scorePenalty !== undefined || discard.scorePenalty !== undefined
        ? Math.max(keep.scorePenalty ?? 0, discard.scorePenalty ?? 0)
        : undefined,
    tags: Array.from(tagSet),
    description: mergedDescription,
    mergedFromAgents: [
      ...(keep.mergedFromAgents ?? [keep.agentName]),
      ...(discard.mergedFromAgents ?? [discard.agentName]),
    ].filter((n, i, arr) => arr.indexOf(n) === i),
  }
}

export function mergeFindings(findings: AgentFinding[]): AgentFinding[] {
  const result = [...findings]
  const merged = new Set<number>()

  for (let i = 0; i < result.length; i++) {
    if (merged.has(i)) continue
    // Snapshot the current result[i] so that mutations from mergeTwo don't
    // affect subsequent shouldMerge comparisons in this inner loop. Without
    // this, merging result[i] with result[j] changes result[i] in-place, and
    // later j iterations compare against the merged (mutated) version, which
    // can produce cascading, unpredictable merges.
    let currentI = result[i]
    for (let j = i + 1; j < result.length; j++) {
      if (merged.has(j)) continue
      if (shouldMerge(currentI, result[j])) {
        currentI = mergeTwo(currentI, result[j])
        result[i] = currentI
        merged.add(j)
      }
    }
  }

  const deduped = result.filter((_, idx) => !merged.has(idx))

  deduped.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])

  return deduped
}

export function groupBySeverity(
  findings: AgentFinding[]
): Record<'critical' | 'high' | 'medium' | 'low' | 'info', AgentFinding[]> {
  return {
    critical: findings.filter((f) => f.severity === 'critical'),
    high: findings.filter((f) => f.severity === 'high'),
    medium: findings.filter((f) => f.severity === 'medium'),
    low: findings.filter((f) => f.severity === 'low'),
    info: findings.filter((f) => f.severity === 'info'),
  }
}
