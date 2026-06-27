import type { AgentFinding, AgentName, Severity } from '../agents/base.js'
import { SEVERITY_PENALTY } from '../agents/base.js'
import type { CrossAgentFinding } from './types.js'

const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low', 'info']

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
    const fileAgentMap = new Map<string, Map<AgentName, AgentFinding[]>>()
    const symbolAgentMap = new Map<
      string,
      { agents: Set<AgentName>; findings: AgentFinding[]; files: Set<string> }
    >()

    for (const [agentName, findings] of this.store) {
      for (const finding of findings) {
        if (finding.filePath) {
          if (!fileAgentMap.has(finding.filePath)) {
            fileAgentMap.set(finding.filePath, new Map())
          }
          const agentMap = fileAgentMap.get(finding.filePath)!
          if (!agentMap.has(agentName)) {
            agentMap.set(agentName, [])
          }
          agentMap.get(agentName)!.push(finding)
        }

        if (finding.symbolName) {
          const key = finding.symbolName
          if (!symbolAgentMap.has(key)) {
            symbolAgentMap.set(key, { agents: new Set(), findings: [], files: new Set() })
          }
          const entry = symbolAgentMap.get(key)!
          entry.agents.add(agentName)
          entry.findings.push(finding)
          if (finding.filePath) entry.files.add(finding.filePath)
        }
      }
    }

    const crossFindings: CrossAgentFinding[] = []

    for (const [filePath, agentMap] of fileAgentMap) {
      if (agentMap.size < 2) continue

      const agents = Array.from(agentMap.keys())
      const allFindings = Array.from(agentMap.values()).flat()
      const severity = highestSeverity(allFindings)
      const titles = allFindings
        .sort((a, b) => SEVERITY_PENALTY[b.severity] - SEVERITY_PENALTY[a.severity])
        .map((f) => f.title)
        .slice(0, 3)

      crossFindings.push({
        title: `Multi-domain issues in ${filePath}`,
        description: titles.join('; '),
        agents,
        filePaths: [filePath],
        severity,
        blastRadius: 1,
      })
    }

    for (const [symbolName, entry] of symbolAgentMap) {
      if (entry.agents.size < 2) continue
      if (entry.files.size < 2) continue

      const allFindings = entry.findings
      const severity = highestSeverity(allFindings)
      const titles = allFindings
        .sort((a, b) => SEVERITY_PENALTY[b.severity] - SEVERITY_PENALTY[a.severity])
        .map((f) => f.title)
        .slice(0, 3)

      crossFindings.push({
        title: `Symbol "${symbolName}" flagged across domains`,
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
