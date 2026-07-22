import crypto from 'node:crypto'
import chalk from 'chalk'
import type { CodeChunk, Language } from '../ingestion/types.js'
import type { ModeConfig } from '../modes/index.js'
import { validateAndFingerprintFindings } from '../orchestrator/findingValidation.js'
import { SEVERITY_PENALTY } from '../config/defaults.js'
import { HARDCODED_SKILLS } from './skills.js'
import { getProvider } from '../providers/router.js'
import {
  createLimiter,
  type IProvider,
  type CompletionRequest,
  type CompletionResponse,
} from '../providers/base.js'

export function formatSpecAndConstitution(context?: AgentContext): string {
  let block = ''
  if (context?.spec) {
    block += `\n\n=== BUSINESS LOGIC SPECIFICATION ===\n${context.spec}\n====================================\n\nCRITICAL: Cross-reference the code against the business logic specification above to ensure it is implemented correctly.`
  }
  if (context?.constitution) {
    block += `\n\nAGENT CONSTITUTION (BEHAVIORAL GUIDELINES):\n${context.constitution}`
  }
  return block
}

/** Strip chain-of-thought reasoning blocks emitted by some models. */
function stripCoT(text: string): string {
  return text
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
    .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '')
    .trim()
}

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
  /**
   * Explicit per-finding penalty override (set by custom agents with
   * severityPenalty config, or economy-mode attribution). Left unset for
   * built-in specialist findings so calculateScore's configured
   * severityWeights actually apply instead of being shadowed by a value
   * pre-baked from the default SEVERITY_PENALTY table — see scorer/calculator.ts.
   */
  scorePenalty?: number
  findingFingerprint?: string
  estimatedHours?: number
  hoursWasted?: number
  /** The provider that actually produced this finding (may differ from primary on fallback). */
  provider?: string
  /** The model that actually produced this finding. */
  model?: string
  complexity?: number
  /** When this finding results from merging findings across agents, the original agent names. */
  mergedFromAgents?: AgentName[]
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
  /** Optional user-provided architectural/business logic spec */
  spec?: string
  /** The formal constitution with behavioral guidelines for the agents */
  constitution?: string
  /** Pre-rendered repository-wide context block (see ingestion/repoContext.ts) */
  repoContext?: string
  /**
   * Whether to append the built-in Ponytail/Karpathy/GStack skills block to
   * this agent's system prompt. Defaults to true (unset === enabled) so
   * behavior is unchanged unless a caller explicitly opts out via
   * `swarm.includeSkills: false` in config.
   */
  includeSkills?: boolean
  /**
   * Full set of known project-relative file paths (from FileManifest),
   * populated by runSwarm when manifests are available. Lets
   * verifyCriticalHighFindings distinguish a finding that cites a real
   * project file outside the CURRENT BATCH (e.g. surfaced via injected
   * cross-file/repoContext) from a genuinely hallucinated file path.
   */
  knownFilePaths?: Set<string>
  /**
   * Concurrency cap for provider calls made within a single analyze() call
   * (e.g. verifyCriticalHighFindings' self-consistency checks). Mirrors
   * SwarmOptions.maxConcurrentBatches so per-batch verification concurrency
   * respects the same configured value swarm.ts uses for batch scheduling.
   */
  maxConcurrentBatches?: number
}

export interface IAgent {
  name: AgentName
  analyze(chunks: CodeChunk[], context: AgentContext, signal?: AbortSignal): Promise<AgentFinding[]>
}

// A flat output cap starves large batches the same way combined.ts's flat cap
// starved multi-domain calls: more chunks reviewed means more potential
// findings, so the JSON array gets cut off mid-stream (see
// salvageTruncatedArray, which exists to patch over exactly this). Scales
// with chunk count and, for economy mode's combined multi-domain call, also
// with domain count — a single call has to fit findings for every domain AND
// every chunk in the batch, so a cap that only accounts for one of the two
// starves the other. Single parameterized formula (agents-003) so
// combined.ts no longer maintains its own hand-copied variant of this same
// math that could drift out of sync.
export function computeMaxTokens(chunkCount: number, domainCount = 0): number {
  return Math.max(4096, chunkCount * 1000 + domainCount * 300)
}

export function buildChunkContext(chunks: CodeChunk[]): string {
  return chunks
    .map((c) => {
      const numberedContent = c.content
        .split('\n')
        .map((line, i) => `${c.startLine + i} | ${line}`)
        .join('\n')
      const prefix = c.contextPrefix || ''
      return `${prefix}=== FILE: ${c.filePath} (lines ${c.startLine}–${c.endLine}) ===\n${numberedContent}`
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
  let skipped = 0

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
          skipped++
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

  if (skipped > 0) {
    console.warn(chalk.yellow(`  salvageTruncatedArray: skipped ${skipped} malformed fragment(s)`))
  }
  return salvaged
}

// A total parse failure must never look identical to "the agent reviewed this
// batch and found nothing" — that's how a truncated/garbled response gets
// silently reported to the user as clean code. Surface it as a real (info,
// zero-penalty) finding that flows through the normal merge/score/report
// pipeline instead of vanishing after a console.warn nobody reads.
export function unparsableResponseFinding(agentName: AgentName, reason: string): AgentFinding[] {
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

export function parseFindingsResponse(
  raw: string,
  agentName: AgentName,
  trustModelAgentName = false
): AgentFinding[] {
  if (!raw || raw.trim().length === 0) {
    console.warn(chalk.yellow(`⚠ ${agentName}: empty response from provider`))
    return unparsableResponseFinding(agentName, 'was empty')
  }

  let cleaned = raw.trim()

  // Safely strip CoT reasoning blocks
  cleaned = stripCoT(cleaned)

  // Strip outer markdown code blocks — when multiple blocks exist, prefer the
  // one that looks like a JSON array (starts with '['). A simple non-greedy match
  // would grab the first (shortest) block, which is often an explanatory code
  // snippet, not the findings array.
  const allBlocks = [...cleaned.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/gi)]
  if (allBlocks.length > 0) {
    // Prefer the block containing a JSON array
    const jsonBlock = allBlocks.find((m) => m[1].trim().startsWith('['))
    cleaned = (jsonBlock ?? allBlocks[allBlocks.length - 1])[1].trim()
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
      const rawSeverity = obj.severity as string
      const severity = rawSeverity.trim().toLowerCase() as Severity
      if (!Object.hasOwn(SEVERITY_PENALTY, severity)) {
        console.warn(
          chalk.yellow(
            `⚠ ${agentName}: dropped finding "${(obj.title as string) ?? 'untitled'}" with unrecognized severity "${rawSeverity}"`
          )
        )
        continue
      }

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
          trustModelAgentName && typeof obj.agentName === 'string' && obj.agentName
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
        // Intentionally left unset here (not baked from SEVERITY_PENALTY) so
        // calculateScore's configured severityWeights apply to built-in
        // findings; scorer/calculator.ts's penaltyFor() falls back to the
        // severity weight whenever scorePenalty is undefined. Agents that need
        // an explicit override (e.g. CustomAgent's severityPenalty config) set
        // f.scorePenalty themselves after this call returns.
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

  prompt += `
\nSEVERITY RUBRIC:
- critical: Exploitable security flaw, guaranteed crash, or severe data loss.
- high: Severe logic bug, hard performance bottleneck, or major architectural flaw.
- medium: Edge case failure, moderate performance issue, or missing test for complex logic.
- low: Code smell, style violation, YAGNI, or minor maintainability issue.
- info: Informational observation or non-blocking suggestion.`
  if (context.diffContext) {
    const dc = context.diffContext
    const paths = dc.changedFiles.map((f) => f.path)
    const changedPaths = paths.slice(0, 10).join(', ')
    const truncationNote =
      paths.length > 10 ? `\n  ...and ${paths.length - 10} more (truncated)` : ''
    prompt += `\n\nDIFF CONTEXT: This is a diff review of branch '${dc.headBranch}' vs '${dc.baseBranch}'. Focus on issues in the ${dc.changedFiles.length} changed files: ${changedPaths}${truncationNote}. Prioritise newly introduced problems over pre-existing ones.`
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
    const allRequests = context.annotations.reviewRequests
    const requests = allRequests
      .slice(0, 10)
      .map((r) => `  - ${r.filePath}:${r.line} — "${r.reason}"`)
      .join('\n')
    const truncationNote =
      allRequests.length > 10 ? `\n  ...and ${allRequests.length - 10} more (truncated)` : ''
    prompt += `\n\nDEVELOPER REVIEW REQUESTS:\nThe following were explicitly flagged by the developer:\n${requests}${truncationNote}\nPrioritise these in your findings.`
  }
  if (context.annotations?.focusRequests.length) {
    const allFocuses = context.annotations.focusRequests
    const focuses = allFocuses
      .slice(0, 10)
      .map((f) => `  - ${f.filePath}:${f.line} → focus: ${f.domain}`)
      .join('\n')
    const truncationNote =
      allFocuses.length > 10 ? `\n  ...and ${allFocuses.length - 10} more (truncated)` : ''
    prompt += `\n\nDEVELOPER FOCUS REQUESTS:\n${focuses}${truncationNote}`
  }

  if (context.repoContext) {
    prompt += `\n\n${context.repoContext}`
  }

  // Embed Ponytail, Karpathy, and GStack philosophies into every agent's baseline behavior,
  // unless explicitly disabled (default: enabled) to save the ~3.5KB per call.
  if (context.includeSkills !== false) {
    prompt += `\n\n${HARDCODED_SKILLS}`
  }

  prompt += formatSpecAndConstitution(context)

  return prompt
}

/** True when parseFindingsResponse returned ONLY its parse-failure sentinel. */
export function isParseFailureSentinel(findings: AgentFinding[]): boolean {
  return findings.length === 1 && findings[0].tags.includes('parse-failure')
}

const JSON_CORRECTION =
  '\n\nCRITICAL: Your previous response could not be parsed as JSON. Respond with ONLY a valid JSON array of finding objects — no prose, no explanation, no markdown code fences. If there are genuinely no findings, respond with exactly [].'

/**
 * Calls the provider and parses the findings response, retrying ONCE with a
 * strict JSON-only correction if the first response was unparsable (prose or
 * garbled output instead of a JSON array). Weak free-tier models frequently
 * recover on a strict retry — this was the dominant failure mode in
 * docs/BENCHMARKS.md (2–4 of 6 agents returning unparsable output). Bounded to
 * a single extra call so a persistently broken model can't loop. If the retry
 * also fails, the original parse-failure sentinel is returned so the
 * review-incomplete signal still reaches the user.
 *
 * Note: an empty-but-valid `[]` response ("found nothing") is NOT a parse
 * failure and never triggers a retry.
 */
export async function completeAndParseFindings(
  provider: IProvider,
  request: CompletionRequest,
  agentName: AgentName,
  trustModelAgentName = false
): Promise<{ findings: AgentFinding[]; response: CompletionResponse }> {
  const response = await provider.complete(request)
  const findings = parseFindingsResponse(response.content ?? '', agentName, trustModelAgentName)
  if (!isParseFailureSentinel(findings)) {
    return { findings, response }
  }

  console.warn(
    chalk.yellow(
      `  ↻ ${agentName}: unparsable response — retrying once with strict JSON instruction`
    )
  )
  const retry = await provider.complete({
    ...request,
    systemPrompt: request.systemPrompt + JSON_CORRECTION,
  })
  const retryFindings = parseFindingsResponse(retry.content ?? '', agentName, trustModelAgentName)
  if (!isParseFailureSentinel(retryFindings)) {
    return { findings: retryFindings, response: retry }
  }
  return { findings, response }
}

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
  context?: AgentContext,
  signal?: AbortSignal
): Promise<AgentFinding[]> {
  const knownFilePaths = context?.knownFilePaths
  // The verifier used to see only the bare code chunk — no spec/constitution
  // — so a finding correctly raised by cross-referencing the business-logic
  // spec would get silently dropped here: the verifier, blind to the
  // violated rule, has no way to confirm it. Mirror the same spec/
  // constitution block format buildSystemPrompt uses so the verifier has the
  // same information the original finding-generating call had (agents-002).
  const specConstitutionBlock = formatSpecAndConstitution(context)
  const verifyOne = async (f: AgentFinding): Promise<AgentFinding | null> => {
    const codeChunk = f.filePath
      ? chunks.find(
          (c) =>
            c.filePath === f.filePath &&
            (typeof f.lineStart !== 'number' ||
              (c.startLine <= f.lineStart && c.endLine >= f.lineStart))
        )
      : undefined
    if (!codeChunk) {
      if (!f.filePath) return f // no filePath: valid non-location finding, keep it
      // filePath doesn't match a chunk in THIS batch. If it matches a real
      // project file (e.g. cited via injected cross-file/repoContext that
      // lives in a different batch or a triaged-out file), we simply can't
      // verify it here — keep it rather than auto-dropping. Only drop when
      // the filePath doesn't match any file known to the project at all,
      // which is the actual signal of a hallucinated reference.
      if (knownFilePaths) {
        return knownFilePaths.has(f.filePath) ? f : null
      }
      // No project-wide file list available (e.g. watch.ts's AgentContext
      // doesn't thread one through, unlike swarm.ts) — we genuinely can't
      // tell a real-but-out-of-batch file reference from a hallucinated one.
      // Prefer keeping the finding over auto-dropping it: an unverifiable
      // critical/high finding surfacing as a possible false positive is
      // safer than a real one silently vanishing (agents-105).
      return f
    }
    try {
      const verifyResponse = await provider.complete({
        systemPrompt: `You are an expert verifier. Reply strictly YES or NO.${specConstitutionBlock}`,
        userPrompt: `Does the following code ACTUALLY contain this vulnerability/issue?
Issue: ${f.title} - ${f.description}

Code:
\`\`\`
${codeChunk.content}
\`\`\`

Reply strictly YES or NO.`,
        maxTokens: 1024,
        temperature: 0,
        signal,
      })
      const cleaned = stripCoT(verifyResponse.content)
      // Use the LAST standalone YES/NO token, not the first — a rambling
      // reply that reasons through the issue before landing on a verdict
      // (e.g. "This looks concerning... NO, actually it's sanitized") would
      // otherwise have its actual verdict overridden by an earlier
      // in-passing YES/NO mentioned while thinking out loud (agents-101).
      const matches = [...cleaned.matchAll(/\b(YES|NO)\b/gi)]
      const lastMatch = matches[matches.length - 1]
      // Fail closed: only a standalone YES/NO word confirms or drops a
      // finding. A substring scan for "yes" anywhere in the reply (e.g.
      // "yesterday") could wrongly confirm a finding the model never
      // actually affirmed (agents-001).
      if (lastMatch?.[1].toUpperCase() === 'YES') {
        return f
      }
      if (lastMatch?.[1].toUpperCase() === 'NO') {
        console.log(
          chalk.yellow(
            `  [${f.agentName}] Dropped false positive during self-consistency check: ${f.title}`
          )
        )
        return null
      }
      // Neither a standalone YES nor NO was found — the reply was ambiguous
      // or unparseable. Treating "couldn't verify" the same as "confirmed
      // false positive" would silently drop real findings; keep it instead,
      // consistent with the other fail-safe branches in this function
      // (agents-105).
      console.warn(
        chalk.yellow(`  [${f.agentName}] Verifier reply unparseable, keeping finding: ${f.title}`)
      )
      return f
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') throw err
      console.warn(
        chalk.yellow(
          `  [${f.agentName}] Self-consistency check failed (${err instanceof Error ? err.message : String(err)}). Keeping finding: ${f.title}`
        )
      )
      return f
    }
  }

  // Cap concurrency within THIS analyze() call so a batch with many
  // critical/high findings doesn't fire one provider call per finding at
  // once. Note this limiter is created fresh per call, not shared across the
  // run — it bounds per-batch verification concurrency, not the swarm's
  // separate global "max N concurrent batches" cap (scheduler.ts), so total
  // verification concurrency across all batches/agents is not itself capped.
  // Mirrors the same configured value (config.swarm.maxConcurrentBatches) via
  // context.maxConcurrentBatches, defaulting to 5 when not threaded through.
  const limit = createLimiter(context?.maxConcurrentBatches ?? 5)
  const validated = await Promise.all(
    findings.map((f) => {
      if (f.severity === 'critical' || f.severity === 'high') {
        return limit(() => verifyOne(f))
      }
      return Promise.resolve(f)
    })
  )
  return validated.filter((v): v is AgentFinding => v !== null)
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
      if (!match) continue
      // Prefer the complexity of the SPECIFIC top-level node enclosing this
      // finding's line over match.complexity (a chunk-wide sum across every
      // top-level node bundled into that chunk to fill the token budget) —
      // otherwise a finding inside a small, simple function inherits the
      // inflated complexity of unrelated neighboring functions that happened
      // to land in the same chunk (ing-001). Falls back to the chunk sum for
      // chunks with no per-node breakdown (line/bracket-based chunking).
      const enclosingNode = match.nodeComplexities?.find(
        (n) => n.startLine <= f.lineStart! && n.endLine >= f.lineStart!
      )
      if (enclosingNode) {
        f.complexity = enclosingNode.complexity
      } else if (match.complexity !== undefined) {
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
      const provider = getProvider('primary', this.name)
      const systemPrompt = buildSystemPrompt(
        this.getSystemPrompt(context),
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

      for (const f of findings) {
        f.provider = response.provider
        f.model = response.model
      }
      annotateComplexity(findings, chunks)

      return await verifyCriticalHighFindings(findings, chunks, provider, context, signal)
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return []
      throw err
    }
  }
}
