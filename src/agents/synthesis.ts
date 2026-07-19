import type { IProvider } from '../providers/base.js'
import { getProvider } from '../providers/router.js'
import { computeMaxTokens, type AgentContext, type AgentFinding, type Severity } from './base.js'
import type { CrossAgentFinding } from '../orchestrator/types.js'
import { penaltyFor } from '../scorer/calculator.js'

export interface PriorityFix {
  rank: number
  title: string
  rationale: string
  estimatedHours: number
  affectedFiles: string[]
}

export interface DebtEstimate {
  critical: number
  high: number
  medium: number
  low: number
  total: number
  highestROIFix: string
}

export interface SynthesisResult {
  executiveSummary: string
  priorityFixes: PriorityFix[]
  crossCuttingObservations: string[]
  debtEstimate: DebtEstimate
}

const SYNTHESIS_PROMPT = `You are the synthesis agent for a codebase review. You have received findings from a parallel AI swarm.

Your job: synthesize these findings into a coherent report.

Before outputting any JSON, you MUST write a <thinking> block to weigh the severity of findings, look for root causes, and plan your synthesis.

After your <thinking> block, return ONLY valid JSON matching this exact schema:
{
  "executiveSummary": "3-5 paragraph string summarizing the overall codebase health",
  "priorityFixes": [
    {
      "rank": 1,
      "title": "Fix title",
      "rationale": "Why this should be fixed first",
      "estimatedHours": 4,
      "affectedFiles": ["src/auth.ts"]
    }
  ],
  "crossCuttingObservations": [
    "Observation string about patterns that span multiple domains"
  ],
  "debtEstimate": {
    "highestROIFix": "Centralise auth validation — fixes 3 critical and 5 high findings"
  }
}

Be direct. Be specific. Do not repeat individual findings — synthesize patterns.

Note: the numeric critical/high/medium/low/total counts in debtEstimate are computed separately from the actual finding set — do NOT try to compute them yourself. Only provide "highestROIFix" in debtEstimate.`

function parseSynthesisResponse(raw: string): SynthesisResult | null {
  let cleaned = raw.trim()

  // Safely strip CoT reasoning blocks
  cleaned = cleaned.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim()
  cleaned = cleaned.replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '').trim()

  // Safely strip outer markdown code blocks using a non-greedy match
  const allBlocks = [...cleaned.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/gi)]
  if (allBlocks.length > 0) {
    const jsonBlock = allBlocks.find((m) => m[1].trim().startsWith('{'))
    cleaned = (jsonBlock ?? allBlocks[allBlocks.length - 1])[1].trim()
  }

  // Find the outermost JSON object boundaries
  const firstBrace = cleaned.indexOf('{')
  const lastBrace = cleaned.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    console.warn('[synthesis] Could not parse synthesis JSON')
    return null
  }

  if (typeof parsed !== 'object' || parsed === null) {
    console.warn('[synthesis] Response is not an object')
    return null
  }

  const obj = parsed as Record<string, unknown>

  if (typeof obj.executiveSummary !== 'string') {
    console.warn('[synthesis] Missing executiveSummary')
    return null
  }

  const priorityFixes: PriorityFix[] = Array.isArray(obj.priorityFixes)
    ? (obj.priorityFixes as Record<string, unknown>[])
        .filter((f) => f != null && typeof f.title === 'string' && typeof f.rationale === 'string')
        .map((f) => {
          const rank = typeof f.rank === 'number' ? f.rank : parseInt(String(f.rank)) || 0
          const hours =
            typeof f.estimatedHours === 'number'
              ? f.estimatedHours
              : parseFloat(String(f.estimatedHours)) || 0
          return {
            rank,
            title: f.title as string,
            rationale: f.rationale as string,
            estimatedHours: hours,
            affectedFiles: Array.isArray(f.affectedFiles)
              ? f.affectedFiles.filter((x): x is string => typeof x === 'string')
              : [],
          }
        })
    : []

  const crossCuttingObservations: string[] = Array.isArray(obj.crossCuttingObservations)
    ? (obj.crossCuttingObservations as unknown[]).filter((o): o is string => typeof o === 'string')
    : []

  // The critical/high/medium/low/total counts are computed directly from
  // allFindings in synthesize() (not trusted from the LLM, which only sees a
  // capped subset of findings) — only the qualitative highestROIFix is parsed
  // here. The numeric fields are filled in by the caller.
  const rawDebt = obj.debtEstimate as Record<string, unknown> | undefined
  const debtEstimate: DebtEstimate = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    total: 0,
    highestROIFix: typeof rawDebt?.highestROIFix === 'string' ? rawDebt.highestROIFix : '',
  }

  return {
    executiveSummary: obj.executiveSummary,
    priorityFixes,
    crossCuttingObservations,
    debtEstimate,
  }
}

/**
 * Picks which findings get sent to the synthesis LLM when there are more
 * than the cap. A plain top-N-by-penalty sort lets one hot file with 50+
 * findings crowd out every other file's issues from synthesis entirely on a
 * large codebase — this reserves one slot per distinct file (the file's own
 * highest-penalty finding) before filling remaining capacity by raw penalty,
 * so systemic patterns spread across many files stay visible.
 */
function selectFindingsForSynthesis(sorted: AgentFinding[], cap: number): AgentFinding[] {
  if (sorted.length <= cap) return sorted

  const seenFiles = new Set<string>()
  const selected = new Set<AgentFinding>()
  const rest: AgentFinding[] = []

  for (let i = 0; i < sorted.length; i++) {
    const finding = sorted[i]
    const key = finding.filePath ?? `__nofile_${i}`
    if (!seenFiles.has(key) && selected.size < cap) {
      seenFiles.add(key)
      selected.add(finding)
    } else {
      rest.push(finding)
    }
  }

  for (const finding of rest) {
    if (selected.size >= cap) break
    selected.add(finding)
  }

  // Restore penalty ordering — the breadth-first pass above interleaved
  // selection order across files.
  return sorted.filter((f) => selected.has(f))
}

/** Computes exact severity counts from the full finding set (not an LLM estimate). */
function computeDebtCounts(
  findings: AgentFinding[]
): Pick<DebtEstimate, 'critical' | 'high' | 'medium' | 'low' | 'total'> {
  const counts = { critical: 0, high: 0, medium: 0, low: 0, total: 0 }
  for (const f of findings) {
    if (f.severity === 'critical') counts.critical++
    else if (f.severity === 'high') counts.high++
    else if (f.severity === 'medium') counts.medium++
    else if (f.severity === 'low') counts.low++
  }
  counts.total = counts.critical + counts.high + counts.medium + counts.low
  return counts
}

/**
 * Debt mode's synthesisPromptSuffix (see modes/debt.ts) instructs the model
 * to "sum all finding.estimatedHours per severity tier", but the LLM's own
 * arithmetic isn't trusted for the numeric debtEstimate fields (same
 * reasoning as computeDebtCounts above) — so this computes the sum
 * deterministically in code instead. A finding with no estimatedHours
 * contributes 0 rather than throwing or being skipped.
 */
function computeDebtHours(
  findings: AgentFinding[]
): Pick<DebtEstimate, 'critical' | 'high' | 'medium' | 'low' | 'total'> {
  const sums = { critical: 0, high: 0, medium: 0, low: 0, total: 0 }
  for (const f of findings) {
    const hours =
      typeof f.estimatedHours === 'number' && Number.isFinite(f.estimatedHours)
        ? f.estimatedHours
        : 0
    if (f.severity === 'critical') sums.critical += hours
    else if (f.severity === 'high') sums.high += hours
    else if (f.severity === 'medium') sums.medium += hours
    else if (f.severity === 'low') sums.low += hours
  }
  sums.total = sums.critical + sums.high + sums.medium + sums.low
  return sums
}

/**
 * Ghost mode's systemPromptSuffix (see modes/ghost.ts) instructs the model to
 * add a "hoursWasted" field to every finding, but — same reasoning as
 * computeDebtHours above — that number isn't trusted from the LLM for the
 * numeric debtEstimate fields, and computeDebtCounts's plain finding tally
 * doesn't reflect hours at all. Sum hoursWasted deterministically instead. A
 * finding with no hoursWasted contributes 0.
 */
function computeGhostHours(
  findings: AgentFinding[]
): Pick<DebtEstimate, 'critical' | 'high' | 'medium' | 'low' | 'total'> {
  const sums = { critical: 0, high: 0, medium: 0, low: 0, total: 0 }
  for (const f of findings) {
    const hours =
      typeof f.hoursWasted === 'number' && Number.isFinite(f.hoursWasted) ? f.hoursWasted : 0
    if (f.severity === 'critical') sums.critical += hours
    else if (f.severity === 'high') sums.high += hours
    else if (f.severity === 'medium') sums.medium += hours
    else if (f.severity === 'low') sums.low += hours
  }
  sums.total = sums.critical + sums.high + sums.medium + sums.low
  return sums
}

export interface SynthesizeOptions {
  /** Max findings (by severity) sent to the LLM for synthesis. Default 50. */
  maxSynthesisFindings?: number
  /** Timeout in ms for the synthesis provider call. Default 180_000 (180s). */
  synthesisTimeoutMs?: number
  /** External abort signal so user cancellation (Ctrl+C) propagates to the synthesis provider call. */
  signal?: AbortSignal
  /**
   * Per-severity penalty weights (config.score.severityWeights) used to rank
   * findings for the synthesis prompt. Falls back to penaltyFor's own
   * default (the hardcoded SEVERITY_PENALTY table) when omitted, so the
   * executive summary's top-N ranking matches the same weights the score
   * itself uses instead of silently diverging when a user customizes them.
   */
  severityWeights?: Record<Severity, number>
}

export async function synthesize(
  allFindings: AgentFinding[],
  crossAgentFindings: CrossAgentFinding[],
  context: AgentContext,
  options: SynthesizeOptions = {}
): Promise<SynthesisResult> {
  const {
    maxSynthesisFindings = 50,
    synthesisTimeoutMs = 180_000,
    signal,
    severityWeights,
  } = options
  // Debt mode reports hours of debt, not a finding tally — sum
  // finding.estimatedHours per severity tier instead of counting findings.
  // Ghost mode similarly reports hours wasted on dead code — sum
  // finding.hoursWasted instead.
  const debtCounts =
    context.mode === 'debt'
      ? computeDebtHours(allFindings)
      : context.mode === 'ghost'
        ? computeGhostHours(allFindings)
        : computeDebtCounts(allFindings)
  // Define cleanup function at function scope so catch can access it
  let onExternalAbort: (() => void) | undefined
  try {
    const provider: IProvider = getProvider('synthesis')

    const sorted = [...allFindings].sort(
      (a, b) => penaltyFor(b, severityWeights) - penaltyFor(a, severityWeights)
    )
    const cappedFindings = selectFindingsForSynthesis(sorted, maxSynthesisFindings)
    const cappedSet = new Set(cappedFindings)
    const droppedFindings = sorted.filter((f) => !cappedSet.has(f))

    // Scale the output budget with the finding cap so raising
    // maxSynthesisFindings doesn't risk truncated JSON — reuses base.ts's
    // shared computeMaxTokens budget helper (same one combined.ts uses for
    // its own per-domain scaling) instead of a separately hand-rolled
    // formula, parameterized with this call's own per-item cost so the
    // numeric result is unchanged (agents-003).
    const maxTokens = computeMaxTokens(maxSynthesisFindings, 0, { perItemCost: 150 })

    let droppedSummary = ''
    if (droppedFindings.length > 0) {
      const countsByAgent: Record<string, number> = {}
      for (const f of droppedFindings) {
        countsByAgent[f.agentName] = (countsByAgent[f.agentName] || 0) + 1
      }
      droppedSummary = `Additionally, ${droppedFindings.length} lower-severity findings were omitted due to context limits. Breakdown: ${JSON.stringify(countsByAgent)}`
    }

    const userPrompt = JSON.stringify(
      {
        allFindings: cappedFindings,
        droppedSummary,
        totalFindings: allFindings.length,
        crossAgentFindings,
        context,
      },
      null,
      2
    )

    const controller = new AbortController()
    // Link external abort signal so user cancellation (Ctrl+C) propagates
    // to the synthesis provider call.
    onExternalAbort = () => controller.abort()
    signal?.addEventListener('abort', onExternalAbort)
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        controller.abort()
        // Name it AbortError so the catch below returns the graceful
        // fallback result instead of rethrowing a raw error.
        const err = new Error('Synthesis timed out')
        err.name = 'AbortError'
        reject(err)
      }, synthesisTimeoutMs)
      timeoutHandle!.unref?.()
    })

    const systemPrompt = context.modeConfig?.synthesisPromptSuffix
      ? `${SYNTHESIS_PROMPT}\n\n${context.modeConfig.synthesisPromptSuffix}`
      : SYNTHESIS_PROMPT

    const providerPromise = provider
      .complete({
        systemPrompt,
        userPrompt,
        maxTokens,
        signal: controller.signal,
      })
      .catch((err: unknown): null => {
        // Re-throw AbortErrors so the outer catch can handle graceful cancellation
        if (err instanceof Error && err.name === 'AbortError') throw err
        console.warn(
          `[synthesis] provider.complete failed: ${err instanceof Error ? err.message : String(err)}`
        )
        return null
      })

    const response = await Promise.race([providerPromise, timeoutPromise])
    if (timeoutHandle) clearTimeout(timeoutHandle)

    if (!response) {
      return {
        executiveSummary: 'Synthesis provider returned no response.',
        priorityFixes: [],
        crossCuttingObservations: [],
        debtEstimate: { ...debtCounts, highestROIFix: '' },
      }
    }

    const result = parseSynthesisResponse(response.content ?? '')
    if (!result) {
      return {
        executiveSummary: 'Synthesis failed to produce a valid response.',
        priorityFixes: [],
        crossCuttingObservations: [],
        debtEstimate: { ...debtCounts, highestROIFix: '' },
      }
    }
    result.debtEstimate = { ...debtCounts, highestROIFix: result.debtEstimate.highestROIFix }
    signal?.removeEventListener('abort', onExternalAbort!)
    return result
  } catch (err) {
    signal?.removeEventListener('abort', onExternalAbort!)
    if (err instanceof Error && err.name === 'AbortError') {
      return {
        executiveSummary: 'Synthesis was aborted.',
        priorityFixes: [],
        crossCuttingObservations: [],
        debtEstimate: { ...debtCounts, highestROIFix: '' },
      }
    }
    throw err
  }
}
