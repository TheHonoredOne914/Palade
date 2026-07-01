import type { IProvider } from '../providers/base.js'
import { getProvider } from '../providers/router.js'
import type { AgentContext, AgentFinding } from './base.js'
import type { CrossAgentFinding } from '../orchestrator/types.js'

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
    "critical": 12,
    "high": 34,
    "medium": 67,
    "low": 20,
    "total": 133,
    "highestROIFix": "Centralise auth validation — fixes 3 critical and 5 high findings"
  }
}

Be direct. Be specific. Do not repeat individual findings — synthesize patterns.`

function parseSynthesisResponse(raw: string): SynthesisResult | null {
  let cleaned = raw.trim()

  // Safely strip CoT reasoning blocks
  cleaned = cleaned.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim()
  cleaned = cleaned.replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '').trim()

  // Safely strip outer markdown code blocks using a non-greedy match
  const greedyMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (greedyMatch) {
    cleaned = greedyMatch[1].trim()
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
        .filter((f) => typeof f.title === 'string' && typeof f.rationale === 'string')
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
            affectedFiles: Array.isArray(f.affectedFiles) ? (f.affectedFiles as string[]) : [],
          }
        })
    : []

  const crossCuttingObservations: string[] = Array.isArray(obj.crossCuttingObservations)
    ? (obj.crossCuttingObservations as unknown[]).filter((o): o is string => typeof o === 'string')
    : []

  const rawDebt = obj.debtEstimate as Record<string, unknown> | undefined
  const debtEstimate: DebtEstimate = {
    critical: typeof rawDebt?.critical === 'number' ? rawDebt.critical : 0,
    high: typeof rawDebt?.high === 'number' ? rawDebt.high : 0,
    medium: typeof rawDebt?.medium === 'number' ? rawDebt.medium : 0,
    low: typeof rawDebt?.low === 'number' ? rawDebt.low : 0,
    total: typeof rawDebt?.total === 'number' ? rawDebt.total : 0,
    highestROIFix: typeof rawDebt?.highestROIFix === 'string' ? rawDebt.highestROIFix : '',
  }

  return {
    executiveSummary: obj.executiveSummary,
    priorityFixes,
    crossCuttingObservations,
    debtEstimate,
  }
}

export async function synthesize(
  allFindings: AgentFinding[],
  crossAgentFindings: CrossAgentFinding[],
  context: AgentContext
): Promise<SynthesisResult> {
  try {
    const provider: IProvider = getProvider('synthesis')

    const sorted = [...allFindings].sort((a, b) => b.scorePenalty - a.scorePenalty)
    const cappedFindings = sorted.slice(0, 50)
    const droppedFindings = sorted.slice(50)

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
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        controller.abort()
        reject(new Error('Synthesis timed out'))
      }, 180_000)
      timeoutHandle!.unref?.()
    })

    const systemPrompt = context.modeConfig?.synthesisPromptSuffix
      ? `${SYNTHESIS_PROMPT}\n\n${context.modeConfig.synthesisPromptSuffix}`
      : SYNTHESIS_PROMPT

    const providerPromise = provider
      .complete({
        systemPrompt,
        userPrompt,
        maxTokens: 4096,
        signal: controller.signal,
      })
      .catch((err: unknown): null => {
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
        debtEstimate: { critical: 0, high: 0, medium: 0, low: 0, total: 0, highestROIFix: '' },
      }
    }

    const result = parseSynthesisResponse(response.content ?? '')
    if (!result) {
      return {
        executiveSummary: 'Synthesis failed to produce a valid response.',
        priorityFixes: [],
        crossCuttingObservations: [],
        debtEstimate: { critical: 0, high: 0, medium: 0, low: 0, total: 0, highestROIFix: '' },
      }
    }
    return result
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return {
        executiveSummary: 'Synthesis was aborted.',
        priorityFixes: [],
        crossCuttingObservations: [],
        debtEstimate: { critical: 0, high: 0, medium: 0, low: 0, total: 0, highestROIFix: '' },
      }
    }
    throw err
  }
}
