import type { AgentFinding, AgentName, Severity } from '../agents/base.js'
import type { SynthesisResult } from '../agents/synthesis.js'
import type { TargetDefinition } from '../targets/schema.js'
import type { CustomAgentDefinition } from '../agents/custom/schema.js'

export interface ResolvedTarget {
  definition: TargetDefinition
  resolvedPaths: string[]
}

export interface SwarmResult {
  runId: string
  findings: AgentFinding[]
  crossAgentFindings: CrossAgentFinding[]
  synthesis: SynthesisResult
  agentTimings: Record<AgentName, number>
  /**
   * Names of the agents actually dispatched this run (post mode/agentOverrides/
   * agentCount selection, pre economy-mode combining — economy mode still
   * logically covers every one of these domains, just via a single combined
   * call). Used by the scorer to avoid averaging in a free 100 for a category
   * that never ran (scorer-001).
   */
  agentsRun?: AgentName[]
  totalChunks: number
  totalTokensEstimated: number
  durationMs: number
  fallbackStats?: {
    primary: { total: number; fallbacks: number }
    synthesis: { total: number; fallbacks: number }
    triage: { total: number; fallbacks: number }
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
   * Caps the number of built-in specialist agents run in parallel (config.swarm.agentCount).
   * Custom agents are additive and not counted against this cap.
   */
  agentCount?: number
  /**
   * Strict Triage mode: Throw an error if any file is dropped due to maxReviewTokens limit.
   */
  strictTriage?: boolean
  /**
   * Absolute path to the project root, used for writing ADR decision files.
   * Falls back to process.cwd() when omitted.
   */
  projectRoot?: string
  noVerdict?: boolean
  noSynthesis?: boolean
  /**
   * Lines carrying an `@palade ignore` annotation. Findings on these lines are
   * dropped from each agent's results before cross-agent correlation and
   * synthesis run, so ignored findings never leak into the executive summary
   * or cross-agent penalties (which cannot be filtered after the fact — see
   * CrossAgentFinding, which carries no per-finding line info).
   */
  ignoredLines?: { filePath: string; startLine: number }[]
  signal?: AbortSignal
  specPath?: string
  constitutionPath?: string
  /**
   * Max number of batches processed concurrently per agent. Defaults to 5.
   */
  maxConcurrentBatches?: number
  /** Soft cap (in estimated tokens) on the total size of a single agent batch. Defaults to 16_000. */
  softTokenLimit?: number
  /** Hard cap (in estimated tokens) on a single chunk before it is recursively split. Defaults to 6_000. */
  hardChunkLimit?: number
  /** Max findings (by severity) sent to the synthesis LLM. Defaults to 50. */
  maxSynthesisFindings?: number
  /** Timeout in ms for the synthesis provider call. Defaults to 180_000. */
  synthesisTimeoutMs?: number
  /** Retention cap for .palade/decisions/ ADR files (oldest pruned first). Defaults to 100. */
  decisionsRetentionLimit?: number
  /**
   * Per-severity penalty weights (config.score.severityWeights) threaded
   * through to synthesis so its priority-fix ranking uses the same weights
   * as the score itself, instead of always falling back to the hardcoded
   * default SEVERITY_PENALTY table.
   */
  severityWeights?: Record<Severity, number>
  /** Line-proximity window (in lines) for merger.ts's near-match dedup. Defaults to 60. */
  nearMatchWindowLines?: number
  /** Title-similarity threshold for near-match dedup between findings from the same agent. Defaults to 0.5. */
  nearMatchSameAgentThreshold?: number
  /** Title-similarity threshold for near-match dedup between findings from different agents. Defaults to 0.7. */
  nearMatchCrossAgentThreshold?: number
}
