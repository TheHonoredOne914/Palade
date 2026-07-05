import type { CodeChunk } from '../ingestion/types.js'
import { getProvider } from '../providers/router.js'
import {
  type AgentFinding,
  type AgentContext,
  type AgentName,
  type Severity,
  annotateComplexity,
  buildChunkContext,
  buildSystemPrompt,
  parseFindingsResponse,
  SEVERITY_PENALTY,
  verifyCriticalHighFindings,
} from './base.js'
import type { IAgent } from './base.js'
import { validateAndFingerprintFindings } from '../orchestrator/findingValidation.js'

/**
 * Economy-mode analyzer: runs ALL specialist domains in a single provider call
 * per batch, with domain-tagged output, instead of N parallel per-domain calls.
 *
 * This is the one token-efficiency mechanism that actually cuts the ~6x resend
 * of the same chunk content across agents. The other candidate mechanisms are
 * non-viable here:
 *   - Provider prefix caching: each agent has a DIFFERENT system prompt, so the
 *     shared chunk content (in the user-message position) never forms a shared
 *     cacheable prefix across agents. Intra-agent caching is already automatic.
 *   - Shared system-prompt prefix: the system prompts differ per domain, so
 *     there is no shared prefix to dedupe.
 *
 * Tradeoff taken (rule 5 — stated, not dodged): combining domains into one call
 *   - LOSES parallelism: 6 agents finish in ~1 wall-clock call length, but a
 *     single combined call must read all domains, so its latency is closer to
 *     the slowest agent than the fastest. Net: latency usually goes UP, spend
 *     goes DOWN. Users opt in when cost > latency.
 *   - WEAKENS domain specificity: one prompt can't be as richly tuned per
 *     domain as six dedicated prompts. Findings may be less precise.
 *   - KEEPS per-domain scoring: each finding is tagged with its agentName, so
 *     the category score breakdown and synthesis pipeline are unchanged.
 */

/** Per-domain instruction block appended to the combined system prompt. */
export interface DomainSpec {
  name: AgentName
  label: string
  focus: string
}

export const DEFAULT_DOMAINS: DomainSpec[] = [
  {
    name: 'security',
    label: 'Security',
    focus: 'injection risks, auth gaps, hardcoded secrets, missing input validation',
  },
  {
    name: 'architecture',
    label: 'Architecture',
    focus: 'circular dependencies, layer violations, tight coupling, God objects',
  },
  {
    name: 'performance',
    label: 'Performance',
    focus: 'N+1 patterns, unbounded loops, missing caching, sync-in-async',
  },
  {
    name: 'maintainability',
    label: 'Maintainability',
    focus: 'duplicated logic, inconsistent naming, undocumented complexity',
  },
  {
    name: 'deadCode',
    label: 'Dead Code',
    focus: 'unused exports, zombie routes, unwired classes, stale TODOs',
  },
  {
    name: 'testIntelligence',
    label: 'Test Intelligence',
    focus: 'untested critical paths, hollow mocks, missing edge cases',
  },
  {
    name: 'logic',
    label: 'Logic & Correctness',
    focus: 'logical flaws, state mismanagement, race conditions, invalid assumptions',
  },
  {
    name: 'pragmatism',
    label: 'Pragmatism',
    focus: 'over-engineering, premature abstractions, unneeded configurability, YAGNI violations',
  },
]

function buildCombinedSystemPrompt(domains: DomainSpec[]): string {
  const sections = domains
    .map((d) => {
      let extra = ''
      if (d.name === 'deadCode') {
        extra = ' (NOTE: You are reviewing partial chunks. Do NOT report exports as unused unless you are certain they are dead. Assume public exports are used elsewhere.)'
      } else if (d.name === 'testIntelligence') {
        extra = ' (NOTE: You are reviewing partial chunks. Only flag missing tests if the chunk clearly contains complex logic lacking coverage, not just because a test file isn\'t visible.)'
      }
      return `### ${d.label} (agentName: "${d.name}")\nLook for: ${d.focus}.${extra}`
    })
    .join('\n\n')

  return `You are a combined multi-domain code review swarm. You are reviewing code as part of a larger analysis.

You must review the provided code through ALL of the following lenses in a single pass:

${sections}

Before outputting any JSON, you MUST write a <thinking> block to trace data flow, analyze edge cases, and justify your logic for all domains. 
At the end of your <thinking> block, perform a Self-Critique: ask yourself if there are any conditions where the code is actually safe or if you might be hallucinating. If the code is safe, drop the finding.

After your <thinking> block, return ONLY a valid JSON array of findings. No other text.

Each finding must match this exact schema, and MUST include its originating agentName:
{
  "agentName": ${domains.map((d) => `"${d.name}"`).join(' | ')},
  "severity": "critical" | "high" | "medium" | "low" | "info",
  "title": "Short title, max 10 words",
  "description": "2-4 sentences. Be specific. Explain the risk or problem clearly.",
  "filePath": "relative/path/to/file.ts",
  "lineStart": 42,
  "lineEnd": 67,
  "symbolName": "functionName (optional)",
  "tags": ["tag1", "tag2"]
}

- Be specific. Reference exact file paths and line numbers from the context provided.

### Verdict Mode (Internal Arbitration)
If you detect that two of your lenses fundamentally disagree on the same piece of code (e.g., Security says "add rate limit" but Performance says "remove overhead on hot path"):
1. DO NOT output the conflicting findings.
2. Instead, arbitrate the conflict internally as the "Lead Architect".
3. Output a SINGLE finding for that conflict with:
   - \`agentName\`: "Architect"
   - \`severity\`: "info"
   - \`title\`: "[VERDICT] {Brief description}"
   - \`description\`: "Decision: {What to do}\\nTradeoff: {Cost accepted}\\nConfidence: {0-100%}\\nLosing side: {Which lens was rejected}"
   - \`tags\`: ["architectural-decision"]
`
}

/**
 * A drop-in IAgent whose .analyze runs all domains in one provider call.
 * Carries a synthetic name for logging; real attribution comes from each
 * finding's agentName field.
 */
export class CombinedAnalyzer implements IAgent {
  readonly name: AgentName = 'combined' as AgentName
  readonly domain = 'combined'
  private readonly domains: DomainSpec[]

  constructor(domains?: DomainSpec[]) {
    this.domains = domains ?? DEFAULT_DOMAINS
  }

  async analyze(
    chunks: CodeChunk[],
    context: AgentContext,
    signal?: AbortSignal
  ): Promise<AgentFinding[]> {
    try {
      const provider = getProvider('primary')
      const systemPrompt = buildSystemPrompt(
        buildCombinedSystemPrompt(this.domains),
        context,
        context.modeConfig
      )
      const userPrompt = buildChunkContext(chunks)
      // A single call has to fit findings for every domain, so the output
      // budget must scale with how many domains are combined into it — a flat
      // cap starves runs with more domains and truncates the JSON array.
      const maxTokens = Math.max(8192, this.domains.length * 1500)
      const response = await provider.complete({
        systemPrompt,
        userPrompt,
        maxTokens,
        signal,
      })
      const findings = attributeFindings(
        parseFindingsResponse(response.content ?? '', this.name),
        this.domains,
        response.provider,
        response.model
      )
      const validated = validateAndFingerprintFindings(findings, chunks)
      annotateComplexity(validated, chunks)
      return verifyCriticalHighFindings(validated, chunks, provider, this.name, signal)
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return []
      throw err
    }
  }
}

/**
 * Attribute combined-pass findings to their declared domain and apply severity
 * penalties. Pure (no provider, no network) so it can be unit-tested directly.
 *
 * The model is instructed to set agentName per finding; if it omits one or
 * invents one, the finding is DROPPED rather than filed under a wrong domain —
 * a misattributed finding would distort the per-category score breakdown.
 */
export function attributeFindings(
  findings: AgentFinding[],
  domains: DomainSpec[],
  provider?: string,
  model?: string
): AgentFinding[] {
  const validNames = new Set(domains.map((d) => d.name))
  validNames.add('Architect' as AgentName) // Allow verdicts in economy mode

  const attributed: AgentFinding[] = []
  for (const f of findings) {
    if (!validNames.has(f.agentName)) continue
    f.provider = provider
    f.model = model
    f.scorePenalty = SEVERITY_PENALTY[f.severity as Severity]
    attributed.push(f)
  }
  return attributed
}
