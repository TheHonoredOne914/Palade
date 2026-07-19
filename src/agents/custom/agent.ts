import type { CodeChunk } from '../../ingestion/types.js'
import { getProvider } from '../../providers/router.js'
import {
  type AgentFinding,
  type AgentContext,
  type IAgent,
  type AgentName,
  type Severity,
  annotateComplexity,
  buildChunkContext,
  buildSystemPrompt,
  computeMaxTokens,
  completeAndParseFindings,
  verifyCriticalHighFindings,
} from '../base.js'
import { validateAndFingerprintFindings } from '../../orchestrator/findingValidation.js'
import type { CustomAgentDefinition } from './schema.js'

export class CustomAgent implements IAgent {
  readonly name: AgentName
  private readonly systemPrompt: string
  private readonly penaltyOverrides: Partial<Record<Severity, number>>
  readonly domain: string

  constructor(def: CustomAgentDefinition) {
    this.name = def.name
    this.systemPrompt = def.systemPrompt
    this.penaltyOverrides = def.severityPenalty ?? {}
    this.domain = def.domain
  }

  /**
   * Get the explicit per-agent score penalty override for a severity, if the
   * custom agent definition configured one. Returns undefined when no
   * override is configured so the caller leaves f.scorePenalty unset and lets
   * calculateScore's configured severityWeights apply uniformly, same as
   * built-in specialists (see base.ts's parseFindingsResponse).
   */
  getScorePenalty(severity: Severity): number | undefined {
    return this.penaltyOverrides[severity]
  }

  async analyze(
    chunks: CodeChunk[],
    context: AgentContext,
    signal?: AbortSignal
  ): Promise<AgentFinding[]> {
    try {
      const provider = getProvider('primary', this.name)
      // Inject the domain label so the LLM knows its specialization area
      const domainPrefix = `You are reviewing code in the '${this.domain}' domain.\n\n`
      const systemPrompt = buildSystemPrompt(
        domainPrefix + this.systemPrompt,
        context,
        context.modeConfig
      )
      const userPrompt = buildChunkContext(chunks)
      const { findings: parsed, response } = await completeAndParseFindings(
        provider,
        { systemPrompt, userPrompt, maxTokens: computeMaxTokens(chunks.length), signal },
        this.name
      )
      const findings = validateAndFingerprintFindings(parsed, chunks)
      // Apply custom score penalties only when this agent explicitly
      // configured a severityPenalty override; otherwise leave f.scorePenalty
      // unset so calculateScore's configured severityWeights apply.
      for (const f of findings) {
        f.provider = response.provider
        f.model = response.model
        const penalty = this.getScorePenalty(f.severity)
        if (typeof penalty === 'number') f.scorePenalty = penalty
      }
      annotateComplexity(findings, chunks)
      return verifyCriticalHighFindings(findings, chunks, provider, context, signal)
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return []
      throw err
    }
  }
}
