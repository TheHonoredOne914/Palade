import crypto from 'node:crypto'
import chalk from 'chalk'
import type { CodeChunk, Language } from '../ingestion/types.js'
import type { ModeConfig } from '../modes/index.js'

export type ReviewMode = 'standard' | 'security' | 'onboard' | 'debt' | 'ghost'

/** Built-in agent names. Custom agents use arbitrary strings. */
export type AgentName =
  | 'security'
  | 'architecture'
  | 'performance'
  | 'maintainability'
  | 'deadCode'
  | 'testIntelligence'
  | 'pragmatism'
  | (string & {}) // widen to string while keeping autocomplete for built-ins

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info'

export interface AgentFinding {
  id: string
  agentName: AgentName
  severity: Severity
  title: string
  description: string
  filePath?: string
  lineStart?: number
  lineEnd?: number
  symbolName?: string
  tags: string[]
  scorePenalty: number
  estimatedHours?: number
  hoursWasted?: number
  /** The provider that actually produced this finding (may differ from primary on fallback). */
  provider?: string
  /** The model that actually produced this finding. */
  model?: string
}

export interface DiffContext {
  baseBranch: string
  headBranch: string
  changedFiles: Array<{
    path: string
    status: 'added' | 'modified' | 'deleted'
    additions: number
    deletions: number
    diff: string
  }>
}

export interface AnnotationSummary {
  reviewRequests: Array<{
    filePath: string
    line: number
    reason: string
  }>
  focusRequests: Array<{
    filePath: string
    line: number
    domain: string
  }>
  ignoredFiles: string[]
  ignoredLines: Array<{
    filePath: string
    startLine: number
  }>
}

export interface AgentContext {
  targetDescription?: string
  targetFocus?: string[]
  projectLanguages: Language[]
  totalFiles: number
  totalChunks: number
  mode: ReviewMode
  diffContext?: DiffContext
  annotations?: AnnotationSummary
  modeConfig?: ModeConfig
  providerName?: string
}

export interface IAgent {
  name: AgentName
  domain: string
  analyze(chunks: CodeChunk[], context: AgentContext, signal?: AbortSignal): Promise<AgentFinding[]>
}

export const SEVERITY_PENALTY: Record<Severity, number> = {
  critical: 10,
  high: 5,
  medium: 2,
  low: 0.5,
  info: 0,
}

export function buildChunkContext(chunks: CodeChunk[]): string {
  return chunks
    .map((c) => `=== FILE: ${c.filePath} (lines ${c.startLine}–${c.endLine}) ===\n${c.content}`)
    .join('\n\n')
}

export function parseFindingsResponse(raw: string, agentName: AgentName): AgentFinding[] {
  if (!raw || raw.trim().length === 0) {
    console.warn(chalk.yellow(`⚠ ${agentName}: empty response from provider`))
    return []
  }

  let cleaned = raw.trim()

  // Safely strip outer markdown code blocks using a non-greedy match
  const greedyMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (greedyMatch) {
    cleaned = greedyMatch[1].trim()
  }

  // Extract array more robustly to avoid catching conversational '['
  const arrayMatch = cleaned.match(/\[\s*(?:\{[\s\S]*\})?\s*\]/)
  if (arrayMatch) {
    cleaned = arrayMatch[0]
  } else {
    const arrayStart = cleaned.indexOf('[')
    const arrayEnd = cleaned.lastIndexOf(']')
    if (arrayStart !== -1 && arrayEnd > arrayStart) {
      cleaned = cleaned.substring(arrayStart, arrayEnd + 1)
    }
  }

  // Fix common LLM JSON errors (trailing commas)
  cleaned = cleaned.replace(/,\s*([\]}])/g, '$1')

  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch (err) {
    console.warn(chalk.yellow(`⚠ ${agentName}: could not parse JSON from response`))
    // Dump a snippet of what failed to a debug file or console if needed
    return []
  }

  if (!Array.isArray(parsed)) {
    console.warn(`[${agentName}] Response is not an array`)
    return []
  }

  const findings: AgentFinding[] = []
  for (const item of parsed) {
    if (
      typeof item === 'object' &&
      item !== null &&
      typeof (item as Record<string, unknown>).title === 'string' &&
      typeof (item as Record<string, unknown>).severity === 'string'
    ) {
      const obj = item as Record<string, unknown>
      const severity = obj.severity as Severity
      if (!(severity in SEVERITY_PENALTY)) continue
      findings.push({
        id: crypto.randomUUID(),
        agentName:
          typeof obj.agentName === 'string' && obj.agentName
            ? (obj.agentName as AgentName)
            : agentName,
        severity,
        title: obj.title as string,
        description: (obj.description as string) ?? '',
        filePath: obj.filePath as string | undefined,
        lineStart: obj.lineStart as number | undefined,
        lineEnd: obj.lineEnd as number | undefined,
        symbolName: obj.symbolName as string | undefined,
        tags: Array.isArray(obj.tags) ? (obj.tags as string[]) : [],
        scorePenalty: SEVERITY_PENALTY[severity],
        estimatedHours: typeof obj.estimatedHours === 'number' ? obj.estimatedHours : undefined,
        hoursWasted: typeof obj.hoursWasted === 'number' ? obj.hoursWasted : undefined,
      })
    }
  }

  return findings
}

export function buildSystemPrompt(
  base: string,
  context: AgentContext,
  modeConfig?: ModeConfig
): string {
  let prompt = base
  if (context.diffContext) {
    const dc = context.diffContext
    prompt += `\n\nDIFF CONTEXT: This is a diff review of branch '${dc.headBranch}' vs '${dc.baseBranch}'. Focus on issues in the ${dc.changedFiles.length} changed files. Prioritise newly introduced problems over pre-existing ones.`
  }
  if (context.targetDescription) {
    prompt += `\n\nSUBSYSTEM CONTEXT: ${context.targetDescription}`
  }
  if (context.targetFocus?.length) {
    prompt += `\nFOCUS AREAS: ${context.targetFocus.join(', ')}`
  }
  if (modeConfig?.systemPromptSuffix) {
    prompt += `\n\n${modeConfig.systemPromptSuffix}`
  }
  if (context.annotations?.reviewRequests.length) {
    const requests = context.annotations.reviewRequests
      .slice(0, 10)
      .map((r) => `  - ${r.filePath}:${r.line} — "${r.reason}"`)
      .join('\n')
    prompt += `\n\nDEVELOPER REVIEW REQUESTS:\nThe following were explicitly flagged by the developer:\n${requests}\nPrioritise these in your findings.`
  }
  if (context.annotations?.focusRequests.length) {
    const focuses = context.annotations.focusRequests
      .map((f) => `  - ${f.filePath}:${f.line} → focus: ${f.domain}`)
      .join('\n')
    prompt += `\n\nDEVELOPER FOCUS REQUESTS:\n${focuses}`
  }
  return prompt
}

import { getProvider, type ProviderRole } from '../providers/router.js'

export abstract class BaseSpecialistAgent implements IAgent {
  abstract name: AgentName
  abstract domain: string
  protected abstract getSystemPrompt(): string

  async analyze(
    chunks: CodeChunk[],
    context: AgentContext,
    signal?: AbortSignal
  ): Promise<AgentFinding[]> {
    try {
      const providerName = (context.providerName as ProviderRole) ?? 'primary'
      const provider = getProvider(providerName)
      const systemPrompt = buildSystemPrompt(this.getSystemPrompt(), context, context.modeConfig)
      const userPrompt = buildChunkContext(chunks)
      const response = await provider.complete({
        systemPrompt,
        userPrompt,
        maxTokens: 4096,
        signal,
      })
      const findings = parseFindingsResponse(response.content ?? '', this.name)
      for (const f of findings) {
        f.provider = response.provider
        f.model = response.model
      }
      return findings
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return []
      throw err
    }
  }
}
