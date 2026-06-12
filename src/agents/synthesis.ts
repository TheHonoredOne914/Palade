import type { IProvider } from '../providers/base.js'
import { getProvider } from '../providers/router.js'
import type { AgentContext, AgentFinding } from './base.js'

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

const SYNTHESIS_PROMPT = `You are the synthesis agent for a codebase review. You have received findings from 6 specialist agents.

Your job: synthesize these findings into a coherent report.

Return ONLY valid JSON matching this exact schema:
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
  // Strip markdown code blocks if present
  let cleaned = raw.trim()
  const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlockMatch) {
    cleaned = codeBlockMatch[1].trim()
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/)
    if (match) {
      try {
        parsed = JSON.parse(match[0])
      } catch {
        console.warn('[synthesis] Could not parse synthesis JSON')
        return null
      }
    } else {
      console.warn('[synthesis] No JSON object found in response')
      return null
    }
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
        .filter(
          (f) =>
            typeof f.rank === 'number' &&
            typeof f.title === 'string' &&
            typeof f.rationale === 'string' &&
            typeof f.estimatedHours === 'number'
        )
        .map((f) => ({
          rank: f.rank as number,
          title: f.title as string,
          rationale: f.rationale as string,
          estimatedHours: f.estimatedHours as number,
          affectedFiles: Array.isArray(f.affectedFiles) ? (f.affectedFiles as string[]) : [],
        }))
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
  crossTargetFindings: AgentFinding[],
  context: AgentContext
): Promise<SynthesisResult> {
  try {
    const provider: IProvider = getProvider('synthesis')

    // Cap findings to top 50 by severity to prevent timeout
    const sorted = [...allFindings].sort((a, b) => b.scorePenalty - a.scorePenalty)
    const cappedFindings = sorted.slice(0, 50)

    const userPrompt = JSON.stringify(
      {
        allFindings: cappedFindings,
        totalFindings: allFindings.length,
        crossTargetFindings,
        context,
      },
      null,
      2
    )

    const response = await Promise.race([
      provider.complete({
        systemPrompt: SYNTHESIS_PROMPT,
        userPrompt,
        maxTokens: 4096,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Synthesis timed out')), 180_000)
      )
    ])

    const result = parseSynthesisResponse(response.content)
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
    console.error('[synthesis] analyze failed:', err)
    return {
      executiveSummary: 'Synthesis encountered an error during analysis.',
      priorityFixes: [],
      crossCuttingObservations: [],
      debtEstimate: { critical: 0, high: 0, medium: 0, low: 0, total: 0, highestROIFix: '' },
    }
  }
}
