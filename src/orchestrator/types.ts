import type { AgentFinding, AgentName } from '../agents/base.js'
import type { CodeChunk } from '../ingestion/types.js'
import type { SynthesisResult } from '../agents/synthesis.js'
import type { TargetDefinition } from '../targets/schema.js'

export interface ResolvedTarget {
  definition: TargetDefinition
  resolvedPaths: string[]
}

export interface ScheduledBatch {
  agentName: AgentName
  chunks: CodeChunk[]
  estimatedTokens: number
}

export interface SwarmResult {
  runId: string
  findings: AgentFinding[]
  crossAgentFindings: CrossAgentFinding[]
  synthesis: SynthesisResult
  agentTimings: Record<AgentName, number>
  totalChunks: number
  totalTokensEstimated: number
  durationMs: number
}

export interface CrossAgentFinding {
  title: string
  description: string
  agents: AgentName[]
  filePaths: string[]
  severity: 'critical' | 'high' | 'medium'
  blastRadius: number
}

export interface SwarmOptions {
  onAgentStart?: (agentName: AgentName) => void
  onAgentComplete?: (agentName: AgentName, findingCount: number, durationMs: number) => void
  onSynthesisStart?: () => void
  onSynthesisComplete?: (durationMs: number) => void
  timeoutMs?: number
}
