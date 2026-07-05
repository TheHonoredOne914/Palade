import type { AgentFinding, AgentName, Severity } from '../agents/base.js'
import { SEVERITY_PENALTY } from '../agents/base.js'
import type { CrossAgentFinding } from './types.js'
import { SEVERITY_RANK } from './merger.js'

// Derived from merger.ts's SEVERITY_RANK (rather than a separately maintained
// array) so the two orderings can't drift apart.
const SEVERITY_ORDER: Severity[] = (Object.keys(SEVERITY_RANK) as Severity[]).sort(
  (a, b) => SEVERITY_RANK[a] - SEVERITY_RANK[b]
)

function highestSeverity(findings: AgentFinding[]): Severity {
  for (const sev of SEVERITY_ORDER) {
    if (findings.some((f) => f.severity === sev)) return sev
  }
  return 'info'
}

export class AgentMemory {
  private store: Map<AgentName, AgentFinding[]> = new Map()

  record(agentName: AgentName, findings: AgentFinding[]): void {
    const existing = this.store.get(agentName) ?? []
    existing.push(...findings)
    this.store.set(agentName, existing)
  }

  getAll(): AgentFinding[] {
    const all: AgentFinding[] = []
    for (const findings of this.store.values()) {
      all.push(...findings)
    }
    return all
  }

  crossReference(): CrossAgentFinding[] {
    const locationAgentMap = new Map<string, Map<AgentName, AgentFinding[]>>()
    const symbolAgentMap = new Map<
      string,
      { agents: Set<AgentName>; findings: AgentFinding[]; files: Set<string> }
    >()

    for (const findings of this.store.values()) {
      for (const finding of findings) {
        // Bucket by the finding's own agentName, not the outer store key —
        // in economy mode every finding is recorded under the single
        // 'combined' agent, so keying off the store's own bucket would never
        // see >1 distinct agent and cross-referencing would silently no-op.
        const agentName = finding.agentName
        if (finding.filePath && finding.lineStart !== undefined) {
          const bucket = Math.floor(finding.lineStart / 10) * 10
          const key = `${finding.filePath}:${bucket}`
          if (!locationAgentMap.has(key)) {
            locationAgentMap.set(key, new Map())
          }
          const agentMap = locationAgentMap.get(key)!
          if (!agentMap.has(agentName)) {
            agentMap.set(agentName, [])
          }
          agentMap.get(agentName)!.push(finding)
        }

        if (finding.symbolName && finding.filePath) {
          const key = `${finding.filePath}::${finding.symbolName}`
          if (!symbolAgentMap.has(key)) {
            symbolAgentMap.set(key, { agents: new Set(), findings: [], files: new Set() })
          }
          const entry = symbolAgentMap.get(key)!
          entry.agents.add(agentName)
          entry.findings.push(finding)
          entry.files.add(finding.filePath)
        }
      }
    }

    const crossFindings: CrossAgentFinding[] = []

    for (const [locKey, agentMap] of locationAgentMap) {
      if (agentMap.size < 2) continue

      const agents = Array.from(agentMap.keys())
      const allFindings = Array.from(agentMap.values()).flat()
      const severity = highestSeverity(allFindings)
      const titles = allFindings
        .sort((a, b) => SEVERITY_PENALTY[b.severity] - SEVERITY_PENALTY[a.severity])
        .map((f) => f.title)
        .slice(0, 3)

      // locKey is `${filePath}:${bucket}` — split on the *last* colon only,
      // since filePath itself (LLM-sourced, unvalidated) may legitimately
      // contain colons (e.g. an echoed "path:line" string).
      const filePath = locKey.slice(0, locKey.lastIndexOf(':'))
      crossFindings.push({
        title: `Multi-domain issues near ${locKey}`,
        description: titles.join('; '),
        agents,
        filePaths: [filePath],
        severity,
        blastRadius: 1,
      })
    }

    for (const [symbolKey, entry] of symbolAgentMap) {
      if (entry.agents.size < 2) continue

      const allFindings = entry.findings
      const severity = highestSeverity(allFindings)
      const titles = allFindings
        .sort((a, b) => SEVERITY_PENALTY[b.severity] - SEVERITY_PENALTY[a.severity])
        .map((f) => f.title)
        .slice(0, 3)

      crossFindings.push({
        title: `Symbol "${symbolKey}" flagged across domains`,
        description: titles.join('; '),
        agents: Array.from(entry.agents),
        filePaths: Array.from(entry.files),
        severity,
        blastRadius: entry.files.size,
      })
    }

    crossFindings.sort((a, b) => b.blastRadius - a.blastRadius)

    return crossFindings
  }
}
