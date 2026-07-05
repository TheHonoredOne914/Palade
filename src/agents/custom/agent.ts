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
  parseFindingsResponse,
  SEVERITY_PENALTY,
  verifyCriticalHighFindings,
} from '../base.js'
import { validateAndFingerprintFindings } from '../../orchestrator/findingValidation.js'
import type { CustomAgentDefinition } from './schema.js'

export class CustomAgent implements IAgent {
  readonly name: AgentName
  readonly domain: string
  private readonly systemPrompt: string
  private readonly penaltyOverrides: Partial<Record<Severity, number>>

  constructor(def: CustomAgentDefinition) {
    this.name = def.name
    this.domain = def.domain
    this.systemPrompt = def.systemPrompt
    this.penaltyOverrides = def.severityPenalty ?? {}
  }

  /** Get score penalty for a severity, using custom overrides or defaults. */
  getScorePenalty(severity: Severity): number {
    return this.penaltyOverrides[severity] ?? SEVERITY_PENALTY[severity]
  }

  async analyze(
    chunks: CodeChunk[],
    context: AgentContext,
    signal?: AbortSignal
  ): Promise<AgentFinding[]> {
    try {
      const provider = getProvider('primary')
      const systemPrompt = buildSystemPrompt(this.systemPrompt, context, context.modeConfig)
      const userPrompt = buildChunkContext(chunks)
      const response = await provider.complete({
        systemPrompt,
        userPrompt,
        maxTokens: 4096,
        signal,
      })
      const findings = validateAndFingerprintFindings(
        parseFindingsResponse(response.content ?? '', this.name),
        chunks
      )
      // Apply custom score penalties
      for (const f of findings) {
        f.provider = response.provider
        f.model = response.model
        f.scorePenalty = this.getScorePenalty(f.severity)
      }
      annotateComplexity(findings, chunks)
      return verifyCriticalHighFindings(findings, chunks, provider, this.name, signal)
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return []
      throw err
    }
  }
}
