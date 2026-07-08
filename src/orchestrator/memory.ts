import type { AgentFinding, AgentName, Severity } from '../agents/base.js'
import { SEVERITY_PENALTY } from '../agents/base.js'
import type { CrossAgentFinding } from './types.js'
import { SEVERITY_RANK, isNearMatch } from './merger.js'

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
    const findingsByFile = new Map<string, AgentFinding[]>()
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
          if (!findingsByFile.has(finding.filePath)) {
            findingsByFile.set(finding.filePath, [])
          }
          findingsByFile.get(finding.filePath)!.push(finding)
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

    // Cluster findings within the same file using a small union-find over
    // isNearMatch (proximity window + title similarity), instead of requiring
    // an exact lineStart match — two agents flagging the same bug a few lines
    // apart (routine given 30-line chunk overlaps) would otherwise never be
    // grouped together.
    for (const [filePath, fileFindings] of findingsByFile) {
      const n = fileFindings.length
      const parent = Array.from({ length: n }, (_, i) => i)
      const find = (x: number): number => {
        if (parent[x] !== x) parent[x] = find(parent[x])
        return parent[x]
      }
      const union = (x: number, y: number): void => {
        const rx = find(x)
        const ry = find(y)
        if (rx !== ry) parent[rx] = ry
      }

      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          if (isNearMatch(fileFindings[i], fileFindings[j])) union(i, j)
        }
      }

      const clusters = new Map<number, AgentFinding[]>()
      for (let i = 0; i < n; i++) {
        const root = find(i)
        if (!clusters.has(root)) clusters.set(root, [])
        clusters.get(root)!.push(fileFindings[i])
      }

      for (const clusterFindings of clusters.values()) {
        const agents = Array.from(new Set(clusterFindings.map((f) => f.agentName)))
        if (agents.length < 2) continue

        const severity = highestSeverity(clusterFindings)
        const titles = [...clusterFindings]
          .sort((a, b) => SEVERITY_PENALTY[b.severity] - SEVERITY_PENALTY[a.severity])
          .map((f) => f.title)
          .slice(0, 3)
        const lines = clusterFindings.map((f) => f.lineStart!).sort((a, b) => a - b)
        const locLabel =
          lines[0] === lines[lines.length - 1]
            ? `${filePath}:${lines[0]}`
            : `${filePath}:${lines[0]}-${lines[lines.length - 1]}`

        crossFindings.push({
          title: `Multi-domain issues near ${locLabel}`,
          description: titles.join('; '),
          agents,
          filePaths: [filePath],
          severity,
          blastRadius: 1,
        })
      }
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
