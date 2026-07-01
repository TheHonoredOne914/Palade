import type { AgentFinding, AgentName, Severity } from '../agents/base.js'
import type { CodeChunk } from '../ingestion/types.js'
import type { SynthesisResult } from '../agents/synthesis.js'
import type { TargetDefinition } from '../targets/schema.js'
import type { CustomAgentDefinition } from '../agents/custom/schema.js'

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
  fallbackStats?: {
    primary: { total: number; fallbacks: number }
    synthesis: { total: number; fallbacks: number }
  }
}

export interface CrossAgentFinding {
  title: string
  description: string
  agents: AgentName[]
  filePaths: string[]
  severity: Severity
  blastRadius: number
}

export interface SwarmOptions {
  onAgentStart?: (agentName: AgentName) => void
  onAgentComplete?: (
    agentName: AgentName,
    findingCount: number,
    durationMs: number,
    error?: Error
  ) => void
  onAgentBatchComplete?: (
    agentName: AgentName,
    batchIndex: number,
    totalBatches: number,
    batchFindings: number
  ) => void
  onSynthesisStart?: () => void
  onSynthesisComplete?: (durationMs: number) => void
  onVerdictDetected?: (filePath: string, sideA: string, sideB: string) => void
  onVerdictDecided?: (decision: string, confidence: number) => void
  timeoutMs?: number
  exhaustive?: boolean
  maxReviewTokens?: number
  /** User-defined custom agents loaded from palade.agents.ts. */
  customAgents?: CustomAgentDefinition[]
  /**
   * Economy mode: run all specialist domains in one combined multi-domain call
   * per batch instead of N parallel per-domain calls. Cuts the ~6x resend of
   * the same chunk content across agents at the cost of latency and per-domain
   * prompt richness. See src/agents/combined.ts for the full tradeoff.
   */
  economyMode?: boolean
  /**
   * Exhaustive mode: bypass the triage filter phase and review all files in the project.
   */
  /**
   * Strict Triage mode: Throw an error if any file is dropped due to maxReviewTokens limit.
   */
  strictTriage?: boolean
  noVerdict?: boolean
  signal?: AbortSignal
  specPath?: string
  constitutionPath?: string
}
