import crypto from 'node:crypto'
import chalk from 'chalk'
import type { CodeChunk, Language } from '../ingestion/types.js'
import type { ModeConfig } from '../modes/index.js'
import { validateAndFingerprintFindings } from '../orchestrator/findingValidation.js'

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
  | 'logic'
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
  findingFingerprint?: string
  estimatedHours?: number
  hoursWasted?: number
  /** The provider that actually produced this finding (may differ from primary on fallback). */
  provider?: string
  /** The model that actually produced this finding. */
  model?: string
  complexity?: number
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
  /** Optional user-provided architectural/business logic spec */
  spec?: string
  /** The formal constitution with behavioral guidelines for the agents */
  constitution?: string
  /**
   * Whether to append the built-in Ponytail/Karpathy/GStack skills block to
   * this agent's system prompt. Defaults to true (unset === enabled) so
   * behavior is unchanged unless a caller explicitly opts out via
   * `swarm.includeSkills: false` in config.
   */
  includeSkills?: boolean
}

export interface IAgent {
  name: AgentName
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
    .map((c) => {
      const numberedContent = c.content
        .split('\n')
        .map((line, i) => `${c.startLine + i} | ${line}`)
        .join('\n')
      return `=== FILE: ${c.filePath} (lines ${c.startLine}–${c.endLine}) ===\n${numberedContent}`
    })
    .join('\n\n')
}

/**
 * Best-effort recovery for a JSON array that was cut off mid-stream (typically
 * a max_tokens truncation). Scans for complete top-level `{...}` objects
 * inside the array and JSON.parses each individually, discarding only the
 * dangling/incomplete tail object instead of the whole batch.
 */
function salvageTruncatedArray(text: string): unknown[] {
  const arrayStart = text.indexOf('[')
  if (arrayStart === -1) return []

  const salvaged: unknown[] = []
  let depth = 0
  let inString = false
  let escaped = false
  let objStart = -1

  for (let i = arrayStart + 1; i < text.length; i++) {
    const ch = text[i]

    if (inString) {
      if (escaped) {
        escaped = false
      } else if (ch === '\\') {
        escaped = true
      } else if (ch === '"') {
        inString = false
      }
      continue
    }

    if (ch === '"') {
      inString = true
      continue
    }

    if (ch === '{') {
      if (depth === 0) objStart = i
      depth++
    } else if (ch === '}') {
      depth--
      if (depth === 0 && objStart !== -1) {
        const candidate = text.slice(objStart, i + 1)
        try {
          salvaged.push(JSON.parse(candidate))
        } catch {
          // Incomplete/malformed fragment — skip it.
        }
        objStart = -1
      }
    } else if (ch === '[') {
      depth++
    } else if (ch === ']') {
      depth--
      if (depth < 0) break // reached the outer array's closing bracket
    }
  }

  return salvaged
}

// A total parse failure must never look identical to "the agent reviewed this
// batch and found nothing" — that's how a truncated/garbled response gets
// silently reported to the user as clean code. Surface it as a real (info,
// zero-penalty) finding that flows through the normal merge/score/report
// pipeline instead of vanishing after a console.warn nobody reads.
function unparsableResponseFinding(agentName: AgentName, reason: string): AgentFinding[] {
  return [
    {
      id: crypto.randomUUID(),
      agentName,
      severity: 'info',
      title: `[REVIEW INCOMPLETE] ${agentName} response could not be parsed`,
      description: `The ${agentName} agent's response for this batch ${reason}. Findings for this batch may be missing — this is not a signal that the reviewed code is clean.`,
      tags: ['review-incomplete', 'parse-failure'],
      scorePenalty: 0,
    },
  ]
}

export function parseFindingsResponse(raw: string, agentName: AgentName): AgentFinding[] {
  if (!raw || raw.trim().length === 0) {
    console.warn(chalk.yellow(`⚠ ${agentName}: empty response from provider`))
    return unparsableResponseFinding(agentName, 'was empty')
  }

  let cleaned = raw.trim()

  // Safely strip CoT reasoning blocks
  cleaned = cleaned.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim()
  cleaned = cleaned.replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '').trim()

  // Safely strip outer markdown code blocks using a non-greedy match
  const greedyMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (greedyMatch) {
    cleaned = greedyMatch[1].trim()
  }

  // Find outermost JSON array bounds
  const arrayStart = cleaned.indexOf('[')
  const arrayEnd = cleaned.lastIndexOf(']')
  if (arrayStart !== -1 && arrayEnd > arrayStart) {
    cleaned = cleaned.substring(arrayStart, arrayEnd + 1)
  } else {
    // If no array brackets found, it might be an empty response or pure conversational text
    if (!cleaned.includes('[')) {
      return unparsableResponseFinding(agentName, 'contained no JSON findings array')
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    // Repair fallback only: stripping trailing commas on ALREADY-valid JSON
    // can corrupt string values that legitimately contain ", ]" or ", }".
    try {
      parsed = JSON.parse(cleaned.replace(/,\s*([\]}])/g, '$1'))
    } catch {
      // Likely a response truncated mid-array (e.g. hit max_tokens). Rather
      // than dropping the whole batch's findings, salvage whichever complete
      // top-level objects we can still extract.
      const salvaged = salvageTruncatedArray(cleaned)
      if (salvaged.length > 0) {
        console.warn(
          chalk.yellow(
            `⚠ ${agentName}: response appears truncated — salvaged ${salvaged.length} finding(s) from partial JSON`
          )
        )
        parsed = salvaged
      } else {
        console.warn(chalk.yellow(`⚠ ${agentName}: could not parse JSON from response`))
        return unparsableResponseFinding(agentName, 'could not be parsed as JSON')
      }
    }
  }

  if (!Array.isArray(parsed)) {
    console.warn(`[${agentName}] Response is not an array`)
    return unparsableResponseFinding(agentName, 'was not a JSON array')
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

      const title = obj.title as string
      if (!title || title.trim().length === 0) continue

      const description = obj.description as string
      if (typeof description !== 'string' || description.trim().length === 0) continue

      let filePath = obj.filePath as string | undefined
      if (typeof filePath !== 'string' || filePath.trim().length === 0) {
        filePath = undefined
      }

      const lineStart =
        typeof obj.lineStart === 'number' && !isNaN(obj.lineStart) ? obj.lineStart : undefined
      const lineEnd =
        typeof obj.lineEnd === 'number' && !isNaN(obj.lineEnd) ? obj.lineEnd : undefined

      const tags = Array.isArray(obj.tags) ? obj.tags.filter((t) => typeof t === 'string') : []

      findings.push({
        id: crypto.randomUUID(),
        agentName:
          typeof obj.agentName === 'string' && obj.agentName
            ? (obj.agentName as AgentName)
            : agentName,
        severity,
        title,
        description,
        filePath,
        lineStart,
        lineEnd,
        symbolName: typeof obj.symbolName === 'string' ? obj.symbolName : undefined,
        tags,
        scorePenalty: SEVERITY_PENALTY[severity],
        estimatedHours: typeof obj.estimatedHours === 'number' ? obj.estimatedHours : undefined,
        hoursWasted: typeof obj.hoursWasted === 'number' ? obj.hoursWasted : undefined,
      })
    }
  }

  return findings
}

import { HARDCODED_SKILLS } from './skills.js'

export function buildSystemPrompt(
  base: string,
  context: AgentContext,
  modeConfig?: ModeConfig
): string {
  let prompt = base

  prompt += `
\nSEVERITY RUBRIC:
- critical: Exploitable security flaw, guaranteed crash, or severe data loss.
- high: Severe logic bug, hard performance bottleneck, or major architectural flaw.
- medium: Edge case failure, moderate performance issue, or missing test for complex logic.
- low: Code smell, style violation, YAGNI, or minor maintainability issue.
- info: Informational observation or non-blocking suggestion.`
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
      .slice(0, 10)
      .map((f) => `  - ${f.filePath}:${f.line} → focus: ${f.domain}`)
      .join('\n')
    prompt += `\n\nDEVELOPER FOCUS REQUESTS:\n${focuses}`
  }

  // Embed Ponytail, Karpathy, and GStack philosophies into every agent's baseline behavior,
  // unless explicitly disabled (default: enabled) to save the ~3.5KB per call.
  if (context.includeSkills !== false) {
    prompt += `\n\n${HARDCODED_SKILLS}`
  }

  if (context.constitution) {
    prompt += `\n\nAGENT CONSTITUTION (BEHAVIORAL GUIDELINES):\n${context.constitution}`
  }

  return prompt
}

import { getProvider, type ProviderRole } from '../providers/router.js'
import type { IProvider } from '../providers/base.js'

/**
 * Re-asks the model a strict YES/NO question to confirm each critical/high
 * finding against the actual code chunk it references, dropping any it can't
 * confirm. Shared so every analyze() path (per-domain specialists AND the
 * combined economy-mode analyzer) verifies critical/high findings the same
 * way instead of only some paths guarding against false positives.
 */
export async function verifyCriticalHighFindings(
  findings: AgentFinding[],
  chunks: CodeChunk[],
  provider: IProvider,
  agentName: AgentName,
  signal?: AbortSignal
): Promise<AgentFinding[]> {
  const validatedFindings: AgentFinding[] = []
  for (const f of findings) {
    if (f.severity === 'critical' || f.severity === 'high') {
      const codeChunk = f.filePath
        ? chunks.find(
            (c) =>
              c.filePath === f.filePath &&
              (typeof f.lineStart !== 'number' ||
                (c.startLine <= f.lineStart && c.endLine >= f.lineStart))
          )
        : undefined
      if (!codeChunk) {
        // No matching chunk to verify against — keep the finding rather
        // than running a self-consistency check with no code to look at.
        validatedFindings.push(f)
        continue
      }
      try {
        const verifyResponse = await provider.complete({
          systemPrompt: 'You are an expert verifier. Reply strictly YES or NO.',
          userPrompt: `Does the following code ACTUALLY contain this vulnerability/issue?
Issue: ${f.title} - ${f.description}

Code:
\`\`\`
${codeChunk.content}
\`\`\`

Reply strictly YES or NO.`,
          maxTokens: 10,
          temperature: 0,
          signal,
        })
        if (/^\s*yes\b/i.test(verifyResponse.content)) {
          validatedFindings.push(f)
        } else {
          console.log(
            chalk.yellow(
              `  [${agentName}] Dropped false positive during self-consistency check: ${f.title}`
            )
          )
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') throw err
        // If validation fails (e.g. timeout), err on the side of caution and keep it
        validatedFindings.push(f)
      }
    } else {
      validatedFindings.push(f)
    }
  }
  return validatedFindings
}

/**
 * Annotate findings with the cyclomatic complexity of the code chunk they
 * reference (used later for maintainability-penalty scaling in the scorer).
 * Shared so every analyze() path — per-domain specialists, the combined
 * economy-mode analyzer, and custom agents — annotates complexity the same
 * way instead of only some paths populating it.
 */
export function annotateComplexity(findings: AgentFinding[], chunks: CodeChunk[]): AgentFinding[] {
  for (const f of findings) {
    if (f.filePath && typeof f.lineStart === 'number') {
      const match = chunks.find(
        (c) => c.filePath === f.filePath && c.startLine <= f.lineStart! && c.endLine >= f.lineStart!
      )
      if (match && match.complexity !== undefined) {
        f.complexity = match.complexity
      }
    }
  }
  return findings
}

export abstract class BaseSpecialistAgent implements IAgent {
  abstract name: AgentName
  protected abstract getSystemPrompt(context?: AgentContext): string

  async analyze(
    chunks: CodeChunk[],
    context: AgentContext,
    signal?: AbortSignal
  ): Promise<AgentFinding[]> {
    try {
      const providerName = (context.providerName as ProviderRole) ?? 'primary'
      const provider = getProvider(providerName)
      const systemPrompt = buildSystemPrompt(
        this.getSystemPrompt(context),
        context,
        context.modeConfig
      )
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

      for (const f of findings) {
        f.provider = response.provider
        f.model = response.model
      }
      annotateComplexity(findings, chunks)

      return verifyCriticalHighFindings(findings, chunks, provider, this.name, signal)
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return []
      throw err
    }
  }
}
