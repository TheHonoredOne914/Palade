import type { AgentFinding, Severity } from '../agents/base.js'

const SEVERITY_RANK: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
}

function jaccardSimilarity(a: string, b: string): number {
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
    const similarTitle = jaccardSimilarity(a.title, b.title) > 0.4

    if (a.lineStart !== undefined && b.lineStart !== undefined) {
      if (a.lineStart === b.lineStart) {
        if (jaccardSimilarity(a.title, b.title) > 0.4) return true
      }
      // Same agent, nearby lines: only merge when the titles actually describe
      // the same issue — proximity alone collapses unrelated findings and loses
      // one of them. The 60-line window (not 5) covers duplicates produced by
      // the chunk splitter, whose halves overlap by up to 50 lines
      // (scheduler.ts), so the same defect can be reported from both halves.
      if (a.agentName === b.agentName && Math.abs(a.lineStart - b.lineStart) <= 60) {
        if (jaccardSimilarity(a.title, b.title) > 0.5) return true
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

  const tagSet = new Set([...keep.tags, ...discard.tags])
  const mergedDescription = keep.description === discard.description 
    ? keep.description 
    : `${keep.description}\n\nAdditional context: ${discard.description}`

  return {
    ...keep,
    scorePenalty: Math.max(keep.scorePenalty ?? 0, discard.scorePenalty ?? 0),
    tags: Array.from(tagSet),
    description: mergedDescription,
  }
}

export function mergeFindings(findings: AgentFinding[]): AgentFinding[] {
  const result = [...findings]
  const merged = new Set<number>()

  for (let i = 0; i < result.length; i++) {
    if (merged.has(i)) continue
    for (let j = i + 1; j < result.length; j++) {
      if (merged.has(j)) continue
      if (shouldMerge(result[i], result[j])) {
        result[i] = mergeTwo(result[i], result[j])
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
