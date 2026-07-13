import type { Defect } from './groundTruth.js'

export interface AgentClaim {
  file: string
  lineStart: number
  lineEnd?: number
  severity?: 'low' | 'medium' | 'high' | 'critical'
  claim: string
}

export type ClaimOutcome = 'tp' | 'fp'

export interface MatchResult {
  claim: AgentClaim
  defect?: Defect
  outcome: ClaimOutcome
  reason: string
}

export interface ScoreOptions {
  lineTolerance?: number
}

export interface ScoreReport {
  agentName: string
  precision: number
  recall: number
  f1: number
  falsePositiveRate: number
  realBugCount: number
  truePositives: number
  falsePositives: number
  claimCount: number
  matches: MatchResult[]
}

function fileMatches(claimFile: string, defectFile: string): boolean {
  if (claimFile === defectFile) return true
  const a = claimFile.replace(/\\/g, '/')
  const b = defectFile.replace(/\\/g, '/')
  return a.endsWith(b) || b.endsWith(a)
}

function matchDefect(claim: AgentClaim, defects: Defect[], tolerance: number): Defect | undefined {
  const candidates = defects.filter(
    (d) => fileMatches(claim.file, d.file) && Math.abs(claim.lineStart - d.lineStart) <= tolerance
  )
  if (candidates.length === 0) return undefined
  // Pick the closest in-tolerance candidate across ALL categories, not
  // real-bug-first — a real-bug candidate used to always win even when an
  // in-tolerance false-positive trap was strictly closer to the claimed
  // line, wrongly scoring the trap claim as a true positive against the
  // farther real bug. Only break exact-distance ties in favor of real-bug.
  return candidates.reduce((best, d) => {
    const dDist = Math.abs(d.lineStart - claim.lineStart)
    const bestDist = Math.abs(best.lineStart - claim.lineStart)
    if (dDist < bestDist) return d
    if (dDist === bestDist && d.category === 'real-bug' && best.category !== 'real-bug') return d
    return best
  })
}

export function scoreAgent(
  agentName: string,
  claims: AgentClaim[],
  defects: Defect[],
  opts: ScoreOptions = {}
): ScoreReport {
  const tolerance = opts.lineTolerance ?? 10
  const matches: MatchResult[] = []
  const foundRealBugIds = new Set<string>()

  for (const claim of claims) {
    const defect = matchDefect(claim, defects, tolerance)
    if (!defect) {
      matches.push({
        claim,
        outcome: 'fp',
        reason: 'No ground-truth defect near this location.',
      })
      continue
    }
    if (defect.category === 'real-bug') {
      matches.push({ claim, defect, outcome: 'tp', reason: `Matched real bug ${defect.id}.` })
      foundRealBugIds.add(defect.id)
    } else {
      matches.push({
        claim,
        defect,
        outcome: 'fp',
        reason: `Matched false-positive trap ${defect.id} (research hypothesis, not a real bug).`,
      })
    }
  }

  const truePositives = matches.filter((m) => m.outcome === 'tp').length
  const falsePositives = matches.filter((m) => m.outcome === 'fp').length
  const realBugs = defects.filter((d) => d.category === 'real-bug').length
  const claimCount = claims.length

  const precision = claimCount === 0 ? 0 : truePositives / claimCount
  const recall = realBugs === 0 ? 1 : foundRealBugIds.size / realBugs
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall)
  const falsePositiveRate = claimCount === 0 ? 0 : falsePositives / claimCount

  return {
    agentName,
    precision,
    recall,
    f1,
    falsePositiveRate,
    realBugCount: realBugs,
    truePositives,
    falsePositives,
    claimCount,
    matches,
  }
}

export interface AgentRun {
  agentName: string
  claims: AgentClaim[]
}

export interface BenchmarkReport {
  perAgent: ScoreReport[]
  aggregate: {
    precision: number
    recall: number
    f1: number
    falsePositiveRate: number
    distinctRealBugsFound: number
    realBugCount: number
    totalClaims: number
    totalFalsePositives: number
  }
}

export function scoreAgents(
  runs: AgentRun[],
  defects: Defect[],
  opts: ScoreOptions = {}
): BenchmarkReport {
  const perAgent = runs.map((r) => scoreAgent(r.agentName, r.claims, defects, opts))
  const realBugs = defects.filter((d) => d.category === 'real-bug')
  const found = new Set<string>()
  let tp = 0
  let fp = 0
  let claims = 0
  for (const r of perAgent) {
    claims += r.claimCount
    fp += r.falsePositives
    for (const m of r.matches) {
      if (m.outcome === 'tp' && m.defect) found.add(m.defect.id)
      if (m.outcome === 'tp') tp++
    }
  }
  const precision = claims === 0 ? 0 : tp / claims
  const recall = realBugs.length === 0 ? 1 : found.size / realBugs.length
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall)
  const falsePositiveRate = claims === 0 ? 0 : fp / claims
  return {
    perAgent,
    aggregate: {
      precision,
      recall,
      f1,
      falsePositiveRate,
      distinctRealBugsFound: found.size,
      realBugCount: realBugs.length,
      totalClaims: claims,
      totalFalsePositives: fp,
    },
  }
}
